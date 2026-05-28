import { Driver, TypedValues } from 'ydb-sdk'

export interface TriggerMessageRow {
  chat_id: number
  message_id: number
  author_id: number
  occurred_at: Date
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

export async function upsertTriggerMessage(driver: Driver, row: TriggerMessageRow): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DECLARE $message_id AS Int64;
          DECLARE $author_id AS Uint64;
          DECLARE $occurred_at AS Timestamp;
          UPSERT INTO trigger_messages (chat_id, message_id, author_id, occurred_at)
          VALUES ($chat_id, $message_id, $author_id, $occurred_at);
        `,
        parameters: {
          $chat_id: TypedValues.int64(row.chat_id),
          $message_id: TypedValues.int64(row.message_id),
          $author_id: TypedValues.uint64(row.author_id),
          $occurred_at: TypedValues.timestamp(row.occurred_at),
        },
      })
      await res.opFinished
    },
  })
}

export async function findTriggerMessage(
  driver: Driver,
  chatId: number,
  messageId: number,
): Promise<{ author_id: number } | null> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DECLARE $message_id AS Int64;
          SELECT author_id FROM trigger_messages
          WHERE chat_id = $chat_id AND message_id = $message_id;
        `,
        parameters: {
          $chat_id: TypedValues.int64(chatId),
          $message_id: TypedValues.int64(messageId),
        },
      })
      const rows = await drain(res)
      const first = rows[0]
      if (!first) return null // (tsconfig: noUncheckedIndexedAccess — нельзя rows[0].x без проверки)
      return { author_id: Number(first.authorId) }
    },
  })
}
