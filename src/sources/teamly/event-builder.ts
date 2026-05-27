import type { TeamlyEventRow } from '../../database/queries/teamly-events.js'

export interface WebhookInput {
  entityType: 'article' | 'comment'
  action: 'create'
  entityId: string
  content: Record<string, unknown>
  occurredAt: Date
  raw: unknown
}

export interface BuildDeps {
  resolveTelegramId: (teamlyUserId: string) => number | null
  getArticleAuthor: (articleId: string) => Promise<string | null>
}

export async function buildEvent(
  input: WebhookInput,
  deps: BuildDeps,
): Promise<TeamlyEventRow | null> {
  let teamlyUserId: string | null = null
  let containerId: string | null = null

  if (input.entityType === 'comment') {
    const createdBy = input.content?.createdBy
    teamlyUserId = typeof createdBy === 'string' ? createdBy : null
  } else {
    teamlyUserId = await deps.getArticleAuthor(input.entityId)
    const container = input.content?.containerId
    containerId = typeof container === 'string' ? container : null
  }

  if (!teamlyUserId) return null

  const employeeId = deps.resolveTelegramId(teamlyUserId)
  if (employeeId == null) return null

  const eventType = input.entityType === 'comment' ? 'comment_create' : 'article_create'
  return {
    event_id: `${eventType}:${input.entityId}`,
    employee_id: employeeId,
    teamly_user_id: teamlyUserId,
    event_type: eventType,
    entity_id: input.entityId,
    container_id: containerId,
    occurred_at: input.occurredAt,
    payload: (input.raw as Record<string, unknown>) ?? {},
  }
}
