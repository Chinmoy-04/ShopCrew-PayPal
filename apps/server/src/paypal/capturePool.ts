import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../config.js";

export interface PoolOrder {
  id: string;
  paypalOrderId?: string | null;
  paypalCaptureId?: string | null;
  total?: number;
  refunded?: number;
}

export interface CapturePool {
  orders: PoolOrder[];
}

function poolPath(): string {
  return process.env.CAPTURE_POOL_PATH || path.join(repoRoot(), "fixtures", "capture-pool.json");
}

export function readCapturePool(): CapturePool {
  // The mutable file is authoritative. CAPTURE_POOL_JSON only bootstraps a new disk.
  if (fs.existsSync(poolPath())) {
    return JSON.parse(fs.readFileSync(poolPath(), "utf8")) as CapturePool;
  }
  const fromEnv = process.env.CAPTURE_POOL_JSON?.trim();
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv) as CapturePool;
    } catch {
      /* fall through */
    }
  }
  try {
    return JSON.parse(fs.readFileSync(poolPath(), "utf8")) as CapturePool;
  } catch {
    return { orders: [] };
  }
}

export function writeCapturePool(pool: CapturePool): void {
  const target = poolPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(pool, null, 2) + "\n");
  fs.renameSync(temporary, target);
}

/** Keep two demo slots (ord-large / ord-small) filled with live captures when possible. */
export function autoRegisterLiveCapture(input: {
  paypalOrderId: string;
  paypalCaptureId: string;
  total: number;
}): CapturePool | null {
  if (!input.paypalCaptureId || input.paypalCaptureId.startsWith("DRY")) return null;
  if (input.total < 36) return null;

  const pool = readCapturePool();
  const orders = [...(pool.orders ?? [])];
  const byId = new Map(orders.map((o) => [o.id, o]));

  const large = byId.get("ord-large");
  const small = byId.get("ord-small");
  const entry: PoolOrder = {
    id: input.total >= 45 && (!large?.paypalCaptureId || large.paypalCaptureId.startsWith("DRY")) ? "ord-large" : "ord-small",
    paypalOrderId: input.paypalOrderId,
    paypalCaptureId: input.paypalCaptureId,
    total: input.total,
    refunded: 0,
  };

  if (input.total >= 45 && (!large?.paypalCaptureId || String(large.paypalCaptureId).startsWith("DRY"))) {
    entry.id = "ord-large";
  } else if (!small?.paypalCaptureId || String(small.paypalCaptureId).startsWith("DRY")) {
    entry.id = "ord-small";
  } else if (input.total >= 45) {
    // Prefer refreshing the large slot when both already live and this capture is big enough.
    entry.id = "ord-large";
  } else {
    return null;
  }

  const next = orders.filter((o) => o.id !== entry.id);
  next.push(entry);
  // Ensure both slot ids exist for seed.
  if (!next.some((o) => o.id === "ord-large")) next.push({ id: "ord-large", paypalOrderId: null, paypalCaptureId: null });
  if (!next.some((o) => o.id === "ord-small")) next.push({ id: "ord-small", paypalOrderId: null, paypalCaptureId: null });
  const updated = { orders: next.sort((a, b) => a.id.localeCompare(b.id)) };
  writeCapturePool(updated);
  return updated;
}

export function markPoolRefund(captureId: string, amount: number): void {
  const pool = readCapturePool();
  let changed = false;
  for (const order of pool.orders ?? []) {
    if (order.paypalCaptureId === captureId) {
      order.refunded = (order.refunded ?? 0) + amount;
      changed = true;
    }
  }
  if (changed) writeCapturePool(pool);
}

export function poolRemaining(captureId: string, orderTotal: number, refundedTotal: number): number {
  const pool = readCapturePool();
  const slot = pool.orders?.find((o) => o.paypalCaptureId === captureId);
  if (slot?.total != null) return Math.max(0, (slot.total ?? orderTotal) - (slot.refunded ?? refundedTotal));
  return Math.max(0, orderTotal - refundedTotal);
}

export function isCaptureExhausted(captureId: string, orderTotal: number, refundedTotal: number, amount: number): boolean {
  return amount > poolRemaining(captureId, orderTotal, refundedTotal) + 0.001;
}
