# Teamly Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Teamly source to the bot — collect `article.create` and `comment.create` webhook events with author attribution, persist to YDB, surface in `/report`.

**Architecture:** Webhook event-stream (mirror of `TelegramSource`). Hono HTTP server receives webhooks → in-process queue → worker resolves author (`createdBy` from payload for comments, undocumented `/api/v1/wiki/ql/article` GET for articles) → UPSERT into `teamly_events` keyed on `event_id`. OAuth2 tokens stored in `teamly_tokens` (single row), refreshed lazily.

**Tech Stack:** Node 20+ / TypeScript / Hono (new) / grammY (existing) / YDB / vitest / valibot / pino.

**Spec:** [`docs/superpowers/specs/2026-05-27-teamly-integration-design.md`](../specs/2026-05-27-teamly-integration-design.md). Read this before starting.

---

## Chunk 0: Spike — verify the two unknowns

**Why first:** the spec depends on two unverified hypotheses (1: cards in smart tables come as `article.create`, not `tbd.body.create`; 2: schema of undocumented `POST /api/v1/wiki/ql/article`). If either is wrong, the plan changes. ~1 hour.

This chunk is mostly **manual** — requires Teamly UI access. Code outputs go in `docs/teamly/06-spike-2026-05-27.md`.

### Task 0.1: Generate webhook secret and prep capture URL

- [ ] **Step 1:** Generate secret locally — `openssl rand -hex 32`. Save it; will become `TEAMLY_WEBHOOK_SECRET`.
- [ ] **Step 2:** Open https://webhook.site in a browser. Copy the personal URL it gives you (looks like `https://webhook.site/abc-def-...`). This is the capture endpoint — it shows incoming POST bodies in the browser, no server needed.

### Task 0.2: Register webhook in Teamly

- [ ] **Step 1:** Teamly UI → Управление аккаунтом → Интеграция → Webhook → Добавить webhook.
- [ ] **Step 2:** URL = the webhook.site URL from Task 0.1. Description: "spike". Subscribe to events: `article.create`, `tbd.body.create`, `comment.create`, `property.update_value`.
- [ ] **Step 3:** Save.

### Task 0.3: Trigger test events and capture payloads

- [ ] **Step 1:** In Teamly, open the smart table "Дашборд взаимодействия СБ/Аккаунтинг" (or any test table). Create a new card. Wait ~5 seconds.
- [ ] **Step 2:** In the same table, create a new wiki article under any space. Wait.
- [ ] **Step 3:** On the test card, leave a comment. Wait.
- [ ] **Step 4:** Switch to webhook.site. Look at the list of incoming requests. For each request, copy the JSON body.

### Task 0.4: Document the findings

- [ ] **Step 1:** Create file `docs/teamly/06-spike-2026-05-27.md`. Paste the captured payloads, one per section: `### article.create`, `### tbd.body.create` (if any arrived), `### comment.create`, `### property.update_value` (if any arrived).

- [ ] **Step 2:** Answer two questions explicitly at the top of the doc:

  **Q1: Did creating a smart table card fire `article.create` or `tbd.body.create`?**
  - If `article.create` → ✅ spec hypothesis confirmed, continue.
  - If `tbd.body.create` only → ❌ STOP. Re-open the spec, expand filter to include `tbd.body.create`, but note we cannot resolve the author (no public GET endpoint). Discuss with user before continuing.
  - If both → ✅ but document the duplication; filter logic must dedupe by entity uuid.

  **Q2: Does `comment.create` payload include `createdBy`?**
  - Verify it matches the doc schema.

### Task 0.5: Probe the undocumented `/api/v1/wiki/ql/article` endpoint

This requires OAuth tokens. Do a one-off curl spike before writing the TS client.

- [ ] **Step 1:** Make sure `.env` has `TEAMLY_SLUG`, `TEAMLY_CLIENT_ID`, `TEAMLY_CLIENT_SECRET`, `TEAMLY_REDIRECT_URI`, `TEAMLY_AUTH_CODE`. (See [docs/teamly/01-auth.md](../../teamly/01-auth.md).) If `TEAMLY_AUTH_CODE` is already burned, regenerate the integration in Teamly UI to get a new one.

- [ ] **Step 2:** Run curl to exchange code → tokens. Replace placeholders:

```bash
curl -s -X POST "https://${TEAMLY_SLUG}.teamly.ru/api/v1/auth/integration/authorize" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"${TEAMLY_CLIENT_ID}\",\"client_secret\":\"${TEAMLY_CLIENT_SECRET}\",\"redirect_uri\":\"${TEAMLY_REDIRECT_URI}\",\"code\":\"${TEAMLY_AUTH_CODE}\"}" | jq .
```

Expected: JSON with `access_token`, `accounts[0].clusterDomain`. Save `access_token` and `clusterDomain` to env or shell vars for next step.

