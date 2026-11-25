import type { UTCTimestamp } from 'lightweight-charts';
import type { CurvePoint } from '../types';

export type ChartTimeframe = '7D' | '1M' | '3M' | 'YTD' | '1Y' | 'all';

export function deduplicateByTime<T extends { time: UTCTimestamp }>(points: T[]): T[] {
  const sorted = points.toSorted((a, b) => Number(a.time) - Number(b.time));
  const out: T[] = [];
  for (const pt of sorted) {
    const prev = out[out.length - 1];
    if (prev && Number(prev.time) === Number(pt.time)) {
      out[out.length - 1] = pt;
    } else {
      out.push(pt);
    }
  }
  return out;
}

export function sliceCurvesByTimeframe(
  curves: CurvePoint[],
  timeframe: ChartTimeframe
): CurvePoint[] {
  if (!curves.length || timeframe === 'all') return curves;
  const latest = curves[curves.length - 1];
  if (!latest) return curves;
  const endTs = latest.timestamp;
  let cutoff = 0;

  if (timeframe === '7D') cutoff = endTs - 7 * 86400;
  else if (timeframe === '1M') cutoff = endTs - 30 * 86400;
  else if (timeframe === '3M') cutoff = endTs - 90 * 86400;
  else if (timeframe === '1Y') cutoff = endTs - 365 * 86400;
  else if (timeframe === 'YTD') {
    const year = new Date(endTs * 1000).getUTCFullYear();
    cutoff = Math.floor(Date.UTC(year, 0, 1) / 1000);
  }

  return curves.filter((pt) => pt.timestamp >= cutoff);
}
