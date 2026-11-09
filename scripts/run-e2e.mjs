import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  require.resolve("@playwright/test");
} catch {
  console.error(
    "Playwright is not installed. To run smoke tests:\n  npm i -D @playwright/test\n  npx playwright install chromium\n  PLAYWRIGHT_BASE_URL=http://localhost:8787 npm run test:e2e",
  );
  process.exit(1);
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "e2e/smoke.spec.ts"],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
