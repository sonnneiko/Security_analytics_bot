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
