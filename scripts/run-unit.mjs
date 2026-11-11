import { spawnSync } from 'node:child_process';
import { isolatedEnv } from './test-env.mjs';
const result = spawnSync(process.execPath, ['../../node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { cwd: 'apps/server', env: isolatedEnv(), stdio: 'inherit' });
process.exit(result.status ?? 1);
