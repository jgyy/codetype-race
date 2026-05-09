import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { withTraceparent } from "./traceContext";

const endpoint = process.env.WS_ENDPOINT;
export const wsClient = endpoint
  ? new ApiGatewayManagementApiClient({ endpoint })
  : null;

export async function postTo(connectionId: string, payload: unknown) {
  if (!wsClient) throw new Error("WS_ENDPOINT not set");
  // Phase 15 / slice-5: inject W3C traceparent into structured frames so
  // browser-side RUM can continue the same trace across the WS round-trip.
  const framed = withTraceparent(payload);
  try {
    await wsClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(framed)),
      }),
    );
    return true;
  } catch (e) {
    if (e instanceof GoneException) return false;
    throw e;
  }
}
