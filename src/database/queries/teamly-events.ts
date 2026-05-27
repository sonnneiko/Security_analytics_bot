import { Driver, TypedValues, Types } from 'ydb-sdk'

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
