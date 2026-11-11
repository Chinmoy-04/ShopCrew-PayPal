import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep QA databases on the workspace volume, away from Windows temporary
// storage. Only directories created by this process are eligible for cleanup.
const qaRoot = fileURLToPath(new URL('../.data/qa-workers/', import.meta.url));
const ownedRoots = new Map();
export function isolatedEnv() {
 fs.mkdirSync(qaRoot, { recursive: true });
 const root = fs.mkdtempSync(path.join(qaRoot, 'worker-'));
 ownedRoots.set(path.join(root, 'db'), root);
 return { ...process.env, NODE_ENV: "test",
 DATABASE_URL: '', PGLITE_DIR: path.join(root, 'db'), CAPTURE_POOL_PATH: path.join(root, 'captures.json'), CAPTURE_POOL_JSON: '{"orders":[]}',
 DEMO_BUYER_EMAIL: '', DEMO_BUYER_HINT: 'Isolated QA buyer', SUPPLIER_EMAILS: 'qa-supplier@example.invalid', UNCLAIMED_SUPPLIER_EMAIL: 'qa-unclaimed@example.invalid',
 AG_GRID_LICENSE_KEY: '', AG_STUDIO_LICENSE_KEY: '',
 PAYPAL_CLIENT_ID: '', PAYPAL_CLIENT_SECRET: '', PAYPAL_WEBHOOK_ID: '', PAYPAL_ENV: 'sandbox',
 GOOGLE_GENERATIVE_AI_API_KEY: '', GROQ_API_KEY: '', OPENAI_API_KEY: '', AG_STUDIO_OPENAI_API_KEY: '',
 RENDER_API_KEY: '', RENDER_WORKFLOW_SLUG: '', WORKFLOW_CALLBACK_TOKEN: '',
 LLM_PROVIDER: 'replay', LLM_RECORD: '', DEMO_SEED: '42', DEMO_PUBLIC_RESET: '',
 ADMIN_TOKEN: 'shopcrew-qa-only', PORT: '8801', PUBLIC_BASE_URL: 'http://127.0.0.1:8801' };
}

export function cleanupIsolatedEnv(environment) {
 const root = ownedRoots.get(environment.PGLITE_DIR);
 if (!root || environment.CAPTURE_POOL_PATH !== path.join(root, 'captures.json') ||
     path.dirname(root) !== path.resolve(qaRoot) || fs.lstatSync(root).isSymbolicLink() ||
     path.dirname(fs.realpathSync(root)) !== fs.realpathSync(qaRoot)) {
  throw new Error('Refusing to remove a directory not owned by this QA process');
 }
 fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
 ownedRoots.delete(environment.PGLITE_DIR);
}
