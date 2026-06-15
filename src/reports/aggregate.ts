import type { TelegramEventRow } from '../database/queries/telegram-events.js'
import type { TeamlyEventType } from '../database/queries/teamly-events.js'
import type { SbEmployeeRow } from '../database/queries/employees.js'
import type { TriggerChatRow } from '../database/queries/trigger-chats.js'
import { isoWeekMondayMsk } from './period.js'

export interface ChatEmployeeStat {
  telegram_id: number
  full_name: string
  handled: number
  unique: number
}
export interface ChatBreakdown {
  chat_id: number
  title: string
  perEmployee: ChatEmployeeStat[]
  handled: number
  unique: number
}
export interface EmployeeStat {
  telegram_id: number
  full_name: string
  tg: { handled: number; unique: number }
  teamly: { created: number; commented: number }
}
export interface ReportData {
  employees: EmployeeStat[]
  chatsActive: ChatBreakdown[]
  chatsEmpty: { chat_id: number; title: string }[]
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

// КОМАНДНЫЕ уникальные триггеры по ISO-неделям (МСК): один триггер, обработанный
// несколькими сотрудниками СБ, считается ОДИН раз (в отличие от totals.unique,
// который суммирует уникальные по каждому сотруднику).
export function uniqueTriggersByWeek(
  rows: TelegramEventRow[],
  employeeIds: Set<number>,
  chatIds: Set<number>,
): Record<string, number> {
  const byWeek = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!chatIds.has(r.chat_id) || !employeeIds.has(r.employee_id)) continue
    const tid = triggerIdOf(r)
    if (tid === null) continue
    const week = isoWeekMondayMsk(r.occurred_at)
    let set = byWeek.get(week)
    if (!set) {
      set = new Set()
      byWeek.set(week, set)
    }
    set.add(`${r.chat_id}:${tid}`)
  }
  const out: Record<string, number> = {}
  for (const [week, set] of byWeek) out[week] = set.size
  return out
}

export function buildReportData(input: Input): ReportData {
  const teamlyById = new Map<number, { created: number; commented: number }>()
  for (const e of input.teamly) {
    const acc = teamlyById.get(e.employee_id) ?? { created: 0, commented: 0 }
    if (e.event_type === 'article_create') acc.created++
    else if (e.event_type === 'comment_create') acc.commented++
    teamlyById.set(e.employee_id, acc)
  }

  const chatById = new Map(input.chats.map((c) => [c.chat_id, c.title]))
  const empById = new Map(input.employees.map((e) => [e.telegram_id, e.full_name]))

  type CEStats = { handled: number; uniq: Set<number> }
  const perChatEmp = new Map<number, Map<number, CEStats>>()
  const empUniq = new Map<number, Set<string>>()

  for (const r of input.telegram) {
    if (!chatById.has(r.chat_id) || !empById.has(r.employee_id)) continue
    let chatMap = perChatEmp.get(r.chat_id)
    if (!chatMap) {
      chatMap = new Map()
      perChatEmp.set(r.chat_id, chatMap)
    }
    let s = chatMap.get(r.employee_id)
    if (!s) {
      s = { handled: 0, uniq: new Set() }
      chatMap.set(r.employee_id, s)
    }
    s.handled++
    const tid = triggerIdOf(r)
    if (tid !== null) {
      s.uniq.add(tid)
      let eu = empUniq.get(r.employee_id)
      if (!eu) {
        eu = new Set()
        empUniq.set(r.employee_id, eu)
      }
      eu.add(`${r.chat_id}:${tid}`)
    }
  }

  const employees: EmployeeStat[] = input.employees.map((emp) => {
    let handled = 0
    for (const chatMap of perChatEmp.values()) {
      const s = chatMap.get(emp.telegram_id)
      if (s) handled += s.handled
    }
    const unique = empUniq.get(emp.telegram_id)?.size ?? 0
    const teamly = teamlyById.get(emp.telegram_id) ?? { created: 0, commented: 0 }
    return {
      telegram_id: emp.telegram_id,
      full_name: emp.full_name,
      tg: { handled, unique },
      teamly,
    }
  })

  const breakdowns: ChatBreakdown[] = input.chats.map((c) => {
    const chatMap = perChatEmp.get(c.chat_id)
    const perEmployee: ChatEmployeeStat[] = input.employees.map((emp) => {
      const s = chatMap?.get(emp.telegram_id)
      return {
        telegram_id: emp.telegram_id,
        full_name: emp.full_name,
        handled: s?.handled ?? 0,
        unique: s?.uniq.size ?? 0,
      }
    })
    const handled = perEmployee.reduce((sum, e) => sum + e.handled, 0)
    const unique = perEmployee.reduce((sum, e) => sum + e.unique, 0)
    return { chat_id: c.chat_id, title: c.title, perEmployee, handled, unique }
  })

  const chatsActive = breakdowns
    .filter((b) => b.handled > 0)
    .sort(
      (a, b) =>
        b.handled - a.handled ||
        b.unique - a.unique ||
        a.title.localeCompare(b.title, 'ru'),
    )
  const chatsEmpty = breakdowns
    .filter((b) => b.handled === 0)
    .map((b) => ({ chat_id: b.chat_id, title: b.title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))

  const totals = employees.reduce(
    (s, e) => ({
      handled: s.handled + e.tg.handled,
      unique: s.unique + e.tg.unique,
      created: s.created + e.teamly.created,
      commented: s.commented + e.teamly.commented,
    }),
    { handled: 0, unique: 0, created: 0, commented: 0 },
  )

  return {
    employees,
    chatsActive,
    chatsEmpty,
    totals,
    activeChats: chatsActive.length,
    employeeCount: input.employees.length,
  }
}
