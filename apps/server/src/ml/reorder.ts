export interface ReorderPlan {
  reorderPoint: number;
  daysOfCover: number;
  qty: number;
  shouldOrder: boolean;
  daily: number;
}

export function reorderPlan(input: {
  stock: number;
  daily: number;
  sigma: number;
  leadTimeDays: number;
  coverDays?: number;
  z?: number;
}): ReorderPlan {
  const z = input.z ?? 1.28;
  const daily = Math.max(0, input.daily);
  const reorderPoint = daily * input.leadTimeDays + z * input.sigma * Math.sqrt(Math.max(1, input.leadTimeDays));
  const daysOfCover = daily > 0.05 ? input.stock / daily : 999;
  const coverDays = input.coverDays ?? 21;
  const qty = Math.max(0, Math.ceil(coverDays * daily - input.stock));
  return {
    reorderPoint,
    daysOfCover,
    qty,
    shouldOrder: input.stock <= reorderPoint && qty > 0,
    daily,
  };
}
