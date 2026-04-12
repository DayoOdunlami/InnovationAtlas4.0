import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: "server-only",
        replacement: path.join(rootDir, "src/test-utils/server-only-stub.ts"),
      },
      {
        find: /^next\/headers$/,
        replacement: path.join(rootDir, "src/test-utils/next-headers-stub.ts"),
      },
    ],
  },
  test: {
    exclude: ["**/tests/**", "**/node_modules/**"],
    server: {
      deps: {
        inline: ["better-auth"],
      },
    },
  },
});
