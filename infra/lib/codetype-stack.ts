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
        [
            createRoom,
            joinRoom,
            getRoom,
            listHistory,
            randomSnippet,
            practiceRun,
            getUser,
            getLeaderboard,
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
        // Snippets are queried via GSI1 (PK = LANG#<language>) with the
        // sort key encoding difficulty (DIFF#<n>#SNIPPET#<id>) so a single
        // index serves both language-only and language+difficulty filtering.
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
