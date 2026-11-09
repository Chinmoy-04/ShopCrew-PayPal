import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/workflows/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: ["@shopcrew/shared"],
});
