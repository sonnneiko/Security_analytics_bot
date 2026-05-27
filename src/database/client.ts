import { Driver, IamAuthService, getSACredentialsFromJson } from 'ydb-sdk'
import { config } from '../config.js'
import { logger } from '../logger.js'

let driverInstance: Driver | null = null

export async function getDriver(): Promise<Driver> {
  if (driverInstance) return driverInstance

  const saCreds = getSACredentialsFromJson(config.ydbSaKeyFile)
  const authService = new IamAuthService(saCreds)

  const driver = new Driver({
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
