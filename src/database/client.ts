import { createRequire } from 'node:module'
import type { Driver } from 'ydb-sdk'
import { IamAuthService, getSACredentialsFromJson } from 'ydb-sdk'
import { config } from '../config.js'
import { logger } from '../logger.js'

// ydb-sdk's ESM build omits the `Driver` named export (only its CJS build has it),
// so load the class from the CJS entry — works on Node 20+ regardless of resolver.
const { Driver: DriverClass } = createRequire(import.meta.url)('ydb-sdk') as typeof import('ydb-sdk')

const DEFAULT_TIMEOUT_MS = 10_000

// Table API (driver.tableClient.withSession + session.executeQuery) is used
// instead of Query API because the long-lived Query API session deteriorates
// auth after ~12-16h (см. [[project-ydb-auth-degrades]]).
export function withSession<T>(
  driver: Driver,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (session: any) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return Promise.race([
    driver.tableClient.withSession(fn) as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`YDB query timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

let driverInstance: Driver | null = null

export async function getDriver(): Promise<Driver> {
  if (driverInstance) return driverInstance

  const saCreds = getSACredentialsFromJson(config.ydbSaKeyFile)
  const authService = new IamAuthService(saCreds)

  const driver = new DriverClass({
    endpoint: config.ydbEndpoint,
    database: config.ydbDatabase,
    authService,
  })

  const ready = await driver.ready(10_000)
  if (!ready) {
    throw new Error('YDB driver failed to become ready within 10s')
  }

  driverInstance = driver
  logger.info({ endpoint: config.ydbEndpoint, database: config.ydbDatabase }, 'YDB connected')
  return driver
}

export async function closeDriver(): Promise<void> {
  if (driverInstance) {
    await driverInstance.destroy()
    driverInstance = null
  }
}
