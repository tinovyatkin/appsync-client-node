/**
 * AppSync GraphQL client for Node.js lambdas Can be imported from lambdas bundling with
 * NodejsFunction construct Client can be authorized via either API Key or IAM (recommended)
 */

import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { URL } from "node:url";

import { defaultProvider as credentialProvider } from "@aws-sdk/credential-provider-node";
import { Hash } from "@aws-sdk/hash-node";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { SignatureV4 } from "@aws-sdk/signature-v4";
import type { Hash as IHash, SourceData } from "@aws-sdk/types";
import AWSXray from "aws-xray-sdk-core";

export const GRAPHQL_API_ENDPOINT_ENV_NAME = "GRAPHQL_API_ENDPOINT";
export type GraphQlMutation<VarsType = Record<string, unknown>> = {
  mutation: string;
  variables?: VarsType;
};

export type GraphQlRequest<VarsType = Record<string, unknown>> = {
  query: string;
  variables?: VarsType;
  operationName?: string;
};

class Sha256 implements IHash {
  private readonly hash: Hash;

  constructor(secret?: SourceData) {
    this.hash = new Hash("sha256", secret);
  }

  update(data: SourceData, encoding?: "ascii" | "latin1" | "utf8"): void {
    this.hash.update(data, encoding);
  }

  async digest() {
    return this.hash.digest();
  }
}

/**
 * Minimal gql tag just for syntax highlighting and Prettier while writing client GraphQL queries in
 * Lambda does some whitespace stripping
 */
export const gql = (
  chunks: TemplateStringsArray,
  ...variables: unknown[]
): string =>
  chunks
    .reduce(
      (accumulator, chunk, index) =>
        `${accumulator}${chunk}${index in variables ? variables[index] : ""}`,
      ""
    )
    .replace(/^\s+|\s$/g, "");

/**
 * Maximum GraphQL request (queries, mutations, subscriptions) execution time on AppSync - 30
 * seconds
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/appsync.html}
 */
const APPSYNC_MAX_QUERY_RUNTIME_MS = 30 * 1000;

const tracedHttps = AWSXray.captureHTTPs(https, true);

const httpsAgent = new tracedHttps.Agent({
  keepAlive: true,
  timeout: APPSYNC_MAX_QUERY_RUNTIME_MS,
});
const httpAgent = new http.Agent({ timeout: APPSYNC_MAX_QUERY_RUNTIME_MS }); // only used in tests so no keep-alive

export interface GraphQLError {
  path: string[];
  data: unknown;
  /** @example Unauthorized */
  errorType: string;
  errorInfo: unknown;
  /** @example Not Authorized to access createEvent on type Mutation */
  message: string;
  locations: { line: number; column: number; sourceName: string | null }[];
}

export async function graphQlClient<T = unknown, V = unknown>({
  appsyncUrl,
  apiKey,
  request,
  // appsyncUrl looks like https://i6ilpu6e6baxvat4tbqa54nfem.appsync-api.eu-west-1.amazonaws.com/graphql
  // so, we can try to infer region from it
  region = /\.([^.]+)\.amazonaws\.com\//.exec(appsyncUrl)?.[1] ??
    process.env.AWS_REGION,
}: {
  appsyncUrl: string;
  apiKey?: string;
  request: GraphQlRequest<V>;
  region?: string;
}): Promise<
  | Pick<IncomingMessage, "statusCode"> & {
      body: string | { data: T; errors?: readonly GraphQLError[] };
    }
> {
  if (!region)
    throw new ReferenceError(`region is required, but wasn't provided`);

  const url = new URL(appsyncUrl);
  const [h, agent, port] =
    url.protocol === "https:"
      ? [tracedHttps, httpsAgent, url.port || 443]
      : [http, httpAgent, url.port || 80];

  const req = new HttpRequest({
    method: "POST",
    path: url.pathname,
    hostname: url.hostname,
    headers: { "Content-Type": "application/json", host: url.hostname },
    body: JSON.stringify(request),
  });

  if (apiKey) {
    req.headers["x-api-key"] = apiKey;
  } else {
    const signer = new SignatureV4({
      region,
      service: "appsync",
      credentials: credentialProvider(),
      sha256: Sha256,
    });
    const { headers } = await signer.sign(req);
    req.headers = headers;
  }

  return new Promise((resolve, reject) => {
    const httpRequest = h.request(
      { ...req, host: url.hostname, port, agent },
      (result) => {
        let data = "";
        result.socket.setNoDelay(true);
        result
          .setTimeout(APPSYNC_MAX_QUERY_RUNTIME_MS)
          .setEncoding("utf-8")
          .on("data", (chunk: string) => {
            data += chunk;
          })
          .once("end", () =>
            resolve({
              statusCode: result.statusCode,
              body: result.headers["content-type"]
                ?.toLowerCase()
                .includes("application/json")
                ? JSON.parse(data)
                : data,
            })
          )
          .once("error", (err) => reject(err));
      }
    );
    httpRequest.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNRESET") {
        // retry
        return resolve(
          graphQlClient<T>({
            appsyncUrl,
            apiKey,
            request,
            region,
          })
        );
      }
      reject(err);
    });
    httpRequest.end(req.body);
  });
}

/** A wrapper for graphqlClient that throws error when there are errors */
export async function appSyncClient<ReturnValueType, VariableType>(
  request: GraphQlRequest<VariableType>,
  appsyncUrl = process.env[GRAPHQL_API_ENDPOINT_ENV_NAME]
): Promise<ReturnValueType> {
  if (!appsyncUrl)
    throw new Error(
      `appsyncUrl should be provided either as parameter or via ${GRAPHQL_API_ENDPOINT_ENV_NAME}, but wasn't found`
    );
  const result = await graphQlClient<ReturnValueType, VariableType>({
    request,
    appsyncUrl,
  });
  if (typeof result.body === "string") {
    console.error("Request to GraphQL failed: %s", result.body);
    throw new Error(`Request to GraphQL failed: ${result.body}`);
  } else if (result.body.errors?.length) {
    console.error(
      `GraphQL request errors: ${JSON.stringify(result.body.errors)}`
    );
    throw new Error(
      `GraphQL request errors: ${JSON.stringify(result.body.errors)}`
    );
  }

  return result.body.data;
}
