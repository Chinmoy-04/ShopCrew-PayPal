import { spawn } from 'node:child_process';
import { isolatedEnv } from './test-env.mjs';
const child = spawn(process.execPath, ['apps/server/dist/index.js'], { env: isolatedEnv(), stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
