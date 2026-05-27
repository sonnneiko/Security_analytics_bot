import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TeamlyApi } from '../../../src/sources/teamly/teamly-api.js'

const baseConfig = {
  slug: 'unitpay',
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'http://test.local',
}

interface StoredTokens {
  access_token: string
  refresh_token: string
  access_expires_at: Date
  refresh_expires_at: Date
  cluster_domain: string
}

describe('TeamlyApi', () => {
  let store: { tokens: StoredTokens | null; get(): Promise<StoredTokens | null>; save(t: StoredTokens): Promise<void> }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    store = {
      tokens: null,
      async get() {
        return this.tokens
      },
      async save(t) {
        this.tokens = t
      },
    }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('exchangeCode persists tokens to store', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'A',
          refresh_token: 'R',
          access_token_expires_at: '1900000000',
          refresh_token_expires_at: '1901000000',
          accounts: [{ slug: 'unitpay', clusterDomain: 'https://app.teamly.ru' }],
        }),
        { status: 200 },
      ),
    )

    const api = new TeamlyApi(baseConfig, store)
    await api.exchangeCode('one-time-code')

    expect(store.tokens?.access_token).toBe('A')
    expect(store.tokens?.cluster_domain).toBe('https://app.teamly.ru')
  })

  it('getArticleAuthor returns author id from response', async () => {
    store.tokens = {
      access_token: 'A',
      refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 3600_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ id: 'art-1', author: { id: 'usr-42', fullName: 'X' } }],
        }),
        { status: 200 },
      ),
    )

    const api = new TeamlyApi(baseConfig, store)
    const author = await api.getArticleAuthor('art-1')
    expect(author).toBe('usr-42')
  })

  it('refreshes when access_token expires soon', async () => {
    store.tokens = {
      access_token: 'old',
      refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 60_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'NEW',
          refresh_token: 'R2',
          access_token_expires_at: '1900000000',
          refresh_token_expires_at: '1901000000',
          accounts: [{ slug: 'unitpay', clusterDomain: 'https://app.teamly.ru' }],
        }),
        { status: 200 },
      ),
    )
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [{ id: 'art-1', author: { id: 'usr-7' } }] }), {
        status: 200,
      }),
    )

    const api = new TeamlyApi(baseConfig, store)
    await api.getArticleAuthor('art-1')
    expect(store.tokens?.access_token).toBe('NEW')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null when article not found (empty items)', async () => {
    store.tokens = {
      access_token: 'A',
      refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 3600_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )

    const api = new TeamlyApi(baseConfig, store)
    const author = await api.getArticleAuthor('missing')
    expect(author).toBeNull()
  })

  it('throws on 401 to surface auth problems', async () => {
    store.tokens = {
      access_token: 'A',
      refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 3600_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))

    const api = new TeamlyApi(baseConfig, store)
    await expect(api.getArticleAuthor('art-1')).rejects.toThrow(/401/)
  })
})
