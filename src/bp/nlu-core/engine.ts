import { MLToolkit, NLU } from 'botpress/sdk'
import bytes from 'bytes'
import _ from 'lodash'
import LRUCache from 'lru-cache'
import sizeof from 'object-sizeof'

import { deserializeKmeans } from './clustering'
import { EntityCacheManager } from './entities/entity-cache-manager'
import { initializeTools } from './initialize-tools'
import DetectLanguage from './language/language-identifier'
import makeSpellChecker from './language/spell-checker'
import modelIdService from './model-id-service'
import { deserializeModel, PredictableModel, serializeModel } from './model-serializer'
import { Predict, PredictInput, Predictors } from './predict-pipeline'
import SlotTagger from './slots/slot-tagger'
import { isPatternValid } from './tools/patterns-utils'
import { ProcessIntents, TrainInput, TrainOutput } from './training-pipeline'
import { TrainingWorkerQueue } from './training-worker-queue'
import { EntityCacheDump, ListEntity, PatternEntity, Tools } from './typings'
import { preprocessRawUtterance } from './utterance/utterance'
import { getModifiedContexts, mergeModelOutputs } from './warm-training-handler'

const trainDebug = DEBUG('nlu').sub('training')
const lifecycleDebug = DEBUG('nlu').sub('lifecycle')
const debugPredict = DEBUG('nlu').sub('extract')

interface LoadedModel {
  model: PredictableModel
  predictors: Predictors
  entityCache: EntityCacheManager
}

const DEFAULT_TRAINING_OPTIONS: NLU.TrainingOptions = {
  progressCallback: () => {},
  previousModel: undefined
}

const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  maxCacheSize: 262144000 // 250mb of model cache
}

interface EngineOptions {
  maxCacheSize: number
}

export default class Engine implements NLU.Engine {
  private _tools!: Tools
  private _trainingWorkerQueue!: TrainingWorkerQueue

  private modelsById: LRUCache<string, LoadedModel>

  constructor(opt?: Partial<EngineOptions>) {
    const options: EngineOptions = { ...DEFAULT_ENGINE_OPTIONS, ...opt }
    this.modelsById = new LRUCache({
      max: options.maxCacheSize,
      length: sizeof // ignores size of functions, but let's assume it's small
    })
    trainDebug(`model cache size is: ${bytes(options.maxCacheSize)}`)
  }

  public getHealth() {
    return this._tools.getHealth()
  }

  public getLanguages() {
    return this._tools.getLanguages()
  }

  public getSpecifications() {
    return this._tools.getSpecifications()
  }

  public async initialize(config: NLU.LanguageConfig, logger: NLU.Logger): Promise<void> {
    this._tools = await initializeTools(config, logger)
    const { nluVersion, languageServer } = this._tools.getSpecifications()
    if (!_.isString(nluVersion) || !this._dictionnaryIsFilled(languageServer)) {
      logger.warning('Either the nlu version or the lang server version is not set correctly.')
    }

    this._trainingWorkerQueue = new TrainingWorkerQueue(config, logger)
  }

  public hasModel(modelId: NLU.ModelId) {
    const stringId = modelIdService.toString(modelId)
    return !!this.modelsById.get(stringId)
  }

