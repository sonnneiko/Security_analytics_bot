import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues } from 'ydb-sdk'
import { withSession } from '../client.js'

export interface TriggerMessageRow {
  chat_id: number
  message_id: number
  author_id: number
  occurred_at: Date
}

export async function upsertTriggerMessage(driver: Driver, row: TriggerMessageRow): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $chat_id AS Int64;
       DECLARE $message_id AS Int64;
       DECLARE $author_id AS Uint64;
       DECLARE $occurred_at AS Timestamp;
       UPSERT INTO trigger_messages (chat_id, message_id, author_id, occurred_at)
       VALUES ($chat_id, $message_id, $author_id, $occurred_at);`,
      {
        $chat_id: TypedValues.int64(row.chat_id),
        $message_id: TypedValues.int64(row.message_id),
        $author_id: TypedValues.uint64(row.author_id),
        $occurred_at: TypedValues.timestamp(row.occurred_at),
      },
      AUTO_TX,
    )
  })
}

export async function findTriggerMessage(
  driver: Driver,
  chatId: number,
  messageId: number,
): Promise<{ author_id: number } | null> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `DECLARE $chat_id AS Int64;
       DECLARE $message_id AS Int64;
       SELECT author_id FROM trigger_messages
       WHERE chat_id = $chat_id AND message_id = $message_id;`,
      {
        $chat_id: TypedValues.int64(chatId),
        $message_id: TypedValues.int64(messageId),
      },
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
      author_id: number | bigint
    }>
    const first = rows[0]
    if (!first) return null
    return { author_id: Number(first.author_id) }
  })
}
