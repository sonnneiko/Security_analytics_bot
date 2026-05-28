import type { TelegramEventRow } from '../database/queries/telegram-events.js'
import type { TeamlyEventType } from '../database/queries/teamly-events.js'
import type { SbEmployeeRow } from '../database/queries/employees.js'
import type { TriggerChatRow } from '../database/queries/trigger-chats.js'

export interface ChatStat { chat_id: number; title: string; handled: number; unique: number }
export interface EmployeeStat {
  telegram_id: number
  full_name: string
  tg: { handled: number; unique: number }
  teamly: { created: number; commented: number }
  perChat: ChatStat[]
}
export interface ReportData {
  employees: EmployeeStat[]
  totals: { handled: number; unique: number; created: number; commented: number }
  activeChats: number
  employeeCount: number
}

interface Input {
  telegram: TelegramEventRow[]
  teamly: { employee_id: number; event_type: TeamlyEventType }[]
  employees: SbEmployeeRow[]
  chats: TriggerChatRow[]
}

function triggerIdOf(row: TelegramEventRow): number | null {
  const p = row.payload as Record<string, unknown>
  const id = row.event_type === 'trigger_reply' ? p.reply_to_message_id : p.trigger_message_id
  return typeof id === 'number' ? id : null
}

export function buildReportData(input: Input): ReportData {
  const chatTitle = new Map(input.chats.map((c) => [c.chat_id, c.title]))
  const teamlyById = new Map<number, { created: number; commented: number }>()
  for (const e of input.teamly) {
    const acc = teamlyById.get(e.employee_id) ?? { created: 0, commented: 0 }
    if (e.event_type === 'article_create') acc.created++
    else if (e.event_type === 'comment_create') acc.commented++
    teamlyById.set(e.employee_id, acc)
  }

  const activeChatIds = new Set<number>()
  const employees: EmployeeStat[] = input.employees.map((emp) => {
    const rows = input.telegram.filter((r) => r.employee_id === emp.telegram_id && chatTitle.has(r.chat_id))
    const perChatMap = new Map<number, { handled: number; uniq: Set<number> }>()
    const empUniq = new Set<string>()
    for (const r of rows) {
      activeChatIds.add(r.chat_id)
      const c = perChatMap.get(r.chat_id) ?? { handled: 0, uniq: new Set<number>() }
      c.handled++
      const tid = triggerIdOf(r)
      if (tid !== null) { c.uniq.add(tid); empUniq.add(`${r.chat_id}:${tid}`) }
      perChatMap.set(r.chat_id, c)
    }
    const perChat: ChatStat[] = [...perChatMap.entries()].map(([chat_id, v]) => ({
      chat_id, title: chatTitle.get(chat_id)!, handled: v.handled, unique: v.uniq.size,
    }))
    const tg = { handled: perChat.reduce((s, c) => s + c.handled, 0), unique: empUniq.size }
    const teamly = teamlyById.get(emp.telegram_id) ?? { created: 0, commented: 0 }
    return { telegram_id: emp.telegram_id, full_name: emp.full_name, tg, teamly, perChat }
  })

  const totals = employees.reduce(
    (s, e) => ({ handled: s.handled + e.tg.handled, unique: s.unique + e.tg.unique, created: s.created + e.teamly.created, commented: s.commented + e.teamly.commented }),
    { handled: 0, unique: 0, created: 0, commented: 0 },
  )
  return { employees, totals, activeChats: activeChatIds.size, employeeCount: input.employees.length }
}
