import type { Driver } from 'ydb-sdk'
import { AUTO_TX, TypedData, TypedValues, Types } from 'ydb-sdk'
import { withSession } from '../client.js'

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
  await withSession(driver, async (session) => {
    await session.executeQuery(
      `DECLARE $event_id AS Utf8;
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
         ($event_id, $employee_id, $teamly_user_id, $event_type, $entity_id, $container_id, $occurred_at, $payload);`,
      {
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
      AUTO_TX,
    )
  })
}

export async function selectEventsForPeriod(
  driver: Driver,
  fromUtc: Date,
  toUtc: Date,
): Promise<Pick<TeamlyEventRow, 'employee_id' | 'event_type'>[]> {
  return withSession(
    driver,
    async (session) => {
      const result = await session.executeQuery(
        `DECLARE $from AS Timestamp;
         DECLARE $to AS Timestamp;
         SELECT employee_id, event_type
         FROM teamly_events
         WHERE occurred_at >= $from AND occurred_at < $to;`,
        {
          $from: TypedValues.timestamp(fromUtc),
          $to: TypedValues.timestamp(toUtc),
        },
        AUTO_TX,
      )
      const rows = TypedData.createNativeObjects(result.resultSets[0]) as unknown as Array<{
        employee_id: number | bigint
        event_type: TeamlyEventType
      }>
      return rows.map((r) => ({
        employee_id: Number(r.employee_id),
        event_type: r.event_type,
      }))
    },
    30_000,
  )
}
