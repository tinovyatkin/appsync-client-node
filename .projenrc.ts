import * as path from "path";
import { javascript, JsonPatch, ProjenrcFile, typescript } from "projen";
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
  typescriptVersion: "~5.2.2",
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
  jest: true,
  jestOptions: {
    junitReporting: false,
    jestConfig: {
      coverageProvider: "v8",
    },
  },
  codeCov: true,
  codeCovTokenSecret: "CODECOV_TOKEN",
  testdir: "src",
  prettier: true,
  prettierOptions: {
    yaml: true,
  },
  disableTsconfigDev: true,
  tsconfig: {
    compilerOptions: {
      moduleResolution: javascript.TypeScriptModuleResolution.NODE,
      target: "es2022",
      lib: ["es2022"],
      rootDir: "src",
      module: "es2022",
      outDir,
      inlineSources: false,
    },
    exclude: ["**/*.test.ts"],
  },
  autoMerge: true,
  githubOptions: {
    mergify: true,
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
    "@aws-amplify/amplify-appsync-simulator",
    "prettier-plugin-organize-imports",
    "prettier-plugin-organize-attributes",
  ],
  eslintOptions: {
    dirs: ["src"],
    devdirs: [""],
    fileExtensions: [".ts"],
    lintProjenRcFile: "",
    lintProjenRc: false,
    yaml: true,
  },
});
project.tsconfigDev.file.patch(
  JsonPatch.add("/ts-node", {
    esm: true,
    preferTsExts: true,
    transpileOnly: true,
    experimentalSpecifierResolution: "node",
  })
);
project.tsconfigDev.file.patch(JsonPatch.replace("/include", [project.srcdir]));
project.eslint?.addRules({
  "import/order": "off",
});
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
project.eslint?.addIgnorePattern(path.join(project.testdir, "*.test.ts"));
project.eslint?.addOverride({
  files: [ProjenrcFile.of(project)!.filePath],
  extends: ["plugin:@typescript-eslint/disable-type-checked"],
});
project.package.addField("files", [outDir]);

project.preCompileTask.reset();
project.preCompileTask.spawn(project.eslint!.eslintTask);
project.preCompileTask.exec(`rm -rf ${outDir}`);
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

project.jest!.config.preset = "ts-jest/presets/default-esm";
delete project.jest?.config.globals;
project.testTask.reset("jest", { receiveArgs: true });
project.testTask.env(
  "NODE_OPTIONS",
  "--experimental-vm-modules --enable-source-maps --no-warnings"
);

project.synth();
