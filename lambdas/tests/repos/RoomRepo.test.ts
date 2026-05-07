import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mockClient } from "aws-sdk-client-mock";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { RoomRepo } from "../../src/repos/RoomRepo";
import { AppError } from "../../src/AppError";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());
afterEach(() => ddbMock.reset());

describe("RoomRepo", () => {
  test("create stores the room and uses ConditionExpression", async () => {
    ddbMock.on(PutCommand).resolves({});
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);

    await repo.create({
      room_id: "r1",
      code: "ABCDEF",
      host_id: "h1",
      snippet_id: "s1",
      status: "lobby",
      created_at: 1,
      version: 0,
    });

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input.ConditionExpression).toContain(
      "attribute_not_exists",
    );
  });

  test("create maps ConditionalCheckFailed to Conflict", async () => {
    ddbMock.on(PutCommand).rejects(
      new ConditionalCheckFailedException({
        $metadata: {},
        message: "exists",
      }),
    );
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);

    await expect(
      repo.create({
        room_id: "r1",
        code: "ABCDEF",
        host_id: "h1",
        snippet_id: "s1",
        status: "lobby",
        created_at: 1,
        version: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" } as Partial<AppError>);
  });

  test("getByCode returns the first item or null", async () => {
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);
    ddbMock.on(QueryCommand).resolves({ Items: [{ room_id: "r1" }] });
    expect((await repo.getByCode("ABCDEF"))?.room_id).toBe("r1");

    ddbMock.reset();
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    expect(await repo.getByCode("ZZZZZZ")).toBeNull();
  });

  test("getMeta returns the META row", async () => {
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);
    ddbMock.on(GetCommand).resolves({ Item: { room_id: "r1", status: "lobby" } });
    const r = await repo.getMeta("r1");
    expect(r?.status).toBe("lobby");
  });

  test("addPlayer maps duplicate name to Conflict", async () => {
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);
    ddbMock.on(PutCommand).rejects(
      new ConditionalCheckFailedException({
        $metadata: {},
        message: "exists",
      }),
    );
    await expect(
      repo.addPlayer("r1", {
        display_name: "Alice",
        joined_at: 1,
        chars_typed: 0,
        errors: 0,
        progress: 0,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("startCountdown maps already-started to Conflict", async () => {
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);
    ddbMock.on(UpdateCommand).rejects(
      new ConditionalCheckFailedException({
        $metadata: {},
        message: "not lobby",
      }),
    );
    await expect(repo.startCountdown("r1", 100)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  test("countPlayers returns Count", async () => {
    const repo = new RoomRepo(ddbMock as unknown as DynamoDBDocumentClient);
    ddbMock.on(QueryCommand).resolves({ Count: 3 });
    expect(await repo.countPlayers("r1")).toBe(3);
  });
});
