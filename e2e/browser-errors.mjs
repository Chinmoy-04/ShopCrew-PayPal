// WebKit can report native request cancellation as a pageerror while replacing
// a document: https://github.com/microsoft/playwright/issues/43120.
// This does not classify JavaScript exceptions or failures on a settled page.
export function isWebKitNavigationCancellation(error, { browserName, navigationPending, origin }) {
  if (browserName !== 'webkit' || !navigationPending || !origin) return false;
  const description = (error.stack || `${error.name}: ${error.message}`)
    .replace(/cannot load (https?):\s*\/(?!\/)/, 'cannot load $1://');
  const match = /^(?:Fetch API|EventSource|XMLHttpRequest) cannot load (https?:\/\/\S+) due to access control checks\.(?:\n|$)/.exec(description);
  if (!match) return false;
  try {
    const url = new URL(match[1]);
    return url.origin === origin && !url.search && ['/api/products', '/api/events'].includes(url.pathname);
  } catch { return false; }
}
