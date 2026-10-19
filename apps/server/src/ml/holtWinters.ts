export interface HwResult {
  forecast: number[];
  lower: number[];
  upper: number[];
  mape: number;
  sigma: number;
  params: { alpha: number; beta: number; gamma: number };
}

interface State {
  level: number;
  trend: number;
  seasonal: number[];
  fitted: number[];
}

function fit(series: number[], m: number, alpha: number, beta: number, gamma: number): State {
  const seasonAvg = (start: number) => {
    let sum = 0;
    for (let i = 0; i < m; i++) sum += series[start + i] ?? 0;
    return sum / m;
  };
  let level = seasonAvg(0);
  let trend = series.length > m * 2 ? (seasonAvg(m) - level) / m : 0;
  const seasonal = Array.from({ length: m }, (_, i) => (series[i] ?? level) - level);
  const fitted: number[] = [];
  for (let t = 0; t < series.length; t++) {
    const season = seasonal[t % m];
    fitted.push(level + trend + season);
    const value = series[t];
    const nextLevel = alpha * (value - season) + (1 - alpha) * (level + trend);
    const nextTrend = beta * (nextLevel - level) + (1 - beta) * trend;
    seasonal[t % m] = gamma * (value - nextLevel) + (1 - gamma) * season;
    level = nextLevel;
    trend = nextTrend;
  }
  return { level, trend, seasonal, fitted };
}

function project(state: State, origin: number, m: number, horizon: number): number[] {
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    out.push(Math.max(0, state.level + h * state.trend + state.seasonal[(origin + h - 1) % m]));
  }
  return out;
}

function mape(actual: number[], predicted: number[]): number {
  let total = 0;
  let n = 0;
  for (let i = 0; i < actual.length; i++) {
    const denom = Math.max(actual[i], 0.5);
    total += Math.abs(actual[i] - predicted[i]) / denom;
    n++;
  }
  return n ? total / n : 0;
}

export function holtWinters(series: number[], horizon = 14, season = 7): HwResult {
  if (series.length < season * 3) {
    const mean = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);
    const forecast = Array.from({ length: horizon }, () => mean);
    return { forecast, lower: forecast.map((v) => Math.max(0, v * 0.7)), upper: forecast.map((v) => v * 1.3), mape: 0.2, sigma: mean * 0.2, params: { alpha: 0.4, beta: 0.1, gamma: 0.2 } };
  }
  const holdout = Math.min(14, Math.floor(series.length / 5));
  const train = series.slice(0, series.length - holdout);
  const test = series.slice(series.length - holdout);
  const grid = [0.2, 0.4, 0.6];
  let best = { score: Number.POSITIVE_INFINITY, alpha: 0.4, beta: 0.2, gamma: 0.2 };
  for (const alpha of grid) {
    for (const beta of [0.05, 0.15, 0.3]) {
      for (const gamma of grid) {
        const state = fit(train, season, alpha, beta, gamma);
        const forecast = project(state, train.length, season, holdout);
        const score = mape(test, forecast);
        if (score < best.score) best = { score, alpha, beta, gamma };
      }
    }
  }
  const state = fit(series, season, best.alpha, best.beta, best.gamma);
  const forecast = project(state, series.length, season, horizon);
  const residuals = series.map((value, i) => value - state.fitted[i]);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance = residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, residuals.length - 1);
  const sigma = Math.sqrt(variance);
  const z = 1.28155;
  return {
    forecast,
    lower: forecast.map((value) => Math.max(0, value - z * sigma)),
    upper: forecast.map((value) => value + z * sigma),
    mape: best.score,
    sigma,
    params: { alpha: best.alpha, beta: best.beta, gamma: best.gamma },
  };
}
