import { Hono } from 'hono'
import { logger } from '../logger.js'
import type { TeamlySource } from '../sources/teamly/teamly-source.js'
import { WebhookQueue } from './webhook-queue.js'
import type { WebhookInput } from '../sources/teamly/event-builder.js'

interface RawTeamlyPayload {
  entityId?: string
  entityIds?: string[]
  entityType?: string
  action?: string
  content?: Record<string, unknown>
}

export function teamlyWebhookRoute(secret: string, source: TeamlySource): Hono {
  const queue = new WebhookQueue<WebhookInput>((input) => source.handle(input))
  const app = new Hono()

  app.post(`/teamly/webhook/${secret}`, async (c) => {
    let raw: RawTeamlyPayload
    try {
      raw = await c.req.json()
    } catch {
      return c.body(null, 400)
    }
    logger.debug(
      { entityType: raw.entityType, action: raw.action, entityId: raw.entityId },
      'teamly webhook received',
    )
    const accepted = parsePayload(raw)
    if (accepted) queue.push(accepted)
    return c.body(null, 200)
  })

  return app
}

const ACCEPTED_TYPES = new Set(['article', 'comment', 'tbd.body'])

function parsePayload(raw: RawTeamlyPayload): WebhookInput | null {
  if (raw.action !== 'create') return null
  if (!raw.entityType || !ACCEPTED_TYPES.has(raw.entityType)) return null
  if (typeof raw.entityId !== 'string') {
    logger.warn({ raw }, 'teamly webhook: missing entityId')
    return null
  }
  return {
    entityType: raw.entityType as WebhookInput['entityType'],
    action: 'create',
    entityId: raw.entityId,
    content: raw.content ?? {},
    occurredAt: new Date(),
    raw,
  }
}
