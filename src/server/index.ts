import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import type { Driver } from 'ydb-sdk'
import { logger } from '../logger.js'
import { teamlyWebhookRoute } from './teamly-webhook.js'
import { triggerStatsRoute } from './trigger-stats.js'
import type { TeamlySource } from '../sources/teamly/teamly-source.js'
import type { HealthReport } from '../health.js'

export interface ServerOptions {
  port: number
  teamlyWebhookSecret: string | null
  teamlySource: TeamlySource | null
  statsToken: string | null
  driver: Driver
  // Если задан — /healthz отдаёт JSON-статус и 200/503; иначе простой 'ok'.
  health?: () => Promise<HealthReport>
}

export interface RunningServer {
  close(): Promise<void>
}

export function startServer(opts: ServerOptions): RunningServer {
  const app = new Hono()

  const health = opts.health
  if (health) {
    app.get('/healthz', async (c) => {
      const report = await health()
      return c.json(report, report.ok ? 200 : 503)
    })
  } else {
    app.get('/healthz', (c) => c.text('ok'))
  }

  if (opts.teamlyWebhookSecret && opts.teamlySource) {
    app.route('/', teamlyWebhookRoute(opts.teamlyWebhookSecret, opts.teamlySource))
    logger.info('teamly webhook route registered')
  } else {
    logger.warn('teamly webhook NOT registered (no secret or no source)')
  }

  if (opts.statsToken) {
    app.route('/', triggerStatsRoute(opts.statsToken, opts.driver))
    logger.info('trigger-stats route registered')
  } else {
    logger.info('trigger-stats route NOT registered (no BOT_STATS_TOKEN)')
  }

  // TODO master-plan-2: register telegram webhook route here when we move
  // from polling to webhook for the bot.

  // bind loopback only: наружу сервер не торчит, входящий Teamly webhook идёт
  // через Caddy (reverse_proxy localhost:8080), дашборд тянет /internal/* по localhost
  const server = serve({ fetch: app.fetch, port: opts.port, hostname: '127.0.0.1' }, (info) => {
    logger.info({ port: info.port, hostname: '127.0.0.1' }, 'http server listening')
  })

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
