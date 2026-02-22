import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hook-handler.ts",
    "src/hooks/watcher.ts",
  ],
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