- [ ] **Step 3:** With an `entityId` from the captured `article.create` payload (Task 0.3), probe the article GET schema. Start with hypothesis 1:

```bash
ACCESS="<paste access_token>"
DOMAIN="<paste clusterDomain, e.g. https://app.teamly.ru>"
ARTICLE_ID="<paste entityId from article.create>"

curl -s -X POST "${DOMAIN}/api/v1/wiki/ql/article" \
  -H "Authorization: Bearer ${ACCESS}" \
  -H "X-Account-Slug: ${TEAMLY_SLUG}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":{\"__filter\":{\"id\":\"${ARTICLE_ID}\"},\"id\":true,\"author\":{\"id\":true,\"fullName\":true}}}" | jq .
```

- [ ] **Step 4:** Document the result in `06-spike-2026-05-27.md` under `### article-by-id endpoint`. If response has `author.id`, save the exact request shape. If it errored, try the plan-B variants from spec:
  - `POST /api/v1/wiki/ql/articles` with `__filter.id` and same fields, plus `__pagination`.
  - Same with `__filter.ids: [<uuid>]`.
  - Try field name variants for author: `author{ id }`, `created_by{ id }`, `createdBy{ id }`.

- [ ] **Step 5:** If nothing works → log the failure in the doc and surface to user. Plan B fallback (write events with `employee_id = NULL`) is still viable but reports will be incomplete.

### Task 0.6: Commit spike doc

- [ ] **Step 1:**

```bash
git add docs/teamly/06-spike-2026-05-27.md
git commit -m "docs(teamly): spike — confirm webhook + article-by-id schema"
```

- [ ] **Step 2:** Delete the spike webhook in Teamly UI (Task 0.2). Will register the real one (against bot) later.

### Task 0.7: Explicit checkpoint — confirm with user before continuing

- [ ] **Step 1:** Paste a summary of `docs/teamly/06-spike-2026-05-27.md` answers (Q1, Q2, article-by-id request shape, sample response) back to the user. Ask: «Спайк прошёл. Подтверждаешь findings — продолжаю с Chunk 1?»

- [ ] **Step 2:** Wait for explicit confirmation. If user says findings differ from spec hypotheses, STOP and update the spec before continuing.

---

## Chunk 1: YDB migrations + queries

Two new tables. Mirrors existing `telegram-events.ts` shape.

### Task 1.1: Add migration 004 and 005

**File:** `src/database/migrations.ts`

- [ ] **Step 0:** Read the current `src/database/migrations.ts` first. Confirm `MIGRATIONS` is a `{name, ddl}[]` array (yes — that's the convention as of 003_telegram_events; INDEX clause is part of `CREATE TABLE` body, same multi-statement style works).

- [ ] **Step 1:** Append two entries to `MIGRATIONS` array (after `003_telegram_events`):

```ts
{
  name: '004_teamly_events',
  ddl: `
    CREATE TABLE IF NOT EXISTS teamly_events (
      event_id         Utf8,
      employee_id      Uint64,
      teamly_user_id   Utf8,
      event_type       Utf8,
      entity_id        Utf8,
      container_id     Utf8,
      occurred_at      Timestamp,
      payload          Json,
      PRIMARY KEY (event_id),
      INDEX idx_employee_time GLOBAL ON (employee_id, occurred_at)
    )
  `,
},
{
  name: '005_teamly_tokens',
  ddl: `
    CREATE TABLE IF NOT EXISTS teamly_tokens (
      id                   Utf8,
      access_token         Utf8,
      refresh_token        Utf8,
      access_expires_at    Timestamp,
      refresh_expires_at   Timestamp,
      cluster_domain       Utf8,
      updated_at           Timestamp,
      PRIMARY KEY (id)
    )
  `,
},
```

- [ ] **Step 2:** Run `npm run dev` once locally to verify migrations apply against dev YDB. Expected logs: `"migration applied" {name:"004_teamly_events"}` and `005_teamly_tokens`. Stop bot after seeing them.

### Task 1.2: Create `teamly-tokens` queries

**File:** `src/database/queries/teamly-tokens.ts` (new)

> **Convention note for the YDB SDK:** snake_case column names in DDL are exposed as camelCase on result row objects (e.g. `access_token` → `row.accessToken`). The same mapping is used in `employees.ts`. Don't "fix" it.

- [ ] **Step 1:** Write the file:

```ts
import { Driver, TypedValues } from 'ydb-sdk'

export interface TeamlyTokenRow {
  access_token: string
  refresh_token: string
  access_expires_at: Date
  refresh_expires_at: Date
  cluster_domain: string
}

async function drainOne(execResult: {
  resultSets: AsyncGenerator<{ rows: AsyncGenerator<Record<string, unknown>, void> }>
  opFinished: Promise<void>
}): Promise<Record<string, unknown> | null> {
  let row: Record<string, unknown> | null = null
  for await (const rs of execResult.resultSets) {
    for await (const r of rs.rows) {
      if (row === null) row = r
    }
  }
  await execResult.opFinished
  return row
}

export async function getToken(driver: Driver): Promise<TeamlyTokenRow | null> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          SELECT access_token, refresh_token, access_expires_at, refresh_expires_at, cluster_domain
          FROM teamly_tokens WHERE id = 'default';
        `,
      })
      const row = await drainOne(res)
      if (!row) return null
      return {
        access_token: row.accessToken as string,
        refresh_token: row.refreshToken as string,
        access_expires_at: row.accessExpiresAt as Date,
        refresh_expires_at: row.refreshExpiresAt as Date,
        cluster_domain: row.clusterDomain as string,
      }
    },
  })
}

