import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues } from 'ydb-sdk'
import { withSession } from '../client.js'

export type TelegramEventType = 'trigger_reply' | 'trigger_reaction'

export interface TelegramEventRow {
  event_id: string
  employee_id: number
  chat_id: number
  event_type: TelegramEventType
  occurred_at: Date
  payload: Record<string, unknown>
}

export async function insertEvent(driver: Driver, row: TelegramEventRow): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $event_id AS Utf8;
       DECLARE $employee_id AS Uint64;
       DECLARE $chat_id AS Int64;
       DECLARE $event_type AS Utf8;
       DECLARE $occurred_at AS Timestamp;
       DECLARE $payload AS Json;
       UPSERT INTO telegram_events
         (event_id, employee_id, chat_id, event_type, occurred_at, payload)
       VALUES
         ($event_id, $employee_id, $chat_id, $event_type, $occurred_at, $payload);`,
      {
        $event_id: TypedValues.utf8(row.event_id),
        $employee_id: TypedValues.uint64(row.employee_id),
        $chat_id: TypedValues.int64(row.chat_id),
        $event_type: TypedValues.utf8(row.event_type),
        $occurred_at: TypedValues.timestamp(row.occurred_at),
        $payload: TypedValues.json(JSON.stringify(row.payload)),
      },
      AUTO_TX,
    )
  })
}

// MAX(occurred_at) по всей таблице — для /healthz «идёт ли сбор» (epoch ms / null).
export async function latestEventAt(driver: Driver): Promise<number | null> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `SELECT MAX(occurred_at) AS mx FROM telegram_events;`,
      {},
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
      mx: Date | null
    }>
    const mx = rows[0]?.mx
    return mx ? new Date(mx).getTime() : null
  })
}

export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<TelegramEventRow[]> {
  return withSession(
    driver,
    async (session) => {
      const result = await session.executeQuery(
        `DECLARE $from AS Timestamp;
         DECLARE $to AS Timestamp;
         SELECT event_id, employee_id, chat_id, event_type, occurred_at, payload
         FROM telegram_events
         WHERE occurred_at >= $from AND occurred_at < $to
           AND event_type IN ('trigger_reply', 'trigger_reaction');`,
        {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
        AUTO_TX,
      )
      const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
        event_id: string
        employee_id: number | bigint
        chat_id: number | bigint
        event_type: TelegramEventType
        occurred_at: Date
        payload: string
      }>
      return rows.map((r) => ({
        event_id: r.event_id,
        employee_id: Number(r.employee_id),
        chat_id: Number(r.chat_id),
        event_type: r.event_type,
        occurred_at: r.occurred_at,
        payload: JSON.parse(r.payload) as Record<string, unknown>,
      }))
    },
    30_000,
  )
}
