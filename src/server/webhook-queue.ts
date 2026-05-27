import { logger } from '../logger.js'

export class WebhookQueue<T> {
  private items: T[] = []
  private running = false

  constructor(private readonly worker: (item: T) => Promise<void>) {}

  push(item: T): void {
    this.items.push(item)
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      while (this.items.length > 0) {
        const next = this.items.shift()!
        try {
          await this.worker(next)
        } catch (err) {
          logger.error({ err }, 'webhook-queue worker threw, dropping event')
        }
      }
    } finally {
      this.running = false
    }
  }
}
