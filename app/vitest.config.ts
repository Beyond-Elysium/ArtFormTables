import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Connector/lib modules import "server-only"; stub it for unit tests.
      "server-only": resolve(__dirname, "test/server-only-stub.ts"),
      "@": resolve(__dirname),
    },
  },
});