export async function saveToken(driver: Driver, row: TeamlyTokenRow): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $access AS Utf8;
          DECLARE $refresh AS Utf8;
          DECLARE $access_exp AS Timestamp;
          DECLARE $refresh_exp AS Timestamp;
          DECLARE $domain AS Utf8;
          DECLARE $now AS Timestamp;
          UPSERT INTO teamly_tokens
            (id, access_token, refresh_token, access_expires_at, refresh_expires_at, cluster_domain, updated_at)
          VALUES
            ('default', $access, $refresh, $access_exp, $refresh_exp, $domain, $now);
        `,
        parameters: {
          $access: TypedValues.utf8(row.access_token),
          $refresh: TypedValues.utf8(row.refresh_token),
          $access_exp: TypedValues.timestamp(row.access_expires_at),
          $refresh_exp: TypedValues.timestamp(row.refresh_expires_at),
          $domain: TypedValues.utf8(row.cluster_domain),
          $now: TypedValues.timestamp(new Date()),
        },
      })
      await res.opFinished
    },
  })
}
```

### Task 1.3: Create `teamly-events` queries

**File:** `src/database/queries/teamly-events.ts` (new)

- [ ] **Step 1:**

```ts
import { Driver, TypedValues, Types } from 'ydb-sdk'

export type TeamlyEventType = 'article_create' | 'comment_create'

export interface TeamlyEventRow {
  event_id: string
  employee_id: number
  teamly_user_id: string
  event_type: TeamlyEventType
  entity_id: string
  container_id: string | null
  occurred_at: Date
  payload: Record<string, unknown>
}

export async function insertEvent(driver: Driver, row: TeamlyEventRow): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $event_id AS Utf8;
          DECLARE $employee_id AS Uint64;
          DECLARE $teamly_user_id AS Utf8;
          DECLARE $event_type AS Utf8;
          DECLARE $entity_id AS Utf8;
          DECLARE $container_id AS Utf8?;
          DECLARE $occurred_at AS Timestamp;
          DECLARE $payload AS Json;
          UPSERT INTO teamly_events
            (event_id, employee_id, teamly_user_id, event_type, entity_id, container_id, occurred_at, payload)
          VALUES
            ($event_id, $employee_id, $teamly_user_id, $event_type, $entity_id, $container_id, $occurred_at, $payload);
        `,
        parameters: {
          $event_id: TypedValues.utf8(row.event_id),
          $employee_id: TypedValues.uint64(row.employee_id),
          $teamly_user_id: TypedValues.utf8(row.teamly_user_id),
          $event_type: TypedValues.utf8(row.event_type),
          $entity_id: TypedValues.utf8(row.entity_id),
          $container_id:
            row.container_id == null
              ? TypedValues.optionalNull(Types.UTF8)
              : TypedValues.optional(TypedValues.utf8(row.container_id)),
          $occurred_at: TypedValues.timestamp(row.occurred_at),
          $payload: TypedValues.json(JSON.stringify(row.payload)),
        },
      })
      await res.opFinished
    },
  })
}
```

### Task 1.4: Commit

- [ ] **Step 1:**

```bash
git add src/database/migrations.ts src/database/queries/teamly-tokens.ts src/database/queries/teamly-events.ts
git commit -m "feat(db): add teamly_events, teamly_tokens tables + queries"
```

---

## Chunk 2: TeamlyApi — OAuth client

OAuth2 + `getArticleAuthor`. Use the exact request shape confirmed in spike Task 0.5.

### Task 2.1: Write event-builder test (later) and TeamlyApi tests first

**File:** `tests/sources/teamly/teamly-api.test.ts` (new)

- [ ] **Step 1:** Write failing tests:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TeamlyApi } from '../../../src/sources/teamly/teamly-api.js'

const baseConfig = {
  slug: 'unitpay',
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'http://test.local',
}

describe('TeamlyApi', () => {
  let store: any
  let fetchMock: any

  beforeEach(() => {
    store = {
      tokens: null as null | {
        access_token: string; refresh_token: string;
        access_expires_at: Date; refresh_expires_at: Date; cluster_domain: string
      },
      async get() { return this.tokens },
      async save(t: any) { this.tokens = t },
    }
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('exchangeCode persists tokens to store', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'A', refresh_token: 'R',
      access_token_expires_at: '1900000000',
      refresh_token_expires_at: '1901000000',
      accounts: [{ slug: 'unitpay', clusterDomain: 'https://app.teamly.ru' }],
    }), { status: 200 }))

    const api = new TeamlyApi(baseConfig, store)
    await api.exchangeCode('one-time-code')

    expect(store.tokens?.access_token).toBe('A')
    expect(store.tokens?.cluster_domain).toBe('https://app.teamly.ru')
  })

  it('getArticleAuthor returns author id from response', async () => {
    store.tokens = {
      access_token: 'A', refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 3600_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ id: 'art-1', author: { id: 'usr-42', fullName: 'X' } }],
    }), { status: 200 }))

    const api = new TeamlyApi(baseConfig, store)
    const author = await api.getArticleAuthor('art-1')
    expect(author).toBe('usr-42')
  })

  it('refreshes when access_token expires soon', async () => {
    store.tokens = {
      access_token: 'old', refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 60_000), // 1 min — under 5 min threshold
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    // first call: refresh
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'NEW', refresh_token: 'R2',
      access_token_expires_at: '1900000000',
      refresh_token_expires_at: '1901000000',
      accounts: [{ slug: 'unitpay', clusterDomain: 'https://app.teamly.ru' }],
    }), { status: 200 }))
    // second call: actual article fetch
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{ id: 'art-1', author: { id: 'usr-7' } }],
    }), { status: 200 }))

    const api = new TeamlyApi(baseConfig, store)
    await api.getArticleAuthor('art-1')
    expect(store.tokens?.access_token).toBe('NEW')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null when article not found', async () => {
    store.tokens = {
      access_token: 'A', refresh_token: 'R',
      access_expires_at: new Date(Date.now() + 3600_000),
      refresh_expires_at: new Date(Date.now() + 14 * 86400_000),
      cluster_domain: 'https://app.teamly.ru',
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))

    const api = new TeamlyApi(baseConfig, store)
    const author = await api.getArticleAuthor('missing')
    expect(author).toBeNull()
  })
})
```

