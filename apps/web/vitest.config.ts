import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" verhindert Importe im Browser; in Tests ist das irrelevant.
      "server-only": fileURLToPath(new URL("./test/leer/server-only.ts", import.meta.url)),
    },
  },
  test: { include: ["test/**/*.test.ts"], fileParallelism: false },
});
