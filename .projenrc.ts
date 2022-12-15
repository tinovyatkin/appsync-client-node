import * as path from "path";
import { javascript, JsonPatch, typescript } from "projen";
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
  disableTsconfig: true,
  tsconfigDevFile: "tsconfig.json",
  tsconfigDev: {
    compilerOptions: {
      // @ts-expect-error -- not yet supported by projen
      moduleResolution: "Node16",
      target: "es2022",
      lib: ["es2022"],
      module: "es2022",
      outDir,
      inlineSources: false,
    },
    "ts-node": {
      esm: true,
      preferTsExts: true,
      experimentalSpecifierResolution: "node",
      experimentalResolver: true,
    },
  },
  githubOptions: {
    mergify: false,
  },
  deps: [
    "@aws-sdk/credential-provider-node",
    "@aws-sdk/hash-node",
    "@aws-sdk/protocol-http",
    "@aws-sdk/signature-v4",
    "@aws-sdk/types",
    "aws-xray-sdk-core",
  ],
  devDeps: [
    "prettier-plugin-organize-imports",
    "prettier-plugin-organize-attributes",
  ],
});
project.tsconfigDev.file.patch(
  JsonPatch.add("/ts-node", {
    esm: true,
    preferTsExts: true,
    experimentalSpecifierResolution: "node",
  })
);
project.eslint?.addRules({ "import/order": "off" });
project.vscode?.extensions.addRecommendations(
  "dbaeumer.vscode-eslint",
  "esbenp.prettier-vscode"
);
project.vscode?.settings.addSettings(
  {
    "editor.codeActionsOnSave": {
      "source.fixAll": true,
      "source.organizeImports": true,
    },
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
  },
  "typescript"
);

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
  `node --enable-source-maps --no-warnings --loader=ts-node/esm .projenrc.ts`
);
project.package.addField("exports", {
  import: `./${path.join(outDir, "index.mjs")}`,
  require: `./${path.join(outDir, "index.cjs")}`,
});

project.synth();