- [ ] **Step 2:** Run `npm test -- teamly-api`. Expected: all FAIL with "Cannot find module".

### Task 2.2: Implement TeamlyApi

**File:** `src/sources/teamly/teamly-api.ts` (new)

- [ ] **Step 0:** Open `docs/teamly/06-spike-2026-05-27.md` from Chunk 0. Find the documented request body and the response shape that returned an author id. The skeleton below is a guess — **before continuing, replace the body in `getArticleAuthor` and the response unwrapping line (`const item = ...`) with the exact shapes from the spike doc.** If both are unverified, stop and run the spike first.

- [ ] **Step 1:** Write the file (adjusting request/response shape per Step 0):

```ts
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

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000 // refresh if < 5 min left

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
    // Adjust path based on spike findings: single-object vs items[]
    const item = (res as any).items?.[0] ?? (res as any).item ?? res
    const authorId: unknown = item?.author?.id
    if (typeof authorId !== 'string') {
      logger.warn({ articleId, response: res }, 'teamly: author id missing in response')
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
      // Auth problem (token rejected) — throw so caller can decide.
      // Not silently mask as "missing author".
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
    const access = payload.access_token ?? payload.acces_token // doc has both spellings
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
```

> NOTE: the Teamly doc has a typo `acces_token` (single `s`) in the OAuth response example. The fallback in `persistTokens` handles both. Don't "fix" it.

- [ ] **Step 2:** Run tests: `npm test -- teamly-api`. Expected: all 4 PASS.

### Task 2.3: Typecheck + commit

- [ ] **Step 1:** `npm run typecheck`. Expected: no errors.

- [ ] **Step 2:**

```bash
git add src/sources/teamly/teamly-api.ts tests/sources/teamly/teamly-api.test.ts
git commit -m "feat(teamly): add OAuth2 client with lazy refresh + getArticleAuthor"
```

---

## Chunk 3: Event-builder + TeamlySource

Pure mapping logic (tested), plus source class wiring.

### Task 3.1: Write event-builder tests

**File:** `tests/sources/teamly/event-builder.test.ts` (new)

- [ ] **Step 1:**

