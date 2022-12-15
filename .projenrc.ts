import * as path from "path";
import { javascript, typescript } from "projen";
import { NpmAccess } from "projen/lib/javascript";

const outDir = "lib";

const project = new typescript.TypeScriptProject({
  name: "AppSyncClientNode",
  packageName: "appsync-client-node",
  description:
    "Lightweight AWS AppSync client optimized for Lambda Node.js Runtime",
  authorName: "Konstantin Vyatkin",
  authorEmail: "tino@vtkn.io",
  majorVersion: 1,
  license: "MIT",
  repository: "https://github.com/tinovyatkin/appsync-client-node.git",
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  minNodeVersion: "16.15.0",
  entrypoint: path.join(outDir, "index.cjs"),
  entrypointTypes: path.join(outDir, "index.d.ts"),
  defaultReleaseBranch: "main",
  releaseToNpm: true,
  npmAccess: NpmAccess.PUBLIC,
  keywords: [
    "appsync",
    "aws",
    "lambda",
    "nodejs",
    "typescript",
    "backend",
    "xray",
    "graphql",
    "gql",
  ],
  jest: false,
  testdir: "src",
  prettier: true,
  tsconfig: {
    compilerOptions: {
      // @ts-expect-error -- not yet supported by projen
      moduleResolution: "Node16",
      target: "es2022",
      lib: ["es2022"],
      module: "es2022",
      outDir,
      inlineSources: false,
    },
  },
  githubOptions: {
    mergify: false,
  },
  deps: [
    "@aws-sdk/credential-provider-node@^3",
    "@aws-sdk/hash-node@^3",
    "@aws-sdk/protocol-http@^3",
    "@aws-sdk/signature-v4@^3",
    "@aws-sdk/types@^3",
    "aws-xray-sdk-core@^3",
  ],
});

project.eslint?.addIgnorePattern(path.join(outDir, "**"));
project.package.addField("files", [outDir]);

project.preCompileTask.reset(`rm -rf ${outDir}`);
project.postCompileTask.reset(
  `mv ${path.join(outDir, "index.js")}  ${path.join(outDir, "index.mjs")}`
);
project.postCompileTask.exec("tsc --module commonjs");
project.postCompileTask.exec(
  `mv ${path.join(outDir, "index.js")}  ${path.join(outDir, "index.cjs")}`
);

project.package.addField("type", "module");
project.defaultTask?.reset(
  `ts-node --project ${project.tsconfigDev.fileName} --esm --preferTsExts --experimentalSpecifierResolution node .projenrc.ts`
);
project.package.addField("exports", {
  import: `./${path.join(outDir, "index.mjs")}`,
  require: `./${path.join(outDir, "index.cjs")}`,
});

project.synth();
