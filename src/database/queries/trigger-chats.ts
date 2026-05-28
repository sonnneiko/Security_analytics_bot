import type { Driver } from 'ydb-sdk'
import { TypedValues } from 'ydb-sdk'

export interface TriggerChatRow {
  chat_id: number
  title: string
  added_at: Date
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

export async function upsertTriggerChat(
  driver: Driver,
  chat: { chat_id: number; title: string },
): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DECLARE $title AS Utf8;
          DECLARE $now AS Timestamp;
          UPSERT INTO trigger_chats (chat_id, title, added_at) VALUES ($chat_id, $title, $now);
        `,
        parameters: {
          $chat_id: TypedValues.int64(chat.chat_id),
          $title: TypedValues.utf8(chat.title),
          $now: TypedValues.timestamp(new Date()),
        },
      })
      await res.opFinished
    },
  })
}

export async function removeTriggerChat(driver: Driver, chatId: number): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          DELETE FROM trigger_chats WHERE chat_id = $chat_id;
        `,
        parameters: { $chat_id: TypedValues.int64(chatId) },
      })
      await res.opFinished
    },
  })
}

export async function listTriggerChats(driver: Driver): Promise<TriggerChatRow[]> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `SELECT chat_id, title, added_at FROM trigger_chats ORDER BY added_at;`,
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        chat_id: Number(r.chatId),
        title: r.title as string,
        added_at: r.addedAt as Date,
      }))
    },
  })
}

export async function isTriggerChat(driver: Driver, chatId: number): Promise<boolean> {
  return driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $chat_id AS Int64;
          SELECT 1 AS one FROM trigger_chats WHERE chat_id = $chat_id;
        `,
        parameters: { $chat_id: TypedValues.int64(chatId) },
      })
      const rows = await drain(res)
      return rows.length > 0
    },
  })
}
