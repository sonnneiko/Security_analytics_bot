import type { Driver } from 'ydb-sdk'
import { TypedValues } from 'ydb-sdk'

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
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $event_id AS Utf8;
          DECLARE $employee_id AS Uint64;
          DECLARE $chat_id AS Int64;
          DECLARE $event_type AS Utf8;
          DECLARE $occurred_at AS Timestamp;
          DECLARE $payload AS Json;
          UPSERT INTO telegram_events
            (event_id, employee_id, chat_id, event_type, occurred_at, payload)
          VALUES
            ($event_id, $employee_id, $chat_id, $event_type, $occurred_at, $payload);
        `,
        parameters: {
          $event_id: TypedValues.utf8(row.event_id),
          $employee_id: TypedValues.uint64(row.employee_id),
          $chat_id: TypedValues.int64(row.chat_id),
          $event_type: TypedValues.utf8(row.event_type),
          $occurred_at: TypedValues.timestamp(row.occurred_at),
          $payload: TypedValues.json(JSON.stringify(row.payload)),
        },
      })
      await res.opFinished
    },
  })
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

export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<TelegramEventRow[]> {
  return driver.queryClient.do({
    timeout: 30_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $from AS Timestamp;
          DECLARE $to AS Timestamp;
          SELECT event_id, employee_id, chat_id, event_type, occurred_at, payload
          FROM telegram_events
          WHERE occurred_at >= $from AND occurred_at < $to
            AND event_type IN ('trigger_reply', 'trigger_reaction');
        `,
        parameters: {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        event_id: r.eventId as string,
        employee_id: Number(r.employeeId),
        chat_id: Number(r.chatId),
        event_type: r.eventType as TelegramEventType,
        occurred_at: r.occurredAt as Date,
        payload: JSON.parse(r.payload as string) as Record<string, unknown>,
      }))
    },
  })
}
