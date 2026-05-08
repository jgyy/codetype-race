import {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { Broadcaster } from "@codetype/domain";

export interface ApiGwBroadcasterConfig {
    /** WS callback URL (passed to APIGW Management API). */
    endpoint: string;
}

/**
 * Tolerant broadcaster — per-connection failures (typically 410 Gone
 * for a closed socket) are caught and reported as `false`. The caller
 * decides whether to evict; we never let a single dead peer fail the
 * batch.
 */
export class ApiGwBroadcaster implements Broadcaster {
    private readonly client: ApiGatewayManagementApiClient;
    constructor(cfg: ApiGwBroadcasterConfig) {
        this.client = new ApiGatewayManagementApiClient({
            endpoint: cfg.endpoint,
        });
    }

    async postTo(connectionId: string, payload: unknown): Promise<boolean> {
        try {
            await this.client.send(
                new PostToConnectionCommand({
                    ConnectionId: connectionId,
                    Data: Buffer.from(JSON.stringify(payload)),
                }),
            );
            return true;
        } catch {
            return false;
        }
    }
}