```ts
import { describe, it, expect } from 'vitest'
import { buildEvent, type WebhookInput } from '../../../src/sources/teamly/event-builder.js'

const ANI_TG = 6300594719
const ANI_TEAMLY = 'teamly-uuid-ani'

const deps = {
  resolveTelegramId: (teamlyId: string) =>
    teamlyId === ANI_TEAMLY ? ANI_TG : null,
}

describe('buildEvent — comment', () => {
  it('builds comment_create event when author is SB', async () => {
    const input: WebhookInput = {
      entityType: 'comment', action: 'create',
      entityId: 'cmt-1',
      content: { createdBy: ANI_TEAMLY, forSource: { sourceId: 'art-9' } },
      occurredAt: new Date('2026-05-27T10:00:00Z'),
      raw: {} as any,
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toMatchObject({
      event_id: 'comment_create:cmt-1',
      employee_id: ANI_TG,
      event_type: 'comment_create',
      entity_id: 'cmt-1',
    })
  })

  it('drops comment when author is not SB', async () => {
    const input: WebhookInput = {
      entityType: 'comment', action: 'create',
      entityId: 'cmt-2',
      content: { createdBy: 'unknown', forSource: { sourceId: 'art-9' } },
      occurredAt: new Date(),
      raw: {} as any,
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toBeNull()
  })
})

describe('buildEvent — article', () => {
  it('builds article_create after dochitka when author is SB', async () => {
    const input: WebhookInput = {
      entityType: 'article', action: 'create',
      entityId: 'art-1',
      content: { containerId: 'space-1' },
      occurredAt: new Date('2026-05-27T10:00:00Z'),
      raw: {} as any,
    }
    const ev = await buildEvent(input, {
      ...deps,
      getArticleAuthor: async (id) => (id === 'art-1' ? ANI_TEAMLY : null),
    })
    expect(ev).toMatchObject({
      event_id: 'article_create:art-1',
      employee_id: ANI_TG,
      event_type: 'article_create',
      entity_id: 'art-1',
      container_id: 'space-1',
    })
  })

  it('drops article when getArticleAuthor returns null', async () => {
    const input: WebhookInput = {
      entityType: 'article', action: 'create',
      entityId: 'art-x',
      content: { containerId: 'space-1' },
      occurredAt: new Date(),
      raw: {} as any,
    }
    const ev = await buildEvent(input, { ...deps, getArticleAuthor: async () => null })
    expect(ev).toBeNull()
  })

  it('drops article when author is not SB', async () => {
    const input: WebhookInput = {
      entityType: 'article', action: 'create',
      entityId: 'art-y',
      content: { containerId: 'space-1' },
      occurredAt: new Date(),
      raw: {} as any,
    }
    const ev = await buildEvent(input, {
      ...deps,
      getArticleAuthor: async () => 'other-teamly-uuid',
    })
    expect(ev).toBeNull()
  })
})
```

- [ ] **Step 2:** `npm test -- event-builder`. Expected: all FAIL.

### Task 3.2: Implement event-builder

**File:** `src/sources/teamly/event-builder.ts` (new)

- [ ] **Step 1:**

```ts
import type { TeamlyEventRow } from '../../database/queries/teamly-events.js'

export interface WebhookInput {
  entityType: 'article' | 'comment'
  action: 'create'
  entityId: string
  content: Record<string, any>
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
    teamlyUserId = (input.content?.createdBy as string | undefined) ?? null
  } else {
    // article: dochit the author
    teamlyUserId = await deps.getArticleAuthor(input.entityId)
    containerId = (input.content?.containerId as string | undefined) ?? null
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
    payload: input.raw as Record<string, unknown>,
  }
}
```

- [ ] **Step 2:** `npm test -- event-builder`. Expected: 5 PASS.

### Task 3.3: Implement TeamlySource

**File:** `src/sources/teamly/teamly-source.ts` (new)

- [ ] **Step 1:**

```ts
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
      logger.error({ err, entityId: input.entityId, entityType: input.entityType }, 'teamly buildEvent threw')
      return
    }
    if (!ev) {
      logger.debug({ entityId: input.entityId, entityType: input.entityType }, 'teamly event dropped (not SB or no author)')
      return
    }
    try {
      await insertEvent(this.driver, ev)
      logger.debug({ event_id: ev.event_id, employee_id: ev.employee_id }, 'teamly event saved')
    } catch (err) {
      logger.error({ err, event_id: ev.event_id }, 'teamly insertEvent failed')
    }
  }
}
```

### Task 3.4: Typecheck + commit

- [ ] **Step 1:** `npm run typecheck`. Expected: no errors.

- [ ] **Step 2:**

```bash
git add src/sources/teamly/ tests/sources/teamly/event-builder.test.ts
git commit -m "feat(teamly): event-builder + TeamlySource"
```

---

## Chunk 4: Hono HTTP server + webhook route

Build a minimal HTTP server (Hono). Two routes planned long-term: `/teamly/webhook/<secret>` (this chunk) and `/telegram/webhook/<secret>` (left as a `TODO comment` for master-plan-2). In dev, Telegram still uses polling.

### Task 4.1: Add Hono dependency

- [ ] **Step 1:**

```bash
npm install hono @hono/node-server
```

- [ ] **Step 2:** Verify `package.json` has both deps.

### Task 4.2: Create webhook queue

**File:** `src/server/webhook-queue.ts` (new)

In-process FIFO queue with one worker. Sequential. Per-event try/catch. No bounded backpressure (volume ≤60/day per spec).

