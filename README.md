# appsync-client-node [![codecov](https://codecov.io/gh/tinovyatkin/appsync-client-node/branch/main/graph/badge.svg?token=QHcGrDPJkg)](https://codecov.io/gh/tinovyatkin/appsync-client-node)

Lightweight AWS AppSync client for Node.js (optimized for AWS Lambda Node.js runtime(s)):

- supports IAM and API Key authentications
- supports XRay tracing or [OpenTelemetry Lambda layers auto-instrumentation](https://aws-otel.github.io/docs/getting-started/lambda/lambda-js)
- allow to specify URL via environment variable (`GRAPHQL_API_ENDPOINT_ENV_NAME`)
- properly handles timeouts, abort signal and retries connection-reset errors
- comes with lightweight `gql` tag (just stipes whitespace and comments) for prettier, GraphQL VSCode syntax highlighting, etc.
- ESM and CommonJs modules
- TypeScript generics support for variables and results
- depends only on `@aws-sdk` v3 (that comes built-in on Node 18.x lambda runtime) and `aws-xray-sdk-core` that results in very small bundle (when used with CDK `NodejsFunction`)
- MIT licensed

## Usage

```ts
import { appSyncClient, gql } from "appsync-client-node";

const books = await appSyncClient<ReturnValueType, { author: string }>({
  query: gql`
    query books($author: String!) {
      books(author: $author) {
        ...BookFragment
      }
    }
  `,
  variables: {
    author: "Remark",
  },
});
```

## License

MIT
