import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { logger } from '../logger.js'
import { teamlyWebhookRoute } from './teamly-webhook.js'
import type { TeamlySource } from '../sources/teamly/teamly-source.js'

export interface ServerOptions {
  port: number
  teamlyWebhookSecret: string | null
  teamlySource: TeamlySource | null
}

export interface RunningServer {
  close(): Promise<void>
}

export function startServer(opts: ServerOptions): RunningServer {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  if (opts.teamlyWebhookSecret && opts.teamlySource) {
    app.route('/', teamlyWebhookRoute(opts.teamlyWebhookSecret, opts.teamlySource))
    logger.info('teamly webhook route registered')
  } else {
    logger.warn('teamly webhook NOT registered (no secret or no source)')
  }

  // TODO master-plan-2: register telegram webhook route here when we move
  // from polling to webhook for the bot.

  const server = serve({ fetch: app.fetch, port: opts.port }, (info) => {
    logger.info({ port: info.port }, 'http server listening')
  })

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  }
}
