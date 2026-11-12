import fs from 'node:fs';
import { createHash } from 'node:crypto';

const inputs = process.argv.length > 2 ? process.argv.slice(2) : ['.data/qa-browser-results.json'];
const reports = inputs.map(input => JSON.parse(fs.readFileSync(input, 'utf8')));
const cases = new Map();
function visit(suite, run) {
  for (const spec of suite.specs || []) {
    const key = `${spec.file}:${spec.title}`;
    if (!cases.has(key)) cases.set(key, {
      id: `AUTO-${createHash('sha256').update(key).digest('hex').slice(0, 10)}`,
      title: spec.title, file: spec.file, line: spec.line,
      evidence: [],
    });
    cases.get(key).evidence.push(...spec.tests.map(test => ({
        run: run + 1,
        project: test.projectName, result: test.status,
        attempts: test.results.map(result => ({ status: result.status, durationMs: result.duration })),
      })));
  }
  for (const child of suite.suites || []) visit(child, run);
}
reports.forEach((report, run) => { for (const suite of report.suites) visit(suite, run); });
const stats = { startTime: reports[0].stats.startTime };
for (const key of ['duration', 'expected', 'skipped', 'unexpected', 'flaky']) stats[key] = reports.reduce((sum, report) => sum + report.stats[key], 0);
const output = {
  generatedAt: new Date().toISOString(), sourceReport: inputs.at(-1), sourceReports: inputs,
  stats, runs: reports.map((report, run) => ({ run: run + 1, sourceReport: inputs[run], stats: report.stats })),
  cases: [...cases.values()],
};
fs.mkdirSync('.data', { recursive: true });
fs.writeFileSync('.data/automated-test-results.json', JSON.stringify(output, null, 2) + '\n');
console.log(`${cases.size} cases indexed across ${reports.length} run(s); ${stats.expected} passed, ${stats.unexpected} unexpected.`);
