import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues, Types } from 'ydb-sdk'
import { withSession } from '../client.js'

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

export async function upsertEmployee(
  driver: Driver,
  row: { telegram_id: number; full_name: string; teamly_user_id?: string | null },
): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $tg_id AS Uint64;
       DECLARE $teamly AS Utf8?;
       DECLARE $name AS Utf8;
       DECLARE $now AS Timestamp;
       UPSERT INTO sb_employees (telegram_id, teamly_user_id, full_name, created_at)
       VALUES ($tg_id, $teamly, $name, $now);`,
      {
        $tg_id: TypedValues.uint64(row.telegram_id),
        $teamly: optionalUtf8(row.teamly_user_id ?? null),
        $name: TypedValues.utf8(row.full_name),
        $now: TypedValues.timestamp(new Date()),
      },
      AUTO_TX,
    )
  })
}

export async function removeEmployee(driver: Driver, telegramId: number): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $tg_id AS Uint64;
       DELETE FROM sb_employees WHERE telegram_id = $tg_id;`,
      { $tg_id: TypedValues.uint64(telegramId) },
      AUTO_TX,
    )
  })
}

export async function listEmployees(driver: Driver): Promise<SbEmployeeRow[]> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `SELECT telegram_id, teamly_user_id, full_name, created_at FROM sb_employees ORDER BY created_at;`,
      {},
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
      telegram_id: number | bigint
      teamly_user_id: string | null
      full_name: string
      created_at: Date
    }>
    return rows.map((r) => ({
      telegram_id: Number(r.telegram_id),
      teamly_user_id: r.teamly_user_id ?? null,
      full_name: r.full_name,
      created_at: r.created_at,
    }))
  })
}

export async function isEmployee(driver: Driver, telegramId: number): Promise<boolean> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `DECLARE $tg_id AS Uint64;
       SELECT 1 AS one FROM sb_employees WHERE telegram_id = $tg_id;`,
      { $tg_id: TypedValues.uint64(telegramId) },
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0])
    return rows.length > 0
  })
}
