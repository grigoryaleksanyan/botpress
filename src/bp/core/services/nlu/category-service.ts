import * as sdk from 'botpress/sdk'
import { FlowView } from 'common/typings'
import { sanitizeFileName } from 'core/misc/utils'
import _ from 'lodash'

import { GhostService } from '..'

import { NLUService } from './nlu-service'

const CATEGORY_DIR = './category'

export class CategoryService {
  constructor(private ghostService: GhostService, private nluService: NLUService) {}

  private async categoryExists(botId: string, categoryName: string): Promise<boolean> {
    return this.ghostService.forBot(botId).fileExists(CATEGORY_DIR, `${categoryName}.json`)
  }

  public async getСategories(botId: string): Promise<sdk.NLU.IntentDefinition[]> {
    const categoryNames = await this.ghostService.forBot(botId).directoryListing(CATEGORY_DIR, '*.json')
    return Promise.map(categoryNames, n => this.getСategory(botId, n))
  }

  public async getСategory(botId: string, categoryNames: string): Promise<sdk.NLU.IntentDefinition> {
    categoryNames = sanitizeFileName(categoryNames)
    if (categoryNames.length < 1) {
      throw new Error('Invalid сategory name, expected at least one character')
    }

    if (!(await this.categoryExists(botId, categoryNames))) {
      throw new Error('Сategory does not exist')
    }
    return this.ghostService.forBot(botId).readFileAsObject(CATEGORY_DIR, `${categoryNames}.json`)
  }

  public async saveCategory(botId: string, category: sdk.NLU.Category): Promise<sdk.NLU.Category> {
    if (await this.categoryExists(botId, category.name)) {
      throw new Error('Категория с таким именем уже существует.')
    }
    const name = sanitizeFileName(category.name)
    if (name.length < 1) {
      throw new Error('Название категории, должно содержать как минимум один символ.')
    }

    //const availableEntities = await this.nluService.entities.getEntities(botId)

    // _.chain(intent.slots)
    //   .flatMap('entities')
    //   .uniq()
    //   .forEach(entity => {
    //     if (!availableEntities.find(e => e.name === entity)) {
    //       throw Error(`"${entity}" is neither a system entity nor a custom entity`)
    //     }
    //   })

    await this.ghostService
      .forBot(botId)
      .upsertFile(CATEGORY_DIR, `${name}.json`, JSON.stringify(category, undefined, 2))
    console.log('Созданная категория: ', category)
    return category
  }
}
