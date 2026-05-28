import { describe, it, expect } from 'vitest'
import { buildEvent, type WebhookInput } from '../../../src/sources/teamly/event-builder.js'

const ANI_TG = 6300594719
const ANI_TEAMLY = 'teamly-uuid-ani'

const deps = {
  resolveTelegramId: (teamlyId: string) => (teamlyId === ANI_TEAMLY ? ANI_TG : null),
}

describe('buildEvent — comment', () => {
  it('builds comment_create event when author is SB', async () => {
    const input: WebhookInput = {
      entityType: 'comment',
      action: 'create',
      entityId: 'cmt-1',
      content: { createdBy: ANI_TEAMLY, forSource: { sourceId: 'art-9' } },
      occurredAt: new Date('2026-05-27T10:00:00Z'),
      raw: {},
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toMatchObject({
      event_id: 'comment_create:cmt-1',
      employee_id: ANI_TG,
      teamly_user_id: ANI_TEAMLY,
      event_type: 'comment_create',
      entity_id: 'cmt-1',
      container_id: null,
    })
  })

  it('drops comment when author is not SB', async () => {
    const input: WebhookInput = {
      entityType: 'comment',
      action: 'create',
      entityId: 'cmt-2',
      content: { createdBy: 'unknown', forSource: { sourceId: 'art-9' } },
      occurredAt: new Date(),
      raw: {},
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toBeNull()
  })
})

describe('buildEvent — article', () => {
  it('builds article_create after dochitka when author is SB', async () => {
    const input: WebhookInput = {
      entityType: 'article',
      action: 'create',
      entityId: 'art-1',
      content: { containerId: 'space-1' },
      occurredAt: new Date('2026-05-27T10:00:00Z'),
      raw: { entityType: 'article' },
    }
    const ev = await buildEvent(input, {
      ...deps,
      getArticleAuthor: async (id) => (id === 'art-1' ? ANI_TEAMLY : null),
    })
    expect(ev).toMatchObject({
      event_id: 'article_create:art-1',
      employee_id: ANI_TG,
      teamly_user_id: ANI_TEAMLY,
      event_type: 'article_create',
      entity_id: 'art-1',
      container_id: 'space-1',
    })
  })

  it('drops article when getArticleAuthor returns null', async () => {
    const input: WebhookInput = {
      entityType: 'article',
      action: 'create',
      entityId: 'art-x',
      content: { containerId: 'space-1' },
      occurredAt: new Date(),
      raw: {},
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toBeNull()
  })

  it('drops article when author is not SB', async () => {
    const input: WebhookInput = {
      entityType: 'article',
      action: 'create',
      entityId: 'art-y',
      content: { containerId: 'space-1' },
      occurredAt: new Date(),
      raw: {},
    }
    const ev = await buildEvent(input, {
      ...deps,
      getArticleAuthor: async () => 'other-teamly-uuid',
    })
    expect(ev).toBeNull()
  })
})

describe('buildEvent — tbd.body (карточка умной таблицы)', () => {
  it('builds article_create from tbd.body via getArticleAuthor dochitka', async () => {
    const input: WebhookInput = {
      entityType: 'tbd.body',
      action: 'create',
      entityId: 'card-1',
      content: { containerId: 'tbd-1' },
      occurredAt: new Date('2026-05-28T10:00:00Z'),
      raw: { entityType: 'tbd.body' },
    }
    const ev = await buildEvent(input, {
      ...deps,
      getArticleAuthor: async (id) => (id === 'card-1' ? ANI_TEAMLY : null),
    })
    expect(ev).toMatchObject({
      event_id: 'article_create:card-1',
      employee_id: ANI_TG,
      teamly_user_id: ANI_TEAMLY,
      event_type: 'article_create',
      entity_id: 'card-1',
      container_id: 'tbd-1',
    })
  })

  it('drops tbd.body when card was deleted (author 404 → null)', async () => {
    const input: WebhookInput = {
      entityType: 'tbd.body',
      action: 'create',
      entityId: 'gone',
      content: { containerId: 'tbd-1' },
      occurredAt: new Date(),
      raw: {},
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toBeNull()
  })
})
