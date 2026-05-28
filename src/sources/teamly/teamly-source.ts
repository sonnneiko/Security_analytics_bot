import { Driver } from 'ydb-sdk'
import { logger } from '../../logger.js'
import { insertEvent } from '../../database/queries/teamly-events.js'
import { buildEvent, type WebhookInput } from './event-builder.js'
import type { TeamlyApi } from './teamly-api.js'

export interface TeamlySourceDeps {
  resolveTelegramId: (teamlyUserId: string) => number | null
}

export class TeamlySource {
  readonly name = 'teamly' as const

  constructor(
    private readonly driver: Driver,
    private readonly api: TeamlyApi,
    private readonly deps: TeamlySourceDeps,
  ) {}

  async handle(input: WebhookInput): Promise<void> {
    let ev
    try {
      ev = await buildEvent(input, {
        resolveTelegramId: this.deps.resolveTelegramId,
        getArticleAuthor: (id) => this.api.getArticleAuthor(id),
      })
    } catch (err) {
      logger.error(
        { err, entityId: input.entityId, entityType: input.entityType },
        'teamly buildEvent threw',
      )
      return
    }
    if (!ev) {
      logger.debug(
        { entityId: input.entityId, entityType: input.entityType },
        'teamly event dropped (author not resolved or not an SB employee)',
      )
      return
    }
    try {
      await insertEvent(this.driver, ev)
      logger.debug(
        { event_id: ev.event_id, employee_id: ev.employee_id },
        'teamly event saved',
      )
    } catch (err) {
      logger.error({ err, event_id: ev.event_id }, 'teamly insertEvent failed')
    }
  }
}
