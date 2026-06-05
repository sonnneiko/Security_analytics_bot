import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues } from 'ydb-sdk'
import { withSession } from '../client.js'

export interface TeamlyTokenRow {
  access_token: string
  refresh_token: string
  access_expires_at: Date
  refresh_expires_at: Date
  cluster_domain: string
}

export async function getToken(driver: Driver): Promise<TeamlyTokenRow | null> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `SELECT access_token, refresh_token, access_expires_at, refresh_expires_at, cluster_domain
       FROM teamly_tokens WHERE id = 'default';`,
      {},
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
      access_token: string
      refresh_token: string
      access_expires_at: Date
      refresh_expires_at: Date
      cluster_domain: string
    }>
    const row = rows[0]
    if (!row) return null
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      access_expires_at: row.access_expires_at,
      refresh_expires_at: row.refresh_expires_at,
      cluster_domain: row.cluster_domain,
    }
  })
}

export async function saveToken(driver: Driver, row: TeamlyTokenRow): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $access AS Utf8;
       DECLARE $refresh AS Utf8;
       DECLARE $access_exp AS Timestamp;
       DECLARE $refresh_exp AS Timestamp;
       DECLARE $domain AS Utf8;
       DECLARE $now AS Timestamp;
       UPSERT INTO teamly_tokens
         (id, access_token, refresh_token, access_expires_at, refresh_expires_at, cluster_domain, updated_at)
       VALUES
         ('default', $access, $refresh, $access_exp, $refresh_exp, $domain, $now);`,
      {
        $access: TypedValues.utf8(row.access_token),
        $refresh: TypedValues.utf8(row.refresh_token),
        $access_exp: TypedValues.timestamp(row.access_expires_at),
        $refresh_exp: TypedValues.timestamp(row.refresh_expires_at),
        $domain: TypedValues.utf8(row.cluster_domain),
        $now: TypedValues.timestamp(new Date()),
      },
      AUTO_TX,
    )
  })
}
