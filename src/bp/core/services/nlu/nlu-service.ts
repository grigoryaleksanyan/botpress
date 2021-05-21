import { Logger } from 'botpress/sdk'
import { TYPES } from 'core/types'
import { inject, injectable, tagged } from 'inversify'
import _ from 'lodash'

import { GhostService } from '..'

import { CategoryService } from './category-service'
import { EntityService } from './entities-service'
import { IntentService } from './intent-service'

@injectable()
export class NLUService {
  public entities: EntityService
  public intents: IntentService
  public category: CategoryService

  constructor(
    @inject(TYPES.Logger)
    @tagged('name', 'NLUService')
    private logger: Logger,
    @inject(TYPES.GhostService)
    private ghostService: GhostService
  ) {
    this.entities = new EntityService(this.ghostService, this)
    this.intents = new IntentService(this.ghostService, this)
    this.category = new CategoryService(this.ghostService, this)
  }
}