- [ ] **Step 1:**

```ts
import { logger } from '../logger.js'

export class WebhookQueue<T> {
  private items: T[] = []
  private running = false

  constructor(private readonly worker: (item: T) => Promise<void>) {}

  push(item: T): void {
    this.items.push(item)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.items.length > 0) {
        const next = this.items.shift()!
        try {
          await this.worker(next)
        } catch (err) {
          logger.error({ err }, 'webhook-queue worker threw, dropping event')
        }
      }
    } finally {
      this.running = false
    }
  }
}
```

### Task 4.3: Create Teamly webhook route

**File:** `src/server/teamly-webhook.ts` (new)

- [ ] **Step 1:**

```ts
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
  content?: Record<string, any>
}

export function teamlyWebhookRoute(secret: string, source: TeamlySource) {
  const queue = new WebhookQueue<WebhookInput>((input) => source.handle(input))
  const app = new Hono()

  app.post(`/teamly/webhook/${secret}`, async (c) => {
    let raw: RawTeamlyPayload
    try {
      raw = await c.req.json()
    } catch {
      return c.body(null, 400)
    }
    const accepted = parsePayload(raw)
    if (accepted) queue.push(accepted)
    return c.body(null, 200)
  })

  return app
}

function parsePayload(raw: RawTeamlyPayload): WebhookInput | null {
  if (raw.action !== 'create') return null
  if (raw.entityType !== 'article' && raw.entityType !== 'comment') return null
  if (typeof raw.entityId !== 'string') {
    logger.warn({ raw }, 'teamly webhook: missing entityId')
    return null
  }
  return {
    entityType: raw.entityType,
    action: 'create',
    entityId: raw.entityId,
    content: raw.content ?? {},
    occurredAt: new Date(),
    raw,
  }
}
```

### Task 4.4: Create the HTTP server entry

**File:** `src/server/index.ts` (new)

- [ ] **Step 1:**

```ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { logger } from '../logger.js'
import { teamlyWebhookRoute } from './teamly-webhook.js'
import type { TeamlySource } from '../sources/teamly/teamly-source.js'

export interface ServerOptions {
  port: number
  teamlyWebhookSecret: string | null
  teamlySource: TeamlySource | null
}

export function startServer(opts: ServerOptions): { close: () => Promise<void> } {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  if (opts.teamlyWebhookSecret && opts.teamlySource) {
    app.route('/', teamlyWebhookRoute(opts.teamlyWebhookSecret, opts.teamlySource))
    logger.info('teamly webhook route registered')
  } else {
    logger.warn('teamly webhook NOT registered (no secret or no source)')
  }

  // TODO master-plan-2: register telegram webhook route here

  const server = serve({ fetch: app.fetch, port: opts.port }, (info) => {
    logger.info({ port: info.port }, 'http server listening')
  })

  return {
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
```

### Task 4.5: Write a smoke test for the route

**File:** `tests/server/teamly-webhook.test.ts` (new)

- [ ] **Step 1:**

```ts
import { describe, it, expect, vi } from 'vitest'
import { teamlyWebhookRoute } from '../../src/server/teamly-webhook.js'

const sampleArticle = {
  entityId: 'art-1', entityType: 'article', action: 'create',
  content: { containerId: 'space-1' },
}
const sampleComment = {
  entityId: 'cmt-1', entityType: 'comment', action: 'create',
  content: { createdBy: 'user-teamly-uuid' },
}
const ignored = { entityId: 'sp-1', entityType: 'space', action: 'create', content: {} }

function makeSource() {
  const handle = vi.fn().mockResolvedValue(undefined)
  return { handle } as any
}

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

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
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleArticle),
    })
    expect(res.status).toBe(200)
    // queue drains async — wait a tick
    await new Promise((r) => setTimeout(r, 10))
    expect(source.handle).toHaveBeenCalledTimes(1)
    expect(source.handle.mock.calls[0][0].entityType).toBe('article')
  })

  it('200 + ignores non-article/comment', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ignored),
    })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 10))
    expect(source.handle).not.toHaveBeenCalled()
  })

  it('200 + enqueues comment.create', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleComment),
    })
    expect(res.status).toBe(200)
    await new Promise((r) => setTimeout(r, 10))
    expect(source.handle).toHaveBeenCalledTimes(1)
  })

  it('400 on invalid json', async () => {
    const source = makeSource()
    const app = teamlyWebhookRoute(SECRET, source)
    const res = await app.request(`/teamly/webhook/${SECRET}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2:** `npm test -- teamly-webhook`. Expected: 5 PASS.

> Note: tests use a 10ms sleep to let the queue drain. If flakiness appears, switch to `await vi.waitFor(() => expect(source.handle).toHaveBeenCalled())`.

### Task 4.6: Typecheck + commit

- [ ] **Step 1:** `npm run typecheck`. Expected: no errors.

