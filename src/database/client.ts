import { createRequire } from 'node:module'
import type { Driver } from 'ydb-sdk'
import { IamAuthService, getSACredentialsFromJson } from 'ydb-sdk'
import { config } from '../config.js'
import { logger } from '../logger.js'

// ydb-sdk's ESM build omits the `Driver` named export (only its CJS build has it),
// so load the class from the CJS entry — works on Node 20+ regardless of resolver.
const { Driver: DriverClass } = createRequire(import.meta.url)('ydb-sdk') as typeof import('ydb-sdk')

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
