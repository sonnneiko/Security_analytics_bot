import { Bot } from 'grammy'
import { config } from './config'

const DENY_MESSAGE =
  'Здравствуйте!\nЯ не знаю кто вы и не буду с вами разговаривать!\nЗа доступом можно обратиться: @Alhazova_UnitPay'

const sbIds = new Set(config.sbEmployees.map((e) => e.telegram_id))
const adminIds = new Set(config.botAdmins)

const bot = new Bot(config.botToken)

bot.on('message', async (ctx) => {
  const userId = ctx.from?.id
  if (userId === undefined) return

  const firstName = ctx.from?.first_name ?? 'друг'
  const username = ctx.from?.username ?? '-'

  if (!sbIds.has(userId) && !adminIds.has(userId)) {
    console.log(
      `[unauthorized] telegram_id=${userId} username=@${username} first_name=${firstName}`,
    )
    await ctx.reply(DENY_MESSAGE)
    return
  }

  await ctx.reply(`Привет, ${firstName}\nРад тебя видеть!)`)
})

bot.catch((err) => {
  console.error('Bot error:', err)
})

await bot.start({
  onStart: (botInfo) => {
    console.log(`Bot started: @${botInfo.username}`)
    console.log(`SB employees: ${[...sbIds].join(', ') || '(none)'}`)
    console.log(`Bot admins:   ${[...adminIds].join(', ') || '(none)'}`)
  },
})
