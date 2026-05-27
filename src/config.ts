import 'dotenv/config'
import * as v from 'valibot'

const SbEmployeeSchema = v.object({
  telegram_id: v.number(),
  name: v.string(),
  teamly_user_id: v.optional(v.string()),
})

export type SbEmployee = v.InferOutput<typeof SbEmployeeSchema>

function jsonArray<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  itemSchema: TSchema,
) {
  return v.pipe(
    v.string(),
    v.transform((raw) => JSON.parse(raw) as unknown),
    v.array(itemSchema),
  )
}

const ConfigSchema = v.object({
  botToken: v.pipe(v.string(), v.minLength(10)),
  sbEmployees: jsonArray(SbEmployeeSchema),
  botAdmins: v.optional(jsonArray(v.number()), '[]'),
  ydbEndpoint: v.pipe(v.string(), v.startsWith('grpcs://')),
  ydbDatabase: v.pipe(v.string(), v.startsWith('/')),
  ydbSaKeyFile: v.string(),
  logLevel: v.optional(v.picklist(['trace', 'debug', 'info', 'warn', 'error']), 'info'),
  serverPort: v.optional(v.pipe(v.string(), v.transform(Number), v.number()), '8080'),
  teamlySlug: v.optional(v.string()),
  teamlyClientId: v.optional(v.string()),
  teamlyClientSecret: v.optional(v.string()),
  teamlyRedirectUri: v.optional(v.string()),
  teamlyAuthCode: v.optional(v.string()),
  teamlyWebhookSecret: v.optional(v.string()),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export const config: Config = v.parse(ConfigSchema, {
  botToken: process.env.BOT_TOKEN,
  sbEmployees: process.env.INITIAL_SB_USERS,
  botAdmins: process.env.BOT_ADMINS,
  ydbEndpoint: process.env.YDB_ENDPOINT,
  ydbDatabase: process.env.YDB_DATABASE,
  ydbSaKeyFile: process.env.YDB_SA_KEY_FILE,
  logLevel: process.env.LOG_LEVEL,
  serverPort: process.env.SERVER_PORT,
  teamlySlug: process.env.TEAMLY_SLUG,
  teamlyClientId: process.env.TEAMLY_CLIENT_ID,
  teamlyClientSecret: process.env.TEAMLY_CLIENT_SECRET,
  teamlyRedirectUri: process.env.TEAMLY_REDIRECT_URI,
  teamlyAuthCode: process.env.TEAMLY_AUTH_CODE,
  teamlyWebhookSecret: process.env.TEAMLY_WEBHOOK_SECRET,
})