  async train(trainId: string, trainSet: NLU.TrainingSet, opt: Partial<NLU.TrainingOptions> = {}): Promise<NLU.Model> {
    const { languageCode, seed, entityDefs, intentDefs } = trainSet
    trainDebug(`[${trainId}] Started ${languageCode} training`)

    const options = { ...DEFAULT_TRAINING_OPTIONS, ...opt }

    const { previousModel: previousModelId, progressCallback } = options
    const previousModel = previousModelId && this.modelsById.get(modelIdService.toString(previousModelId))

    const list_entities = entityDefs
      .filter(ent => ent.type === 'list')
      .map(e => {
        return <ListEntity & { cache: EntityCacheDump }>{
          name: e.name,
          fuzzyTolerance: e.fuzzy,
          sensitive: e.sensitive,
          synonyms: _.chain(e.occurrences)
            .keyBy('name')
            .mapValues('synonyms')
            .value(),
          cache: previousModel?.entityCache.getCache(e.name) || []
        }
      })

    const pattern_entities: PatternEntity[] = entityDefs
      .filter(ent => ent.type === 'pattern' && isPatternValid(ent.pattern))
      .map(ent => ({
        name: ent.name,
        pattern: ent.pattern!,
        examples: [], // TODO add this to entityDef
        matchCase: !!ent.matchCase,
        sensitive: !!ent.sensitive
      }))

    const contexts = _.chain(intentDefs)
      .flatMap(i => i.contexts)
      .uniq()
      .value()

    const intents = intentDefs
      .filter(x => !!x.utterances[languageCode])
      .map(x => ({
        name: x.name,
        contexts: x.contexts,
        utterances: x.utterances[languageCode],
        slot_definitions: x.slots
      }))

    let ctxToTrain = contexts
    if (previousModel) {
      const previousIntents = previousModel.model.data.input.intents
      const contextChangeLog = getModifiedContexts(intents, previousIntents)
      ctxToTrain = [...contextChangeLog.createdContexts, ...contextChangeLog.modifiedContexts]
    }

    const debugMsg = previousModel
      ? `Retraining only contexts: [${ctxToTrain}] for language: ${languageCode}`
      : `Training all contexts for language: ${languageCode}`
    trainDebug(`[${trainId}] ${debugMsg}`)

    const input: TrainInput = {
      trainId,
      nluSeed: seed,
      languageCode,
      list_entities,
      pattern_entities,
      contexts,
      intents,
      ctxToTrain
    }

    const startedAt = new Date()
    const output = await this._trainingWorkerQueue.startTraining(input, progressCallback)

    const modelId = modelIdService.makeId({
      ...trainSet,
      specifications: this.getSpecifications()
    })

    const model: PredictableModel = {
      ...modelId,
      startedAt,
      finishedAt: new Date(),
      data: {
        input,
        output
      }
    }

    if (previousModel) {
      model.data.output = mergeModelOutputs(model.data.output, previousModel.model.data.output, contexts)
    }

    trainDebug(`[${trainId}] Successfully finished ${languageCode} training`)

    return serializeModel(model)
  }

  cancelTraining(trainSessionId: string): Promise<void> {
    return this._trainingWorkerQueue.cancelTraining(trainSessionId)
  }

  async loadModel(serialized: NLU.Model) {
    const stringId = modelIdService.toString(serialized)
    lifecycleDebug(`Load model ${stringId}`)

    if (this.hasModel(serialized)) {
      lifecycleDebug(`Model ${stringId} already loaded.`)
      return
    }

    const model = deserializeModel(serialized)
    const { input, output } = model.data

    const modelCacheItem: LoadedModel = {
      model,
      predictors: await this._makePredictors(input, output),
      entityCache: this._makeCacheManager(output)
    }

    const modelSize = sizeof(modelCacheItem)
    lifecycleDebug(`Size of model ${stringId} is ${bytes(modelSize)}`)

    if (modelSize >= this.modelsById.max) {
      const msg = `Can't load model ${stringId} as it is bigger than the maximum allowed size`
      const details = `model size: ${bytes(modelSize)}, max allowed: ${bytes(this.modelsById.max)}`
      throw new Error(`${msg} (${details}).`)
    }

    this.modelsById.set(stringId, modelCacheItem)
    lifecycleDebug('Model loaded with success')
    lifecycleDebug(`Model cache entries are: [${this.modelsById.keys().join(', ')}]`)
  }

  unloadModel(modelId: NLU.ModelId) {
    const stringId = modelIdService.toString(modelId)
    lifecycleDebug(`Unload model ${stringId}`)

    if (!this.hasModel(modelId)) {
      lifecycleDebug(`No model with id ${stringId} was found in cache.`)
      return
    }

    this.modelsById.del(stringId)
    lifecycleDebug('Model unloaded with success')
  }

  private _makeCacheManager(output: TrainOutput) {
    const cacheManager = new EntityCacheManager()
    const { list_entities } = output
    cacheManager.loadFromData(list_entities)
    return cacheManager
  }

