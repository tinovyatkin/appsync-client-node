import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import {
  AmplifyAppSyncSimulator,
  AmplifyAppSyncSimulatorAuthenticationType,
  RESOLVER_KIND,
} from "@aws-amplify/amplify-appsync-simulator";
import { jest } from "@jest/globals";

import { once } from "node:events";
import {
  createServer,
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import { AddressInfo } from "node:net";
import {
  appSyncClient,
  gql,
  graphQlClient,
  GRAPHQL_API_ENDPOINT_ENV_NAME,
  TimeoutError,
} from "./index";

describe("appsync-client-node", () => {
  // these are always set on lambdas
  process.env.AWS_REGION = "eu-west-1";
  process.env.AWS_ACCESS_KEY_ID = "test-user-key";
  process.env.AWS_SECRET_ACCESS_KEY = randomBytes(10).toString("hex");

  const appSync = new AmplifyAppSyncSimulator();
  const onInboxMock = jest.fn();
  let onInboxMockSubscription: Awaited<
    ReturnType<AmplifyAppSyncSimulator["pubsub"]["subscribe"]>
  >;
  const apiKey = randomBytes(10).toString("hex");

  beforeAll(async () => {
    appSync.init({
      appSync: {
        name: "test-appsync",
        defaultAuthenticationType: {
          authenticationType: AmplifyAppSyncSimulatorAuthenticationType.AWS_IAM,
        },
        additionalAuthenticationProviders: [
          {
            authenticationType:
              AmplifyAppSyncSimulatorAuthenticationType.API_KEY,
          },
        ],
        apiKey,
        authAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      },
      schema: {
        content: gql`
          # based on https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-local-resolvers.html

          schema {
            query: Query
            mutation: Mutation
            subscription: Subscription
          }

          type Subscription {
            inbox(to: String!): Page @aws_subscribe(mutations: ["page"])
          }

          type Mutation {
            page(body: String!, to: String!): Page! @aws_iam
          }

          type Page @aws_iam {
            from: String!
            to: String!
            body: String!
            sentAt: AWSDateTime!
          }

          type Query {
            me: String
          }
        `,
      },
      dataSources: [
        {
          type: "NONE",
          name: "noneDataSource",
        },
      ],
      resolvers: [
        {
          fieldName: "page",
          typeName: "Mutation",
          kind: RESOLVER_KIND.UNIT,
          dataSourceName: "noneDataSource",
          // from example at https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-local-resolvers.html
          requestMappingTemplate: `
              {
                "version": "2017-02-28",
                "payload": {
                  "body": $util.toJson($context.arguments.body),
                  "from": $util.toJson($context.identity.username),
                  "to":  $util.toJson($context.arguments.to),
                  "sentAt": "$util.time.nowISO8601()"
                }
              }
              `,
          responseMappingTemplate: `$util.toJson($ctx.result)`,
        },
      ],
    });
    await appSync.start();
    const url = new URL("/graphql", appSync.url);
    url.hostname = "localhost";
    process.env[GRAPHQL_API_ENDPOINT_ENV_NAME] = url.toString();
    onInboxMockSubscription = await appSync.pubsub.subscribe(
      "inbox",
      onInboxMock
    );
  });

  afterAll(async () => {
    await appSync.pubsub.unsubscribe(onInboxMockSubscription);
    await appSync.stop();
  });

  test("gql", async () => {
    expect(gql`
      #import "./fragments/some.graphql"

      {
        hero {
          name
          # Queries can have comments!
          friends {
            ${["name", "age", "sex"].join("\n")}
          }
        }
      }
    `).toMatchInlineSnapshot(`
      "#import "./fragments/some.graphql"
      {
      hero {
      name
      friends {
      name
      age
      sex
      }
      }
      }"
    `);
  });

  test("IAM authentication", async () => {
    const { page } = await appSyncClient<
      { page: unknown },
      { to: string; body: string }
    >({
      query: gql`
        mutation Page($to: String!, $body: String!) {
          page(to: $to, body: $body) {
            body
            to
            from
            sentAt
          }
        }
      `,
      variables: {
        to: "Jack",
        body: "Hello!",
      },
    });
    expect(page).toMatchObject({
      from: "auth-user",
      body: "Hello!",
      sentAt: expect.any(String),
      to: "Jack",
    });

    // give pubsub some time to deliver message
    await setTimeout(500);
    expect(onInboxMock).toHaveBeenCalledTimes(1);
    expect(onInboxMock).toHaveBeenCalledWith(page);
  });
});

describe("appsync-client-node errors handling", () => {
  // these are always set on lambdas
  process.env.AWS_REGION = "eu-west-1";
  process.env.AWS_ACCESS_KEY_ID = "test-user-key";
  process.env.AWS_SECRET_ACCESS_KEY = randomBytes(10).toString("hex");

  test("Should emit TimeoutError on timeout", async () => {
    const server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/graphql") {
        // delay response for 1200 ms
        await setTimeout(1200);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      } else {
        res.writeHead(404, "No such thing");
        res.end();
      }
    });
    server.setTimeout(3000);
    server.listen(0).unref();

    await once(server, "listening");
    await expect(
      graphQlClient({
        appsyncUrl: `http://localhost:${
          (server.address() as AddressInfo).port
        }/graphql`,
        request: {
          query: gql`
            query me {
              name
            }
          `,
        },
        timeoutMs: 1000,
      })
    ).rejects.toBeInstanceOf(TimeoutError);

    server.removeAllListeners();
    server.close();
  });

  test("should retry up to specified number of times on connection reset", async () => {
    const serverHandler = jest
      .fn<RequestListener<typeof IncomingMessage, typeof ServerResponse>>()
      .mockImplementationOnce(async (_req, res) => {
        await setTimeout(500);
        res.socket?.destroy();
      })
      .mockImplementationOnce(async (_req, res) => {
        await setTimeout(500);
        res.socket?.destroy();
      })
      .mockImplementationOnce(async (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [] }));
      });
    const server = createServer(serverHandler);
    server.setTimeout(3000);
    server.listen(0).unref();

    await once(server, "listening");
    await expect(
      graphQlClient({
        appsyncUrl: `http://localhost:${
          (server.address() as AddressInfo).port
        }/graphql`,
        request: {
          query: gql`
            query me {
              name
            }
          `,
        },
        maxRetries: 3,
      })
    ).resolves.toEqual({ body: { data: [] }, statusCode: 200 });
    expect(serverHandler).toBeCalledTimes(3);

    server.removeAllListeners();
    server.close();
  });
});
