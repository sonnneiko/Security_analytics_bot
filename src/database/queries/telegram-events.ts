import { Driver, TypedValues } from 'ydb-sdk'

export type TelegramEventType = 'message' | 'reaction' | 'trigger_reply'

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
