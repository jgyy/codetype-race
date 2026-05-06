import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./ddb";
import { connGSI1PK, roomPK } from "./shared/ddb-keys";

export async function resolveConnection(connectionId: string) {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": connGSI1PK(connectionId) },
      Limit: 1,
    }),
  );
  const c = r.Items?.[0];
  if (!c) return null;
  return {
    roomId: (c.PK as string).slice("ROOM#".length),
    displayName: c.display_name as string,
  };
}

export async function listConnectionsInRoom(roomId: string): Promise<string[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": roomPK(roomId), ":sk": "CONN#" },
    }),
  );
  return (r.Items ?? []).map((i) => i.connection_id as string);
}
