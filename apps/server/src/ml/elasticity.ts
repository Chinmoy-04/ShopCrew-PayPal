export interface ElasticityFit {
  elasticity: number;
  intercept: number;
  r2: number;
  n: number;
}

export function olsElasticity(points: { price: number; units: number }[]): ElasticityFit {
  const rows = points.filter((point) => point.price > 0 && point.units > 0);
  if (rows.length < 8) return { elasticity: -1, intercept: 0, r2: 0, n: rows.length };
  const x = rows.map((row) => Math.log(row.price));
  const y = rows.map((row) => Math.log(row.units));
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return { elasticity: -1, intercept: my, r2: 0, n };
  const elasticity = sxy / sxx;
  return { elasticity, intercept: my - elasticity * mx, r2: (sxy * sxy) / (sxx * syy), n };
}

export function expectedUnits(intercept: number, elasticity: number, price: number): number {
  if (price <= 0) return 0;
  return Math.exp(intercept + elasticity * Math.log(price));
}