- [ ] **Step 2:**

```bash
git add package.json package-lock.json src/server/ tests/server/
git commit -m "feat(server): minimal Hono server with Teamly webhook route + queue"
```

---

## Chunk 5: Config, main.ts wiring, README, .env.example

Connect everything together. Reload existing dev bot and verify it boots clean.

### Task 5.1: Extend config schema

**File:** `src/config.ts`

All Teamly fields are **optional** so a dev `.env` without Teamly creds still boots — the bot just won't start the Teamly source.

- [ ] **Step 1:** Read the existing `src/config.ts` to understand layout. Then add 7 new fields to `ConfigSchema`. Use Edit, inserting these lines **just before the closing `})` of the `v.object({...})` block:**

```ts
  serverPort: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '8080'),
  teamlySlug: v.optional(v.string()),
  teamlyClientId: v.optional(v.string()),
  teamlyClientSecret: v.optional(v.string()),
  teamlyRedirectUri: v.optional(v.string()),
  teamlyAuthCode: v.optional(v.string()),
  teamlyWebhookSecret: v.optional(v.string()),
```

- [ ] **Step 2:** Add corresponding `process.env.*` reads to the `v.parse(ConfigSchema, {...})` call. Use Edit, inserting these lines **just before the closing `})` of the parse-call object:**

```ts
  serverPort: process.env.SERVER_PORT,
  teamlySlug: process.env.TEAMLY_SLUG,
  teamlyClientId: process.env.TEAMLY_CLIENT_ID,
  teamlyClientSecret: process.env.TEAMLY_CLIENT_SECRET,
  teamlyRedirectUri: process.env.TEAMLY_REDIRECT_URI,
  teamlyAuthCode: process.env.TEAMLY_AUTH_CODE,
  teamlyWebhookSecret: process.env.TEAMLY_WEBHOOK_SECRET,
```

### Task 5.2: Wire bootstrap and server in main.ts

**File:** `src/main.ts`

> Depends on `rows` (result of `listEmployees(driver)`) being in scope at insertion point. As of current main.ts that's true. If main.ts has been refactored, re-establish the variable.

> Also depends on `startServer({port, teamlyWebhookSecret, teamlySource})` from Chunk 4 Task 4.4 — sig must match.

- [ ] **Step 1:** Add new imports and a Teamly bootstrap function:

```ts
import { TeamlyApi, type TokenStore } from './sources/teamly/teamly-api.js'
import { TeamlySource } from './sources/teamly/teamly-source.js'
import { getToken, saveToken } from './database/queries/teamly-tokens.js'
import { startServer } from './server/index.js'
```

- [ ] **Step 2:** Inside `main()`, after `await telegramSource.init()`, add:

```ts
let teamlySource: TeamlySource | null = null
const teamlyCfgComplete =
  config.teamlySlug && config.teamlyClientId && config.teamlyClientSecret && config.teamlyRedirectUri

if (teamlyCfgComplete) {
  const tokenStore: TokenStore = {
    get: async () => {
      const row = await getToken(driver)
      return row
    },
    save: async (row) => {
      await saveToken(driver, row)
    },
  }
  const api = new TeamlyApi(
    {
      slug: config.teamlySlug!,
      clientId: config.teamlyClientId!,
      clientSecret: config.teamlyClientSecret!,
      redirectUri: config.teamlyRedirectUri!,
    },
    tokenStore,
  )

  const existing = await getToken(driver)
  if (!existing && config.teamlyAuthCode) {
    try {
      await api.exchangeCode(config.teamlyAuthCode)
      logger.info('teamly auth bootstrapped')
    } catch (err) {
      logger.error({ err }, 'teamly bootstrap failed: integration disabled')
    }
  } else if (existing) {
    logger.info('teamly tokens loaded from db')
  } else {
    logger.warn('teamly disabled: no tokens and no TEAMLY_AUTH_CODE')
  }

  const haveTokens = (await getToken(driver)) != null
  if (haveTokens) {
    const teamlyByEmployee = new Map<string, number>()
    for (const r of rows) {
      if (r.teamly_user_id) teamlyByEmployee.set(r.teamly_user_id, r.telegram_id)
    }
    teamlySource = new TeamlySource(driver, api, {
      resolveTelegramId: (teamlyId) => teamlyByEmployee.get(teamlyId) ?? null,
    })
  }
} else {
  logger.info('teamly config absent — source disabled')
}

const server = startServer({
  port: config.serverPort,
  teamlyWebhookSecret: teamlySource ? config.teamlyWebhookSecret ?? null : null,
  teamlySource,
})
```

- [ ] **Step 3:** Update the `shutdown` function to close the HTTP server too:

```ts
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down')
  await server.close()
  await bot.stop()
  await closeDriver()
  process.exit(0)
}
```

### Task 5.3: Update `.env.example`

**File:** `.env.example`

- [ ] **Step 1:** Add (rename old TEAMLY_* values if any):

