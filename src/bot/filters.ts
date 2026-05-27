import type { AppContext } from './context.js'

export function isSbEmployee(ctx: AppContext): boolean {
  const id = ctx.from?.id
  if (id === undefined) return false
  return ctx.deps.sbEmployeeIds.has(id)
}

export function hasBotAccess(ctx: AppContext): boolean {
  const id = ctx.from?.id
  if (id === undefined) return false
  return ctx.deps.sbEmployeeIds.has(id) || ctx.deps.botAdminIds.has(id)
}
