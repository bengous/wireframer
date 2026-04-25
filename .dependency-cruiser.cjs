const recommended = require("./node_modules/dependency-cruiser/configs/recommended-strict.cjs");

const NON_TEST_TS = "\\.(test|e2e\\.test)\\.ts$";
const ORPHAN_EXCEPTIONS = [
  "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
  "^src/index\\.ts$",
  "^scripts/",
].join("|");

module.exports = {
  forbidden: recommended.forbidden
    .map((rule) => {
      if (rule.name === "not-to-unresolvable") {
        return {
          ...rule,
          to: {
            ...rule.to,
            pathNot: "^(bun|react/jsx-runtime)$",
          },
        };
      }
      if (rule.name === "no-orphans") {
        return {
          ...rule,
          from: {
            ...rule.from,
            pathNot: ORPHAN_EXCEPTIONS,
          },
        };
      }
      return { ...rule };
    })
    .concat([
      {
        name: "no-prod-to-testing",
        comment: "Production code must not depend on test helpers.",
        severity: "error",
        from: {
          path: "^(src|scripts)/(?!testing/).+\\.ts$",
          pathNot: NON_TEST_TS,
        },
        to: {
          path: "^src/testing/",
        },
      },
    ]),
  options: {
    ...recommended.options,
    moduleSystems: ["cjs", "es6"],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    builtInModules: {
      add: ["bun"],
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types", "bun"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
