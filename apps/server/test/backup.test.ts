import { expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

it("exports an embedded database and restores it with the recovery script", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopcrew-backup-"));
  vi.stubEnv("PGLITE_DIR", path.join(dir, "source"));
  const { initDb, closeDb, exportEmbeddedDatabase } = await import("../src/db/client.js");
  const { resetDatabase } = await import("../src/db/seed.js");
  try {
    await initDb();
    await resetDatabase();
    const archive = path.join(dir, "backup.tar.gz");
    fs.writeFileSync(archive, await exportEmbeddedDatabase());
    const script = path.resolve("../../scripts/restore-pglite.mjs");
    const target = path.join(dir, "restored");
    const restored = spawnSync(process.execPath, [script, archive, target], { encoding: "utf8" });
    expect(restored.status, restored.stderr).toBe(0);
    expect(restored.stdout).toMatch(/products: [1-9]/);
    const overwrite = spawnSync(process.execPath, [script, archive, target], { encoding: "utf8" });
    expect(overwrite.status).not.toBe(0);
    expect(overwrite.stderr).toContain("destination must not exist");
  } finally {
    await closeDb();
    vi.unstubAllEnvs();
  }
});
