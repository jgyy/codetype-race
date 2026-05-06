import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";

const endpoint = process.env.WS_ENDPOINT;
export const wsClient = endpoint
  ? new ApiGatewayManagementApiClient({ endpoint })
  : null;

export async function postTo(connectionId: string, payload: unknown) {
  if (!wsClient) throw new Error("WS_ENDPOINT not set");
  try {
    await wsClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(payload)),
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof GoneException) return false;
    throw e;
  }
}
