import 'dotenv/config'

export type SbEmployee = { telegram_id: number; name: string }

function required(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env: ${key}`)
  return v
}

function parseJsonArray<T>(key: string, fallback?: T[]): T[] {
  const raw = process.env[key]
  if (!raw) {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env: ${key}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`Invalid JSON in env ${key}: ${(e as Error).message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Env ${key} must be a JSON array`)
  }
  return parsed as T[]
}

export const config = {
  botToken: required('BOT_TOKEN'),
  sbEmployees: parseJsonArray<SbEmployee>('INITIAL_SB_USERS'),
  botAdmins: parseJsonArray<number>('BOT_ADMINS', []),
}
