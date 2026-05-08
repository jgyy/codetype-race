import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
    roomPK,
    teamRoomPrefix,
    teamRoomSK,
} from "@codetype/shared/ddb-keys";
import type { Team } from "@codetype/shared/social";
import { ddb, TABLE } from "../ddb";

interface TeamRow extends Team {
    PK: string;
    SK: string;
}

export class TeamRoomRepo {
    constructor(private readonly client: DynamoDBDocumentClient = ddb) { }

    async putTeams(roomId: string, teams: Team[]): Promise<void> {
        await Promise.all(
            teams.map((t) =>
                this.client.send(
                    new PutCommand({
                        TableName: TABLE,
                        Item: {
                            PK: roomPK(roomId),
                            SK: teamRoomSK(t.id),
                            ...t,
                        },
                    }),
                ),
            ),
        );
    }

    async listTeams(roomId: string): Promise<Team[]> {
        const r = await this.client.send(
            new QueryCommand({
                TableName: TABLE,
                KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
                ExpressionAttributeValues: {
                    ":pk": roomPK(roomId),
                    ":sk": teamRoomPrefix(),
                },
            }),
        );
        return (r.Items as TeamRow[] | undefined) ?? [];
    }
}

export const teamRooms = new TeamRoomRepo();