```dotenv
# HTTP server (для Teamly webhook; в dev можно не выставлять — будет 8080)
SERVER_PORT=8080

# Teamly (опционально — без них Teamly-источник отключен)
TEAMLY_SLUG=
TEAMLY_CLIENT_ID=
TEAMLY_CLIENT_SECRET=
TEAMLY_REDIRECT_URI=
# Одноразовый код, нужен только на первый запуск; после bootstrap можно убрать.
TEAMLY_AUTH_CODE=
# Случайная строка ≥32 символов, попадёт в URL webhook'а.
TEAMLY_WEBHOOK_SECRET=
```

### Task 5.4: Update README

**File:** `README.md`

- [ ] **Step 1:** In the "Источники данных" table, change the Teamly row description:

  Old: `создано / просмотрено / прокомментировано карточек | ежедневный snapshot готовых агрегатов через Teamly External API`
  New: `создал статью/карточку, оставил комментарий | webhook event-stream (External API не отдаёт «просмотрел» — выкинуто)`

- [ ] **Step 2:** In the "Excel-отчёт" section, remove all mentions of "Просмотрел" and update the Лист 2 description: `Teamly (создал / комментариев)` — без «просмотрел».

- [ ] **Step 3:** In the "Текущий статус → В работе на план 2" list, mark Teamly as done after this plan completes.

- [ ] **Step 4:** In the ENV table, add the new TEAMLY_* and SERVER_PORT rows; remove the old TEAMLY_* placeholder row.

### Task 5.5: Boot test

- [ ] **Step 1:** Run `npm test` — all tests should pass.
- [ ] **Step 2:** Run `npm run typecheck` — no errors.
- [ ] **Step 3:** Run `npm run dev` with `.env` that has NO Teamly fields. Expected logs: `teamly config absent — source disabled`, then bot starts normally as before.
- [ ] **Step 4:** Add full Teamly env (after running the spike Chunk 0 to get a valid AUTH_CODE) and restart. Expected logs: `teamly auth bootstrapped` (first run) or `teamly tokens loaded from db` (subsequent runs), then `teamly webhook route registered`, then `http server listening { port: 8080 }`.

### Task 5.6: End-to-end manual check

Requires a public URL — use ngrok locally (`ngrok http 8080`) or just deploy.

- [ ] **Step 1:** In Teamly UI, register a **real** webhook on `https://<your-ngrok>/teamly/webhook/<TEAMLY_WEBHOOK_SECRET>`, subscribe only to `article.create` and `comment.create`.
- [ ] **Step 2:** Make sure your own Teamly user_id is in `sb_employees.teamly_user_id` for the test telegram_id (use `/add_sb` or seed in `INITIAL_SB_USERS`).
- [ ] **Step 3:** Create a test card in the smart table. Wait 5 seconds.
- [ ] **Step 4:** Query YDB:

```sql
SELECT event_id, employee_id, teamly_user_id, event_type, entity_id, container_id, occurred_at, payload FROM teamly_events;
```

Expected: at least one row with `event_type='article_create'`, your `teamly_user_id`, your `telegram_id`. Verify:
- `entity_id` matches the card's uuid (visible in Teamly URL).
- `payload` JSON deserializes cleanly (`SELECT JsonDocument(payload) ...` or eyeball it in console).
- `occurred_at` is within the last minute.

- [ ] **Step 5:** Leave a comment on the same card. Re-query — expect a second row `comment_create:...`.

- [ ] **Step 6:** Negative check — ask someone NOT in `sb_employees` to create a card. Re-query — there should be NO new row. (If you don't have a second user available, skip; the unit tests in Task 3.1 already cover this path.)

If both positive rows show up and Step 6 produces no row — implementation is functionally complete.

### Task 5.7: Commit

- [ ] **Step 1:**

```bash
git add src/config.ts src/main.ts .env.example README.md
git commit -m "feat(main): wire TeamlySource + Hono server; bootstrap OAuth on first run"
```

---

## Done criteria

- [ ] All chunks committed.
- [ ] `npm test` and `npm run typecheck` clean.
- [ ] Spike doc `docs/teamly/06-spike-2026-05-27.md` exists and confirms both hypotheses (or documents the failure and plan B is applied).
- [ ] At least one row in `teamly_events` came from a real Teamly webhook in end-to-end check.
- [ ] README no longer mentions «Просмотрел» or «снимки агрегатов».

## NOT in this plan (defer to later)

- LRU cache for `getArticleAuthor` — only if dochitka exceeds 200 req/day for a week.
- Refresh-token-expired alerting — manual log check is enough for MVP.
- Telegram webhook route — belongs to master-plan-2 deploy work.
- Excel `/report` Teamly columns — Excel ReportBuilder is its own subsystem (master-plan-2). This plan only ensures the data is in YDB; the report-builder will SELECT from `teamly_events` later.
