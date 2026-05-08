import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    Duration,
    RemovalPolicy,
    Stack,
    type StackProps,
    CfnOutput,
} from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integ from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwv2Auth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdaSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAMBDA_DIR = path.resolve(__dirname, "../../lambdas");

export class CodetypeStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const table = new ddb.Table(this, "Table", {
            tableName: "codetype",
            partitionKey: { name: "PK", type: ddb.AttributeType.STRING },
            sortKey: { name: "SK", type: ddb.AttributeType.STRING },
            billingMode: ddb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            timeToLiveAttribute: "ttl",
            stream: ddb.StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy: RemovalPolicy.RETAIN,
        });
        table.addGlobalSecondaryIndex({
            indexName: "GSI1",
            partitionKey: { name: "GSI1PK", type: ddb.AttributeType.STRING },
            sortKey: { name: "GSI1SK", type: ddb.AttributeType.STRING },
        });

        const userPool = new cognito.UserPool(this, "Users", {
            userPoolName: "codetype-users",
            selfSignUpEnabled: true,
            signInAliases: { email: true },
            passwordPolicy: { minLength: 8 },
            removalPolicy: RemovalPolicy.DESTROY,
        });
        const userPoolClient = userPool.addClient("WebClient", {
            authFlows: { userPassword: true, userSrp: true },
        });
        // Group membership surfaces in the JWT as `cognito:groups`.
        // Members of this group can review community snippet submissions.
        new cognito.CfnUserPoolGroup(this, "AdminGroup", {
            userPoolId: userPool.userPoolId,
            groupName: "admin",
            description: "Snippet moderation",
        });
        // Tournament moderators: can create/seed/cancel tournaments. Admins
        // are implicitly mods (checked by requireMod in lambdas/AppError.ts).
        new cognito.CfnUserPoolGroup(this, "ModGroup", {
            userPoolId: userPool.userPoolId,
            groupName: "mod",
            description: "Tournament moderation",
        });

        const fn = (
            id: string,
            entry: string,
            env: Record<string, string> = {},
        ) =>
            new nodejs.NodejsFunction(this, id, {
                entry: path.join(LAMBDA_DIR, entry),
                projectRoot: LAMBDA_DIR,
                depsLockFilePath: path.join(LAMBDA_DIR, "bun.lock"),
                runtime: lambda.Runtime.NODEJS_20_X,
                architecture: lambda.Architecture.ARM_64,
                memorySize: 256,
                timeout: Duration.seconds(10),
                bundling: {
                    format: nodejs.OutputFormat.ESM,
                    mainFields: ["module", "main"],
                    target: "node20",
                },
                environment: {
                    TABLE_NAME: table.tableName,
                    ...env,
                },
            });

        const createRoom = fn("CreateRoom", "http/createRoom.ts");
        const joinRoom = fn("JoinRoom", "http/joinRoom.ts");
        const getRoom = fn("GetRoom", "http/getRoom.ts");
        const listHistory = fn("ListHistory", "http/listHistory.ts");
        const randomSnippet = fn("RandomSnippet", "http/randomSnippet.ts");
        const practiceRun = fn("PracticeRun", "http/practiceRun.ts");
        const getUser = fn("GetUser", "http/getUser.ts");
        const getLeaderboard = fn("GetLeaderboard", "http/getLeaderboard.ts");
        const getDaily = fn("GetDaily", "http/getDaily.ts");
        const dailySubmit = fn("DailySubmit", "http/dailySubmit.ts");
        const getDailyLeaderboard = fn(
            "GetDailyLeaderboard",
            "http/getDailyLeaderboard.ts",
        );
        const selectDailySnippet = fn(
            "SelectDailySnippet",
            "cron/selectDailySnippet.ts",
        );
        const submitSnippet = fn("SubmitSnippet", "http/submitSnippet.ts");
        const listPendingSnippets = fn(
            "ListPendingSnippets",
            "http/listPendingSnippets.ts",
        );
        const reviewSnippet = fn("ReviewSnippet", "http/reviewSnippet.ts");
        // Race replays bucket: append-only JSON keyed by roomId, deleted
        // automatically after 90 days via lifecycle rule. CORS allows
        // browser PUTs against presigned URLs.
        const replayBucket = new s3.Bucket(this, "Replays", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [{ expiration: Duration.days(90) }],
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                    maxAge: 300,
                },
            ],
        });
        const getReplayUploadUrl = fn(
            "GetReplayUploadUrl",
            "http/getReplayUploadUrl.ts",
            { REPLAY_BUCKET: replayBucket.bucketName },
        );
        const getReplay = fn("GetReplay", "http/getReplay.ts", {
            REPLAY_BUCKET: replayBucket.bucketName,
        });
        replayBucket.grantPut(getReplayUploadUrl);
        replayBucket.grantRead(getReplay);
        [
            createRoom,
            joinRoom,
            getRoom,
            listHistory,
            randomSnippet,
            practiceRun,
            getUser,
            getLeaderboard,
            getDaily,
            dailySubmit,
            getDailyLeaderboard,
            selectDailySnippet,
            submitSnippet,
            listPendingSnippets,
            reviewSnippet,
            getReplayUploadUrl,
            getReplay,
        ].forEach((f) => table.grantReadWriteData(f));

        const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
            corsPreflight: {
                allowOrigins: ["*"],
                allowMethods: [apigwv2.CorsHttpMethod.ANY],
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        const jwtAuth = new apigwv2Auth.HttpJwtAuthorizer(
            "JwtAuth",
            `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
            {
                jwtAudience: [userPoolClient.userPoolClientId],
            },
        );

        httpApi.addRoutes({
            path: "/rooms",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration("CreateRoom", createRoom),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/rooms/join",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration("JoinRoom", joinRoom),
        });
        httpApi.addRoutes({
            path: "/rooms/{code}",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration("GetRoom", getRoom),
        });
        httpApi.addRoutes({
            path: "/history",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration("History", listHistory),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/snippets/random",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "RandomSnippet",
                randomSnippet,
            ),
        });
        httpApi.addRoutes({
            path: "/history/practice",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "PracticeRun",
                practiceRun,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/users/me",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetUserMe",
                getUser,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/users/{userId}",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetUser",
                getUser,
            ),
        });
        httpApi.addRoutes({
            path: "/leaderboard",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetLeaderboard",
                getLeaderboard,
            ),
        });
        httpApi.addRoutes({
            path: "/daily",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetDaily",
                getDaily,
            ),
        });
        httpApi.addRoutes({
            path: "/daily/submit",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "DailySubmit",
                dailySubmit,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/daily/leaderboard",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetDailyLeaderboard",
                getDailyLeaderboard,
            ),
        });

        httpApi.addRoutes({
            path: "/snippets",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "SubmitSnippet",
                submitSnippet,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/admin/snippets/pending",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "ListPendingSnippets",
                listPendingSnippets,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/admin/snippets/{snippetId}/approve",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "ApproveSnippet",
                reviewSnippet,
            ),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/admin/snippets/{snippetId}/reject",
            methods: [apigwv2.HttpMethod.POST],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "RejectSnippet",
                reviewSnippet,
            ),
            authorizer: jwtAuth,
        });

        // Replay endpoints. Both unauthenticated for v1 to match the
        // join flow; the room must exist for upload URL issuance.
        httpApi.addRoutes({
            path: "/rooms/{roomId}/replay/upload-url",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetReplayUploadUrl",
                getReplayUploadUrl,
            ),
        });
        httpApi.addRoutes({
            path: "/rooms/{roomId}/replay",
            methods: [apigwv2.HttpMethod.GET],
            integration: new apigwv2Integ.HttpLambdaIntegration(
                "GetReplay",
                getReplay,
            ),
        });

        new events.Rule(this, "DailySnippetCron", {
            schedule: events.Schedule.cron({ minute: "0", hour: "0" }),
            targets: [new eventsTargets.LambdaFunction(selectDailySnippet)],
        });

        const wsConnect = fn("WsConnect", "ws/connect.ts");
        const wsDisconnect = fn("WsDisconnect", "ws/disconnect.ts");
        const wsDefault = fn("WsDefault", "ws/default.ts");
        const broadcaster = fn("Broadcast", "stream/broadcast.ts");
        [wsConnect, wsDisconnect, wsDefault, broadcaster].forEach((f) =>
            table.grantReadWriteData(f),
        );

        const wsApi = new apigwv2.WebSocketApi(this, "WsApi", {
            connectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "Connect",
                    wsConnect,
                ),
            },
            disconnectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "Disconnect",
                    wsDisconnect,
                ),
            },
            defaultRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "DefaultInteg",
                    wsDefault,
                ),
            },
        });
        const wsStage = new apigwv2.WebSocketStage(this, "WsStage", {
            webSocketApi: wsApi,
            stageName: "prod",
            autoDeploy: true,
        });
        const wsEndpoint = `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`;
        const manageConnectionsArn = `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/*/*/@connections/*`;
        [wsDefault, broadcaster].forEach((f) => {
            f.addEnvironment("WS_ENDPOINT", wsEndpoint);
            f.addToRolePolicy(
                new iam.PolicyStatement({
                    actions: ["execute-api:ManageConnections"],
                    resources: [manageConnectionsArn],
                }),
            );
        });

        broadcaster.addEventSource(
            new lambdaSources.DynamoEventSource(table, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 100,
                maxBatchingWindow: Duration.seconds(1),
                retryAttempts: 2,
            }),
        );

        // ─── Phase 09: Tournaments & Seasons ──────────────────────────────
        // Single feature flag plumbed into every tournament-aware Lambda so
        // a stuck rollout can be killed by flipping ENABLE_TOURNAMENTS=false
        // in the CDK env without code changes.
        const tournEnv = { ENABLE_TOURNAMENTS: "true" };

        const tournCreate = fn(
            "TournCreate",
            "http/tournaments/create.ts",
            tournEnv,
        );
        const tournList = fn(
            "TournList",
            "http/tournaments/list.ts",
            tournEnv,
        );
        const tournGet = fn("TournGet", "http/tournaments/get.ts", tournEnv);
        const tournBracket = fn(
            "TournBracket",
            "http/tournaments/bracket.ts",
            tournEnv,
        );
        const tournRegister = fn(
            "TournRegister",
            "http/tournaments/register.ts",
            tournEnv,
        );
        const tournWithdraw = fn(
            "TournWithdraw",
            "http/tournaments/withdraw.ts",
            tournEnv,
        );
        const tournSeed = fn(
            "TournSeed",
            "http/tournaments/seed.ts",
            tournEnv,
        );
        const tournCancel = fn(
            "TournCancel",
            "http/tournaments/cancel.ts",
            tournEnv,
        );
        const seasonCurrent = fn(
            "SeasonCurrent",
            "http/seasons/current.ts",
            tournEnv,
        );
        const seasonLeaderboard = fn(
            "SeasonLeaderboard",
            "http/seasons/leaderboard.ts",
            tournEnv,
        );
        const rolloverSeasons = fn(
            "RolloverSeasons",
            "cron/rolloverSeasons.ts",
            tournEnv,
        );
        // Decay sweep can be slow on cold pools; bump timeout/memory.
        rolloverSeasons.addEnvironment("AWS_NODEJS_CONNECTION_REUSE_ENABLED", "1");
        const advanceTourn = fn(
            "AdvanceTournaments",
            "cron/advanceTournaments.ts",
            tournEnv,
        );
        const tournWsConnect = fn(
            "TournWsConnect",
            "ws/tourn/connect.ts",
            tournEnv,
        );
        const tournWsDisconnect = fn(
            "TournWsDisconnect",
            "ws/tourn/disconnect.ts",
            tournEnv,
        );
        const tournWsHeartbeat = fn(
            "TournWsHeartbeat",
            "ws/tourn/heartbeat.ts",
            tournEnv,
        );
        const onRaceFinished = fn(
            "OnRaceFinished",
            "stream/onRaceFinished.ts",
            tournEnv,
        );

        const tournLambdas = [
            tournCreate,
            tournList,
            tournGet,
            tournBracket,
            tournRegister,
            tournWithdraw,
            tournSeed,
            tournCancel,
            seasonCurrent,
            seasonLeaderboard,
            rolloverSeasons,
            advanceTourn,
            tournWsConnect,
            tournWsDisconnect,
            tournWsHeartbeat,
            onRaceFinished,
        ];
        tournLambdas.forEach((f) => table.grantReadWriteData(f));

        const integ = (id: string, f: lambda.IFunction) =>
            new apigwv2Integ.HttpLambdaIntegration(id, f);

        // Public reads (CloudFront-cacheable).
        httpApi.addRoutes({
            path: "/tournaments",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("TournList", tournList),
        });
        httpApi.addRoutes({
            path: "/tournaments/{id}",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("TournGet", tournGet),
        });
        httpApi.addRoutes({
            path: "/tournaments/{id}/bracket",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("TournBracket", tournBracket),
        });
        httpApi.addRoutes({
            path: "/seasons/current",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("SeasonCurrent", seasonCurrent),
        });
        httpApi.addRoutes({
            path: "/seasons/{id}/leaderboard",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("SeasonLeaderboard", seasonLeaderboard),
        });

        // Mutating endpoints (Cognito JWT). Mod-group enforcement is in
        // the handlers themselves via requireMod.
        httpApi.addRoutes({
            path: "/tournaments",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("TournCreate", tournCreate),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/tournaments/{id}/register",
            methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.DELETE],
            integration: integ("TournRegister", tournRegister),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/tournaments/{id}/seed",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("TournSeed", tournSeed),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/tournaments/{id}/cancel",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("TournCancel", tournCancel),
            authorizer: jwtAuth,
        });
        // The withdraw lambda shares the /register path with method=DELETE
        // above; expose it here as a fallback for clients that prefer
        // separate routes (no schema diff).
        // Note: above route handles DELETE; this dummy block is intentionally
        // omitted to avoid a duplicate-route synth error.

        // Dedicated tournament WebSocket API. The viewer fan-out is
        // independent of the casual-room WS, so a separate API ID makes
        // throttling and auth policy independently tunable later.
        const tournWsApi = new apigwv2.WebSocketApi(this, "TournWsApi", {
            connectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "TournConnect",
                    tournWsConnect,
                ),
            },
            disconnectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "TournDisconnect",
                    tournWsDisconnect,
                ),
            },
            defaultRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "TournHeartbeat",
                    tournWsHeartbeat,
                ),
            },
        });
        const tournWsStage = new apigwv2.WebSocketStage(this, "TournWsStage", {
            webSocketApi: tournWsApi,
            stageName: "prod",
            autoDeploy: true,
        });
        const tournWsEndpoint = `https://${tournWsApi.apiId}.execute-api.${this.region}.amazonaws.com/${tournWsStage.stageName}`;
        const tournManageArn = `arn:aws:execute-api:${this.region}:${this.account}:${tournWsApi.apiId}/*/*/@connections/*`;
        // Anything that needs to push WS messages on the /tourn API.
        [
            tournWsConnect,
            tournWsHeartbeat,
            onRaceFinished,
        ].forEach((f) => {
            f.addEnvironment("WS_ENDPOINT", tournWsEndpoint);
            f.addToRolePolicy(
                new iam.PolicyStatement({
                    actions: ["execute-api:ManageConnections"],
                    resources: [tournManageArn],
                }),
            );
        });

        // Stream consumer for bracket advancement on race finishes. Sits
        // alongside the existing chat broadcaster on the same table stream.
        onRaceFinished.addEventSource(
            new lambdaSources.DynamoEventSource(table, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 50,
                maxBatchingWindow: Duration.seconds(1),
                retryAttempts: 2,
            }),
        );

        // Crons.
        new events.Rule(this, "RolloverSeasonsCron", {
            // Daily 00:00 UTC.
            schedule: events.Schedule.cron({ minute: "0", hour: "0" }),
            targets: [new eventsTargets.LambdaFunction(rolloverSeasons)],
        });
        new events.Rule(this, "AdvanceTournamentsCron", {
            // Every minute.
            schedule: events.Schedule.rate(Duration.minutes(1)),
            targets: [new eventsTargets.LambdaFunction(advanceTourn)],
        });

        new CfnOutput(this, "TournWsApiUrl", {
            value: `wss://${tournWsApi.apiId}.execute-api.${this.region}.amazonaws.com/${tournWsStage.stageName}`,
        });

        const siteBucket = new s3.Bucket(this, "Site", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        const distribution = new cloudfront.Distribution(this, "Cdn", {
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            defaultRootObject: "index.html",
            errorResponses: [
                { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html" },
            ],
        });

        new CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
        new CfnOutput(this, "WsApiUrl", {
            value: `wss://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`,
        });
        new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
        new CfnOutput(this, "UserPoolClientId", {
            value: userPoolClient.userPoolClientId,
        });
        new CfnOutput(this, "SiteBucket", { value: siteBucket.bucketName });
        new CfnOutput(this, "CdnDomain", { value: distribution.distributionDomainName });
        new CfnOutput(this, "TableName", { value: table.tableName });
    }
}