  private async _makePredictors(input: TrainInput, output: TrainOutput): Promise<Predictors> {
    const tools = this._tools

    const { ctx_model, intent_model_by_ctx, oos_model, list_entities, kmeans } = output

    /**
     * TODO: extract this function some place else,
     * Engine's predict() shouldn't be dependant of training pipeline...
     */
    const intents = await ProcessIntents(input.intents, input.languageCode, list_entities, this._tools)

    const warmKmeans = kmeans && deserializeKmeans(kmeans)

    const basePredictors: Predictors = {
      ...output,
      lang: input.languageCode,
      intents,
      pattern_entities: input.pattern_entities,
      kmeans: warmKmeans
    }

    if (_.flatMap(input.intents, i => i.utterances).length <= 0) {
      // we don't want to return undefined as extraction won't be triggered
      // we want to make it possible to extract entities without having any intents
      return basePredictors
    }

    const ctx_classifier = ctx_model ? new tools.mlToolkit.SVM.Predictor(ctx_model) : undefined
    const intent_classifier_per_ctx = _.toPairs(intent_model_by_ctx).reduce(
      (c, [ctx, intentModel]) => ({ ...c, [ctx]: new tools.mlToolkit.SVM.Predictor(intentModel as string) }),
      {} as _.Dictionary<MLToolkit.SVM.Predictor>
    )
    const oos_classifier = _.toPairs(oos_model).reduce(
      (c, [ctx, mod]) => ({ ...c, [ctx]: new tools.mlToolkit.SVM.Predictor(mod) }),
      {} as _.Dictionary<MLToolkit.SVM.Predictor>
    )

    let slot_tagger: SlotTagger | undefined
    if (output.slots_model.length) {
      slot_tagger = new SlotTagger(tools.mlToolkit)
      slot_tagger.load(output.slots_model)
    }

    return {
      ...basePredictors,
      ctx_classifier,
      oos_classifier_per_ctx: oos_classifier,
      intent_classifier_per_ctx,
      slot_tagger
    }
  }

  async predict(text: string, modelId: NLU.ModelId): Promise<NLU.PredictOutput> {
    debugPredict(`Predict for input: "${text}"`)

    const stringId = modelIdService.toString(modelId)
    const loaded = this.modelsById.get(stringId)
    if (!loaded) {
      throw new Error(`model ${stringId} not loaded`)
    }

    const language = loaded.model.languageCode
    return Predict(
      {
        language,
        text
      },
      this._tools,
      loaded.predictors
    )
  }

  async spellCheck(sentence: string, modelId: NLU.ModelId) {
    const stringId = modelIdService.toString(modelId)
    const loaded = this.modelsById.get(stringId)
    if (!loaded) {
      throw new Error(`model ${stringId} not loaded`)
    }

    const preprocessed = preprocessRawUtterance(sentence)
    const spellChecker = makeSpellChecker(
      Object.keys(loaded.predictors.vocabVectors),
      loaded.model.languageCode,
      this._tools
    )
    return spellChecker(preprocessed)
  }

  async detectLanguage(text: string, modelsByLang: _.Dictionary<NLU.ModelId>): Promise<string> {
    debugPredict(`Detecting language for input: "${text}"`)

    const predictorsByLang = _.mapValues(modelsByLang, id => {
      const stringId = modelIdService.toString(id)
      return this.modelsById.get(stringId)?.predictors
    })

    if (!this._dictionnaryIsFilled(predictorsByLang)) {
      const missingLangs = _(predictorsByLang)
        .pickBy(pred => _.isUndefined(pred))
        .keys()
        .value()
      throw new Error(`No models loaded for the following languages: [${missingLangs.join(', ')}]`)
    }
    return DetectLanguage(text, predictorsByLang, this._tools)
  }

  // TODO: this should go someplace else, but I find it very handy
  private _dictionnaryIsFilled = <T>(dictionnary: { [key: string]: T | undefined }): dictionnary is Dic<T> => {
    return !Object.values(dictionnary).some(_.isUndefined)
  }
}
