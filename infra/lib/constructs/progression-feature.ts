import { Duration, RemovalPolicy, Size } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Auth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigwv2Integ from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";

/**
 * Factory that creates a NodejsFunction with project conventions
 * (runtime, architecture, log retention, env). Owned by the parent
 * stack so feature constructs can stay agnostic of bundling settings.
 */
export type LambdaFactory = (
    id: string,
    entry: string,
    env?: Record<string, string>,
) => lambda.Function;

export type IntegFactory = (
    id: string,
    f: lambda.IFunction,
) => apigwv2Integ.HttpLambdaIntegration;

export interface ProgressionFeatureProps {
    table: ddb.ITable;
    httpApi: apigwv2.HttpApi;
    jwtAuth: apigwv2Auth.HttpJwtAuthorizer;
    lambdaFactory: LambdaFactory;
    integFactory: IntegFactory;
}

/**
 * Phase-11 progression feature: event-log archive + XP + achievements
 * (and, in slice 4, quests). Owns its bucket, Firehose, stream
 * consumer lambda, and HTTP surface.
 *
 * Why a Construct: this feature is event-sourced and end-to-end
 * decoupled from the race path — keeping its CDK definitions
 * co-located makes it trivial to remove or feature-flag at the
 * infra layer.
 */
export class ProgressionFeature extends Construct {
    readonly env: Record<string, string>;
    readonly streamConsumer: lambda.Function;

    constructor(scope: Construct, id: string, props: ProgressionFeatureProps) {
        super(scope, id);
        const { table, httpApi, jwtAuth, lambdaFactory, integFactory } = props;
        this.env = { ENABLE_PROGRESSION: "true" };

        const archiveBucket = new s3.Bucket(this, "EventsArchive", {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    id: "to-deep-archive-365d",
                    enabled: true,
                    transitions: [
                        {
                            storageClass: s3.StorageClass.DEEP_ARCHIVE,
                            transitionAfter: Duration.days(365),
                        },
                    ],
                },
            ],
        });

        const deliveryStream = new firehose.DeliveryStream(this, "Firehose", {
            destination: new firehose.S3Bucket(archiveBucket, {
                compression: firehose.Compression.GZIP,
                bufferingInterval: Duration.seconds(60),
                bufferingSize: Size.mebibytes(64),
                dataOutputPrefix:
                    "progression/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/",
                errorOutputPrefix:
                    "errors/!{firehose:error-output-type}/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
            }),
        });

        this.streamConsumer = lambdaFactory(
            "FirehoseSink",
            "stream/firehoseSink.ts",
            {
                FIREHOSE_STREAM_NAME: deliveryStream.deliveryStreamName,
                ...this.env,
            },
        );
        table.grantReadWriteData(this.streamConsumer);
        deliveryStream.grantPutRecords(this.streamConsumer);
        this.streamConsumer.addEventSource(
            new lambdaSources.DynamoEventSource(table, {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: 100,
                maxBatchingWindow: Duration.seconds(5),
                retryAttempts: 3,
            }),
        );

        const meXp = lambdaFactory(
            "MeXp",
            "http/progression/getXp.ts",
            this.env,
        );
        const achCatalog = lambdaFactory(
            "AchCatalog",
            "http/progression/catalog.ts",
            this.env,
        );
        const achListMine = lambdaFactory(
            "AchListMine",
            "http/progression/listMine.ts",
            this.env,
        );
        const achListPublic = lambdaFactory(
            "AchListPublic",
            "http/progression/listPublic.ts",
            this.env,
        );
        const achPin = lambdaFactory(
            "AchPin",
            "http/progression/pin.ts",
            this.env,
        );
        const httpLambdas = [meXp, achCatalog, achListMine, achListPublic, achPin];
        httpLambdas.forEach((f) => table.grantReadWriteData(f));

        const authedGet = (
            path: string,
            id: string,
            f: lambda.IFunction,
        ) =>
            httpApi.addRoutes({
                path,
                methods: [apigwv2.HttpMethod.GET],
                integration: integFactory(id, f),
                authorizer: jwtAuth,
            });
        const publicGet = (path: string, id: string, f: lambda.IFunction) =>
            httpApi.addRoutes({
                path,
                methods: [apigwv2.HttpMethod.GET],
                integration: integFactory(id, f),
            });

        authedGet("/me/xp", "MeXp", meXp);
        authedGet("/me/achievements", "AchListMine", achListMine);
        publicGet("/achievements", "AchCatalog", achCatalog);
        publicGet(
            "/users/{userId}/achievements",
            "AchListPublic",
            achListPublic,
        );
        httpApi.addRoutes({
            path: "/me/achievements/pin",
            methods: [apigwv2.HttpMethod.PUT],
            integration: integFactory("AchPin", achPin),
            authorizer: jwtAuth,
        });
    }
}
