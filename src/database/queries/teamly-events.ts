import type { Driver } from 'ydb-sdk'
import { TypedValues, Types } from 'ydb-sdk'

export type TeamlyEventType = 'article_create' | 'comment_create'

export interface TeamlyEventRow {
  event_id: string
  employee_id: number
  teamly_user_id: string
  event_type: TeamlyEventType
  entity_id: string
  container_id: string | null
  occurred_at: Date
  payload: Record<string, unknown>
}

export async function insertEvent(driver: Driver, row: TeamlyEventRow): Promise<void> {
  await driver.queryClient.do({
    timeout: 10_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $event_id AS Utf8;
          DECLARE $employee_id AS Uint64;
          DECLARE $teamly_user_id AS Utf8;
          DECLARE $event_type AS Utf8;
          DECLARE $entity_id AS Utf8;
          DECLARE $container_id AS Utf8?;
          DECLARE $occurred_at AS Timestamp;
          DECLARE $payload AS Json;
          UPSERT INTO teamly_events
            (event_id, employee_id, teamly_user_id, event_type, entity_id, container_id, occurred_at, payload)
          VALUES
            ($event_id, $employee_id, $teamly_user_id, $event_type, $entity_id, $container_id, $occurred_at, $payload);
        `,
        parameters: {
          $event_id: TypedValues.utf8(row.event_id),
          $employee_id: TypedValues.uint64(row.employee_id),
          $teamly_user_id: TypedValues.utf8(row.teamly_user_id),
          $event_type: TypedValues.utf8(row.event_type),
          $entity_id: TypedValues.utf8(row.entity_id),
          $container_id:
            row.container_id == null
              ? TypedValues.optionalNull(Types.UTF8)
              : TypedValues.optional(TypedValues.utf8(row.container_id)),
          $occurred_at: TypedValues.timestamp(row.occurred_at),
          $payload: TypedValues.json(JSON.stringify(row.payload)),
        },
      })
      await res.opFinished
    },
  })
}

async function drain(execResult: {
  resultSets: AsyncGenerator<{ rows: AsyncGenerator<Record<string, unknown>, void> }>
  opFinished: Promise<void>
}): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for await (const rs of execResult.resultSets) {
    for await (const row of rs.rows) all.push(row)
  }
  await execResult.opFinished
  return all
}

export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<Pick<TeamlyEventRow, 'employee_id' | 'event_type'>[]> {
  return driver.queryClient.do({
    timeout: 30_000,
    fn: async (session) => {
      const res = await session.execute({
        text: `
          DECLARE $from AS Timestamp;
          DECLARE $to AS Timestamp;
          SELECT employee_id, event_type
          FROM teamly_events
          WHERE occurred_at >= $from AND occurred_at < $to;
        `,
        parameters: {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
      })
      const rows = await drain(res)
      return rows.map((r) => ({
        employee_id: Number(r.employeeId),
        event_type: r.eventType as TeamlyEventType,
      }))
    },
  })
}
