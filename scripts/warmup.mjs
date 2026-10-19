const url = process.argv[2] || process.env.PUBLIC_BASE_URL || "http://localhost:8787";
const target = `${url.replace(/\/$/, "")}/healthz`;
const deadline = Date.now() + 90_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(target);
    if (response.ok) {
      console.log(`warm ${target}`);
      process.exit(0);
    }
  } catch {
    // service is still cold
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

console.error(`timed out waiting for ${target}`);
process.exit(1);
