import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues } from 'ydb-sdk'
import { withSession } from '../client.js'

export interface TriggerChatRow {
  chat_id: number
  title: string
  added_at: Date
}

export async function upsertTriggerChat(
  driver: Driver,
  chat: { chat_id: number; title: string },
): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $chat_id AS Int64;
       DECLARE $title AS Utf8;
       DECLARE $now AS Timestamp;
       UPSERT INTO trigger_chats (chat_id, title, added_at) VALUES ($chat_id, $title, $now);`,
      {
        $chat_id: TypedValues.int64(chat.chat_id),
        $title: TypedValues.utf8(chat.title),
        $now: TypedValues.timestamp(new Date()),
      },
      AUTO_TX,
    )
  })
}

export async function removeTriggerChat(driver: Driver, chatId: number): Promise<void> {
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $chat_id AS Int64;
       DELETE FROM trigger_chats WHERE chat_id = $chat_id;`,
      { $chat_id: TypedValues.int64(chatId) },
      AUTO_TX,
    )
  })
}

export async function listTriggerChats(driver: Driver): Promise<TriggerChatRow[]> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `SELECT chat_id, title, added_at FROM trigger_chats ORDER BY added_at;`,
      {},
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
      chat_id: number | bigint
      title: string
      added_at: Date
    }>
    return rows.map((r) => ({
      chat_id: Number(r.chat_id),
      title: r.title,
      added_at: r.added_at,
    }))
  })
}

export async function isTriggerChat(driver: Driver, chatId: number): Promise<boolean> {
  return withSession(driver, async (session) => {
    const result = await session.executeQuery(
      `DECLARE $chat_id AS Int64;
       SELECT 1 AS one FROM trigger_chats WHERE chat_id = $chat_id;`,
      { $chat_id: TypedValues.int64(chatId) },
      AUTO_TX,
    )
    const rows = TypedData.createNativeObjects(result.resultSets[0])
    return rows.length > 0
  })
}
