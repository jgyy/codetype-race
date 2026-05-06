import type { APIGatewayProxyResultV2 } from "aws-lambda";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export const json = (
  statusCode: number,
  body: unknown,
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS },
  body: JSON.stringify(body),
});

export const error = (statusCode: number, message: string) =>
  json(statusCode, { error: message });
