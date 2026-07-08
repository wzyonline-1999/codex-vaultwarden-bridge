#!/usr/bin/env node
import { build } from "esbuild";

await build({
  entryPoints: ["src/server.ts"],
  outfile: "mcp/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  banner: {
    js: "#!/usr/bin/env node"
  }
});
