# appsync-client-node

Lightweight AWS AppSync client for Node.js (specially for AWS Lambda Node.j runtime):

- supports IAM and API Key authentications
- supports XRay tracing
- allow to specify URL via environment variable (`GRAPHQL_API_ENDPOINT_ENV_NAME`)
- properly handles timeouts and retries connection-reset errors
- comes with lightweight `gql` tag (just stipes whitespace) for prettier, GraphQL VSCode syntax highlighting, etc.
- ESM and CommonJs modules
- TypeScript generics support for variables and results
- depends only on `@aws-sdk` v3 (that comes built-in on Node 18.x lambda runtime) and `aws-xray-sdk-core` results in very small bundle (when used with CDK `NodejsFunction`)
- MIT licensed
