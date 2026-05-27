export interface DateRange {
  from: Date
  to: Date
}

export interface DataSource {
  readonly name: 'telegram' | 'teamly' | 'mail'
  init(): Promise<void>
  handleIncomingEvent?(update: unknown): Promise<void>
  ensureFreshSnapshot?(period: DateRange): Promise<void>
}
