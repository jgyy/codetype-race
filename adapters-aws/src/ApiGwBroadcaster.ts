import {
    ApiGatewayManagementApiClient,
    DeleteConnectionCommand,
    PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { Broadcaster } from "@codetype/domain";
import { wsHttpHandler } from "./wsHttpHandler";

export interface ApiGwBroadcasterConfig {
    endpoint: string;
}

export class ApiGwBroadcaster implements Broadcaster {
    private readonly client: ApiGatewayManagementApiClient;
    constructor(cfg: ApiGwBroadcasterConfig) {
        this.client = new ApiGatewayManagementApiClient({
            endpoint: cfg.endpoint,
            requestHandler: wsHttpHandler,
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

    async disconnect(connectionId: string): Promise<void> {
        try {
            await this.client.send(
                new DeleteConnectionCommand({ ConnectionId: connectionId }),
            );
        } catch {
        }
    }
}
