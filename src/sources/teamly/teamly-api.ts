import { logger } from '../../logger.js'

export interface TeamlyApiConfig {
  slug: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface TokenStore {
  get(): Promise<{
    access_token: string
    refresh_token: string
    access_expires_at: Date
    refresh_expires_at: Date
    cluster_domain: string
  } | null>
  save(row: {
    access_token: string
    refresh_token: string
    access_expires_at: Date
    refresh_expires_at: Date
    cluster_domain: string
  }): Promise<void>
}

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000

export class TeamlyApi {
  constructor(
    private readonly cfg: TeamlyApiConfig,
    private readonly store: TokenStore,
  ) {}

  async exchangeCode(code: string): Promise<void> {
    const url = `https://${this.cfg.slug}.teamly.ru/api/v1/auth/integration/authorize`
    const body = {
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      redirect_uri: this.cfg.redirectUri,
      code,
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`teamly exchangeCode failed: ${res.status} ${await res.text()}`)
    }
    await this.persistTokens(await res.json())
  }

  async getArticleAuthor(articleId: string): Promise<string | null> {
    await this.ensureFreshToken()
    const tokens = await this.store.get()
    if (!tokens) throw new Error('teamly tokens missing after refresh')

    // NOTE: undocumented endpoint. Request/response shape is the spec
    // hypothesis (analogous to /wiki/ql/space). Verify via Chunk 0 spike
    // and adjust this method only if shape differs.
    const url = `${tokens.cluster_domain}/api/v1/wiki/ql/article`
    const body = {
      query: {
        __filter: { id: articleId },
        id: true,
        author: { id: true, fullName: true },
      },
    }
    const res = await this.callWithRetry(url, tokens.access_token, body)
    if (!res) return null
    const r = res as Record<string, any>
    const item = r.items?.[0] ?? r.item ?? r
    const authorId: unknown = item?.author?.id
    if (typeof authorId !== 'string') {
      logger.warn({ articleId, response: r }, 'teamly: author id missing in response')
      return null
    }
    return authorId
  }

  private async callWithRetry(
    url: string,
    accessToken: string,
    body: unknown,
  ): Promise<unknown | null> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Account-Slug': this.cfg.slug,
      'Content-Type': 'application/json',
    }
    let res: Response
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      if (res.status >= 500) throw new Error(`5xx: ${res.status}`)
    } catch (err) {
      logger.warn({ err, url }, 'teamly api 5xx/network — retry once in 2s')
      await new Promise((r) => setTimeout(r, 2000))
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    }
    if (res.status === 401) {
      throw new Error(`teamly api 401 unauthorized on ${url}`)
    }
    if (!res.ok) {
      logger.warn({ status: res.status, url }, 'teamly api non-ok, returning null')
      return null
    }
    return res.json()
  }

  private async ensureFreshToken(): Promise<void> {
    const t = await this.store.get()
    if (!t) throw new Error('teamly tokens not initialized')
    if (t.access_expires_at.getTime() - Date.now() > REFRESH_THRESHOLD_MS) return
    await this.refresh(t.refresh_token)
  }

  private async refresh(refreshToken: string): Promise<void> {
    const url = `https://${this.cfg.slug}.teamly.ru/api/v1/auth/integration/refresh`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) {
      throw new Error(`teamly refresh failed: ${res.status} ${await res.text()}`)
    }
    await this.persistTokens(await res.json())
  }

  private async persistTokens(payload: any): Promise<void> {
    // Teamly doc has typo `acces_token` (one s) in example; defend against both.
    const access = payload.access_token ?? payload.acces_token
    const account =
      (payload.accounts ?? []).find((a: any) => a.slug === this.cfg.slug) ??
      payload.accounts?.[0]
    const clusterDomain = account?.clusterDomain ?? 'https://app.teamly.ru'
    await this.store.save({
      access_token: access,
      refresh_token: payload.refresh_token,
      access_expires_at: new Date(Number(payload.access_token_expires_at) * 1000),
      refresh_expires_at: new Date(Number(payload.refresh_token_expires_at) * 1000),
      cluster_domain: clusterDomain,
    })
  }
}
