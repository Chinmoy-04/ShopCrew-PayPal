import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// A new runner means a new isolated database/server for each complete pass.
const root = path.resolve('.data', 'qa-stability', new Date().toISOString().replace(/[:.]/g, '-'));
const passes = [];
for (let pass = 1; pass <= 3; pass++) {
  const directory = path.join(root, `pass-${pass}`);
  fs.mkdirSync(directory, { recursive: true });
  const result = spawnSync(process.execPath, ['scripts/run-e2e.mjs', ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env,
      QA_RESULT_FILE: path.join(directory, 'results.json'),
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(directory, 'report'),
      QA_OUTPUT_DIR: path.join(directory, 'test-results'),
    },
  });
  const reportPath = path.join(directory, 'results.json');
  const stats = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')).stats : null;
  const clean = result.status === 0 && stats?.expected > 0 && !stats.unexpected && !stats.flaky && !stats.skipped;
  passes.push({ pass, sourceReport: reportPath, exitCode: result.status, clean, stats });
  fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), complete: passes.length === 3 && passes.every(item => item.clean), passes,
  }, null, 2) + '\n');
  console.log(`Pass ${pass} evidence: ${directory}`);
  if (!clean) process.exit(result.status || 1);
}
console.log(`Three clean passes completed. Evidence: ${root}`);
