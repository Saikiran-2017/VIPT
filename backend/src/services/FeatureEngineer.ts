import type { FeatureEngineeringFields, FeatureVector, RetailEvent } from '@shared/types';

const FEATURE_ORDER: (keyof FeatureEngineeringFields)[] = [
  'lag1',
  'lag7',
  'lag14',
  'lag30',
  'rollingMean7d',
  'rollingMean30d',
  'rollingStd7d',
  'rollingStd30d',
  'rsi14',
  'macdSignal',
  'dayOfWeek',
  'dayOfMonth',
  'month',
  'daysToNearestEvent',
  'nearestEventDiscount',
  'pricePct30dRange',
  'crossPlatformSpread',
  'googleTrendScore',
  'reviewSentiment',
];

function clamp01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function emaLast(values: number[], span: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (span + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function computeRSI(prices: number[], period: number): number {
  if (prices.length < 2) return 50;
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }
  const use = Math.min(period, changes.length);
  const slice = changes.slice(-use);
  let avgGain = 0;
  let avgLoss = 0;
  for (const c of slice) {
    if (c >= 0) avgGain += c;
    else avgLoss -= c;
  }
  avgGain /= slice.length;
  avgLoss /= slice.length;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function rollingMeanStd(prices: number[], window: number): { mean: number; std: number } {
  const slice = prices.slice(-Math.min(window, prices.length));
  if (slice.length === 0) return { mean: 0, std: 0 };
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance =
    slice.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, slice.length);
  return { mean, std: Math.sqrt(variance) };
}

function lagRatio(prices: number[], lag: number): number {
  const n = prices.length;
  if (n < 2) return 1;
  const cur = prices[n - 1];
  if (cur === 0) return 1;
  const idx = n - 1 - lag;
  const ref = idx >= 0 ? prices[idx] : prices[0];
  return ref / cur;
}

function macdSignalNorm(prices: number[]): number {
  if (prices.length < 2) return 0;
  const ema12 = emaLast(prices, 12);
  const ema26 = emaLast(prices, 26);
  const macd = ema12 - ema26;
  const last = prices[prices.length - 1];
  return last !== 0 ? macd / last : 0;
}

function pricePct30dRange(prices: number[]): number {
  const slice = prices.slice(-Math.min(30, prices.length));
  if (slice.length < 2) return 0;
  const hi = Math.max(...slice);
  const lo = Math.min(...slice);
  if (hi <= 0) return 0;
  return clamp01((hi - lo) / hi);
}

function crossPlatformSpread(prices: number[] | undefined): number {
  if (!prices || prices.length < 2) return 0;
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (mean === 0) return 0;
  return (hi - lo) / Math.abs(mean);
}

function nearestRetailEvent(
  reference: Date,
  events: RetailEvent[]
): { days: number; discount: number } {
  const refMs = reference.getTime();
  let best: RetailEvent | null = null;
  let bestDiff = Infinity;
  for (const e of events) {
    const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
    const startMs = start.getTime();
    if (startMs >= refMs) {
      const d = startMs - refMs;
      if (d < bestDiff) {
        bestDiff = d;
        best = e;
      }
    }
  }
  if (!best) {
    return { days: 365, discount: 0 };
  }
  const start = best.startDate instanceof Date ? best.startDate : new Date(best.startDate);
  const days = Math.max(0, Math.round((start.getTime() - refMs) / (24 * 3600 * 1000)));
  const { min, max } = best.expectedDiscountRange;
  const discount = (Number(min) + Number(max)) / 2;
  return { days, discount: Number.isFinite(discount) ? discount : 0 };
}

/**
 * Builds dense feature vectors from price history (Phase 1 — no external APIs).
 *
 * `prices` and `dates` must be chronological (oldest → newest), equal length, ≥ 2 points.
 */
export class FeatureEngineer {
  buildFeatureVector(
    prices: number[],
    dates: Date[],
    retailEvents: RetailEvent[],
    crossPlatformPrices?: number[]
  ): FeatureVector {
    if (prices.length < 2 || dates.length < 2) {
      throw new Error('FeatureEngineer.buildFeatureVector requires at least 2 price points and 2 dates');
    }
    if (prices.length !== dates.length) {
      throw new Error('FeatureEngineer.buildFeatureVector: prices and dates must have the same length');
    }

    const lastDate = dates[dates.length - 1] instanceof Date ? dates[dates.length - 1] : new Date(dates[dates.length - 1]);

    const cur = prices[prices.length - 1];
    const rm7 = rollingMeanStd(prices, 7);
    const rm30 = rollingMeanStd(prices, 30);

    const { days: daysToNearestEvent, discount: nearestEventDiscount } = nearestRetailEvent(
      lastDate,
      retailEvents
    );

    const f: FeatureEngineeringFields = {
      lag1: lagRatio(prices, 1),
      lag7: lagRatio(prices, 7),
      lag14: lagRatio(prices, 14),
      lag30: lagRatio(prices, 30),
      rollingMean7d: cur !== 0 ? rm7.mean / cur : 0,
      rollingMean30d: cur !== 0 ? rm30.mean / cur : 0,
      rollingStd7d: cur !== 0 ? rm7.std / cur : 0,
      rollingStd30d: cur !== 0 ? rm30.std / cur : 0,
      rsi14: computeRSI(prices, 14),
      macdSignal: macdSignalNorm(prices),
      dayOfWeek: lastDate.getDay(),
      dayOfMonth: lastDate.getDate(),
      month: lastDate.getMonth() + 1,
      daysToNearestEvent,
      nearestEventDiscount,
      pricePct30dRange: pricePct30dRange(prices),
      crossPlatformSpread: crossPlatformSpread(crossPlatformPrices),
      googleTrendScore: 50,
      reviewSentiment: 0,
    };

    const values = FEATURE_ORDER.map((k) => f[k]);
    return {
      values,
      dimension: values.length,
      sourceModel: 'feature-engineer-v1',
      features: f,
    };
  }
}

export const featureEngineer = new FeatureEngineer();
