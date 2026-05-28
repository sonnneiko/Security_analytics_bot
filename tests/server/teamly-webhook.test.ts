import { describe, it, expect, vi } from 'vitest'
import { teamlyWebhookRoute } from '../../src/server/teamly-webhook.js'

const sampleArticle = {
  entityId: 'art-1',
  entityType: 'article',
  action: 'create',
  content: { containerId: 'space-1' },
}
const sampleComment = {
  entityId: 'cmt-1',
  entityType: 'comment',
  action: 'create',
  content: { createdBy: 'user-teamly-uuid' },
}
const ignored = { entityId: 'sp-1', entityType: 'space', action: 'create', content: {} }

function makeSource() {
  const handle = vi.fn().mockResolvedValue(undefined)
  return { handle } as unknown as Parameters<typeof teamlyWebhookRoute>[1]
}

const SECRET = 'a'.repeat(32)

describe('teamlyWebhookRoute', () => {
  it('404 on wrong secret', async () => {
    const app = teamlyWebhookRoute(SECRET, makeSource())
    const res = await app.request('/teamly/webhook/bad', { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
  })

  it('200 + enqueues article.create', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleArticle),
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect((source.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1))
    const call = (source.handle as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.entityType).toBe('article')
    expect(call.entityId).toBe('art-1')
  })

  it('200 + ignores non-article/comment', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ignored),
    })
    expect(res.status).toBe(200)
    // Give the queue a tick to confirm it really doesn't fire
    await new Promise((r) => setTimeout(r, 10))
    expect(source.handle).not.toHaveBeenCalled()
  })

  it('200 + enqueues tbd.body.create (карточка)', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entityId: 'card-1',
        entityType: 'tbd.body',
        action: 'create',
        content: { containerId: 'tbd-1' },
      }),
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect((source.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1))
    expect((source.handle as ReturnType<typeof vi.fn>).mock.calls[0][0].entityType).toBe('tbd.body')
  })

  it('200 + enqueues comment.create', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleComment),
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect((source.handle as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1))
  })

  it('400 on invalid json', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })
})
