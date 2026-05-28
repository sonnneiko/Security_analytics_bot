import type { Driver } from 'ydb-sdk'
import { TypedValues, Types } from 'ydb-sdk'

export interface SbEmployeeRow {
  telegram_id: number
  teamly_user_id: string | null
  full_name: string
  created_at: Date
}

function optionalUtf8(value: string | null | undefined) {
  return value == null
    ? TypedValues.optionalNull(Types.UTF8)
    : TypedValues.optional(TypedValues.utf8(value))
}

async function drain(execResult: {
  resultSets: AsyncGenerator<{ rows: AsyncGenerator<Record<string, unknown>, void> }>
  opFinished: Promise<void>
}): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for await (const rs of execResult.resultSets) {
    for await (const row of rs.rows) all.push(row)
  }
  await execResult.opFinished
  return all
}

export async function upsertEmployee(
  driver: Driver,
  row: { telegram_id: number; full_name: string; teamly_user_id?: string | null },
): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $tg_id AS Uint64;
          DECLARE $teamly AS Utf8?;
          DECLARE $name AS Utf8;
          DECLARE $now AS Timestamp;
          UPSERT INTO sb_employees (telegram_id, teamly_user_id, full_name, created_at)
          VALUES ($tg_id, $teamly, $name, $now);
        `,
        parameters: {
          $tg_id: TypedValues.uint64(row.telegram_id),
          $teamly: optionalUtf8(row.teamly_user_id ?? null),
          $name: TypedValues.utf8(row.full_name),
          $now: TypedValues.timestamp(new Date()),
        },
      })
      await res.opFinished
    },
  })
}

export async function removeEmployee(driver: Driver, telegramId: number): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $tg_id AS Uint64;
          DELETE FROM sb_employees WHERE telegram_id = $tg_id;
        `,
        parameters: { $tg_id: TypedValues.uint64(telegramId) },
      })
      await res.opFinished
    },
  })
}

export async function listEmployees(driver: Driver): Promise<SbEmployeeRow[]> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `SELECT telegram_id, teamly_user_id, full_name, created_at FROM sb_employees ORDER BY created_at;`,
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        telegram_id: Number(r.telegramId),
        teamly_user_id: (r.teamlyUserId as string | null) ?? null,
        full_name: r.fullName as string,
        created_at: r.createdAt as Date,
      }))
    },
  })
}

export async function isEmployee(driver: Driver, telegramId: number): Promise<boolean> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $tg_id AS Uint64;
          SELECT 1 AS one FROM sb_employees WHERE telegram_id = $tg_id;
        `,
        parameters: { $tg_id: TypedValues.uint64(telegramId) },
      })
      const rows = await drain(res)
      return rows.length > 0
    },
  })
}
