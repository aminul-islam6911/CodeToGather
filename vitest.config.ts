import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

/**
 * Resolve NodeNext-style ".js" specifiers back to their ".ts" source so source
 * files can use the extensions TypeScript's NodeNext mode requires.
 */
const resolveTsFromJs: Plugin = {
  name: "resolve-ts-from-js",
  enforce: "pre",
  async resolveId(source, importer) {
    if (importer && source.startsWith(".") && source.endsWith(".js")) {
      const resolved = await this.resolve(source.replace(/\.js$/, ".ts"), importer, {
        skipSelf: true,
      });
      if (resolved) return resolved;
    }
    return null;
  },
};

export default defineConfig({
  plugins: [resolveTsFromJs],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
});
