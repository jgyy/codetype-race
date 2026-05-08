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
import { ProgressionFeature } from "./constructs/progression-feature";

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
        new cognito.CfnUserPoolGroup(this, "AdminGroup", {
            userPoolId: userPool.userPoolId,
            groupName: "admin",
            description: "Snippet moderation",
        });
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

        const integ = (id: string, f: lambda.IFunction) =>
            new apigwv2Integ.HttpLambdaIntegration(id, f);

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

        onRaceFinished.addEventSource(
            new lambdaSources.DynamoEventSource(table, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 50,
                maxBatchingWindow: Duration.seconds(1),
                retryAttempts: 2,
            }),
        );

        new events.Rule(this, "RolloverSeasonsCron", {
            schedule: events.Schedule.cron({ minute: "0", hour: "0" }),
            targets: [new eventsTargets.LambdaFunction(rolloverSeasons)],
        });
        new events.Rule(this, "AdvanceTournamentsCron", {
            schedule: events.Schedule.rate(Duration.minutes(1)),
            targets: [new eventsTargets.LambdaFunction(advanceTourn)],
        });

        new CfnOutput(this, "TournWsApiUrl", {
            value: `wss://${tournWsApi.apiId}.execute-api.${this.region}.amazonaws.com/${tournWsStage.stageName}`,
        });

        const socialEnv = {
            ENABLE_FRIENDS: "true",
            ENABLE_PRESENCE: "true",
        };

        const userSearch = fn("UserSearch", "http/social/search.ts", socialEnv);
        const friendList = fn(
            "FriendList",
            "http/social/listFriends.ts",
            socialEnv,
        );
        const friendRequestsList = fn(
            "FriendRequestsList",
            "http/social/listRequests.ts",
            socialEnv,
        );
        const friendRequest = fn(
            "FriendRequest",
            "http/social/request.ts",
            socialEnv,
        );
        const friendAccept = fn(
            "FriendAccept",
            "http/social/accept.ts",
            socialEnv,
        );
        const friendRemove = fn(
            "FriendRemove",
            "http/social/remove.ts",
            socialEnv,
        );
        const friendBlock = fn(
            "FriendBlock",
            "http/social/block.ts",
            socialEnv,
        );
        const presenceConnect = fn(
            "PresenceConnect",
            "ws/presence/connect.ts",
            socialEnv,
        );
        const presenceDisconnect = fn(
            "PresenceDisconnect",
            "ws/presence/disconnect.ts",
            socialEnv,
        );
        const presencePing = fn(
            "PresencePing",
            "ws/presence/ping.ts",
            socialEnv,
        );
        const onPresenceChange = fn(
            "OnPresenceChange",
            "stream/onPresenceChange.ts",
            socialEnv,
        );

        const socialLambdas = [
            userSearch,
            friendList,
            friendRequestsList,
            friendRequest,
            friendAccept,
            friendRemove,
            friendBlock,
            presenceConnect,
            presenceDisconnect,
            presencePing,
            onPresenceChange,
        ];
        socialLambdas.forEach((f) => table.grantReadWriteData(f));

        httpApi.addRoutes({
            path: "/users/search",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("UserSearch", userSearch),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/me/friends",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("FriendList", friendList),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/me/friends/requests",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("FriendRequestsList", friendRequestsList),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/friends/{userId}/request",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("FriendRequest", friendRequest),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/friends/{userId}/accept",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("FriendAccept", friendAccept),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/friends/{userId}",
            methods: [apigwv2.HttpMethod.DELETE],
            integration: integ("FriendRemove", friendRemove),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/users/{userId}/block",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("FriendBlock", friendBlock),
            authorizer: jwtAuth,
        });

        const feedGet = fn("FeedGet", "http/social/feed.ts", {
            ENABLE_FRIENDS: "true",
            ENABLE_GUILDS: "true",
        });
        table.grantReadWriteData(feedGet);
        httpApi.addRoutes({
            path: "/users/{userId}/feed",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("FeedGet", feedGet),
        });

        const presenceWsApi = new apigwv2.WebSocketApi(this, "PresenceWsApi", {
            connectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "PresenceConnect",
                    presenceConnect,
                ),
            },
            disconnectRouteOptions: {
                integration: new apigwv2Integ.WebSocketLambdaIntegration(
                    "PresenceDisconnect",
                    presenceDisconnect,
                ),
            },
        });
        presenceWsApi.addRoute("ping", {
            integration: new apigwv2Integ.WebSocketLambdaIntegration(
                "PresencePing",
                presencePing,
            ),
        });
        const presenceWsStage = new apigwv2.WebSocketStage(
            this,
            "PresenceWsStage",
            {
                webSocketApi: presenceWsApi,
                stageName: "prod",
                autoDeploy: true,
            },
        );
        const presenceWsEndpoint = `https://${presenceWsApi.apiId}.execute-api.${this.region}.amazonaws.com/${presenceWsStage.stageName}`;
        const presenceManageArn = `arn:aws:execute-api:${this.region}:${this.account}:${presenceWsApi.apiId}/*/*/@connections/*`;
        [presencePing, onPresenceChange].forEach((f) => {
            f.addEnvironment("WS_ENDPOINT", presenceWsEndpoint);
            f.addToRolePolicy(
                new iam.PolicyStatement({
                    actions: ["execute-api:ManageConnections"],
                    resources: [presenceManageArn],
                }),
            );
        });

        onPresenceChange.addEventSource(
            new lambdaSources.DynamoEventSource(table, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 100,
                maxBatchingWindow: Duration.seconds(1),
                retryAttempts: 2,
                filters: [
                    lambda.FilterCriteria.filter({
                        dynamodb: { Keys: { PK: { S: [{ prefix: "PRESENCE#" }] } } },
                    }),
                ],
            }),
        );

        new CfnOutput(this, "PresenceWsApiUrl", {
            value: `wss://${presenceWsApi.apiId}.execute-api.${this.region}.amazonaws.com/${presenceWsStage.stageName}`,
        });

        const guildEnv = { ENABLE_GUILDS: "true" };
        const guildCreate = fn("GuildCreate", "http/guilds/create.ts", guildEnv);
        const guildList = fn("GuildList", "http/guilds/list.ts", guildEnv);
        const guildGet = fn("GuildGet", "http/guilds/get.ts", guildEnv);
        const guildMembers = fn(
            "GuildMembers",
            "http/guilds/members.ts",
            guildEnv,
        );
        const guildLeaderboard = fn(
            "GuildLeaderboard",
            "http/guilds/leaderboard.ts",
            guildEnv,
        );
        const guildUpdate = fn("GuildUpdate", "http/guilds/update.ts", guildEnv);
        const guildTransfer = fn(
            "GuildTransfer",
            "http/guilds/transfer.ts",
            guildEnv,
        );
        const guildLeaveOrKick = fn(
            "GuildLeaveOrKick",
            "http/guilds/leaveOrKick.ts",
            guildEnv,
        );
        const guildInviteCreate = fn(
            "GuildInviteCreate",
            "http/guilds/invites/create.ts",
            guildEnv,
        );
        const guildInviteRedeem = fn(
            "GuildInviteRedeem",
            "http/guilds/invites/redeem.ts",
            guildEnv,
        );

        const guildLambdas = [
            guildCreate,
            guildList,
            guildGet,
            guildMembers,
            guildLeaderboard,
            guildUpdate,
            guildTransfer,
            guildLeaveOrKick,
            guildInviteCreate,
            guildInviteRedeem,
        ];
        guildLambdas.forEach((f) => table.grantReadWriteData(f));

        httpApi.addRoutes({
            path: "/guilds",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("GuildCreate", guildCreate),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/guilds",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("GuildList", guildList),
        });
        httpApi.addRoutes({
            path: "/guilds/{id}",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("GuildGet", guildGet),
        });
        httpApi.addRoutes({
            path: "/guilds/{id}",
            methods: [apigwv2.HttpMethod.PATCH],
            integration: integ("GuildUpdate", guildUpdate),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/guilds/{id}/members",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("GuildMembers", guildMembers),
        });
        httpApi.addRoutes({
            path: "/guilds/{id}/members/{userId}",
            methods: [apigwv2.HttpMethod.DELETE],
            integration: integ("GuildLeaveOrKick", guildLeaveOrKick),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/guilds/{id}/leaderboard",
            methods: [apigwv2.HttpMethod.GET],
            integration: integ("GuildLeaderboard", guildLeaderboard),
        });
        httpApi.addRoutes({
            path: "/guilds/{id}/transfer",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("GuildTransfer", guildTransfer),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/guilds/{id}/invites",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("GuildInviteCreate", guildInviteCreate),
            authorizer: jwtAuth,
        });
        httpApi.addRoutes({
            path: "/guilds/join/{code}",
            methods: [apigwv2.HttpMethod.POST],
            integration: integ("GuildInviteRedeem", guildInviteRedeem),
            authorizer: jwtAuth,
        });

        new ProgressionFeature(this, "Progression", {
            table,
            httpApi,
            jwtAuth,
            lambdaFactory: fn,
            integFactory: integ,
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
