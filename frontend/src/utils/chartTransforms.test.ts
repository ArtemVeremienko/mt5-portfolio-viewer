// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deduplicateByTime, sliceCurvesByTimeframe } from './chartTransforms';
import type { CurvePoint } from '../types';

const makePoint = (timestamp: number, growth_pct = 0): CurvePoint => ({
  timestamp,
  balance: 1000,
  equity: 1000,
  profit: 0,
  growth_pct,
  drawdown_pct: 0,
  cumulative_r: 0,
  r_drawdown: 0,
});

describe('chartTransforms', () => {
  it('deduplicates strictly ascending timestamps keeping latest value', () => {
    const pts = [
      { time: 100 as unknown as import('lightweight-charts').UTCTimestamp, value: 1 },
      { time: 100 as unknown as import('lightweight-charts').UTCTimestamp, value: 2 },
      { time: 90 as unknown as import('lightweight-charts').UTCTimestamp, value: 0 },
      { time: 200 as unknown as import('lightweight-charts').UTCTimestamp, value: 3 },
    ];
    const deduped = deduplicateByTime(pts);
    expect(deduped.map((p) => [p.time, p.value])).toEqual([
      [90, 0],
      [100, 2],
      [200, 3],
    ]);
  });

  it('slices curve points by timeframe relative to latest point', () => {
    const day = 86400;
    const curves = [makePoint(1000), makePoint(1000 + 20 * day), makePoint(1000 + 40 * day)];
    expect(sliceCurvesByTimeframe(curves, 'all').length).toBe(3);
    expect(sliceCurvesByTimeframe(curves, '7D').length).toBe(1);
    expect(sliceCurvesByTimeframe(curves, '1M').length).toBe(2);
  });

  it('does not mutate input array and handles empty input in deduplicateByTime', () => {
    expect(deduplicateByTime([])).toEqual([]);
    const pts = Object.freeze([
      { time: 200 as unknown as import('lightweight-charts').UTCTimestamp, value: 2 },
      { time: 100 as unknown as import('lightweight-charts').UTCTimestamp, value: 1 },
    ]) as Array<{ time: import('lightweight-charts').UTCTimestamp; value: number }>;
    const deduped = deduplicateByTime(pts);
    expect(deduped.map((p) => p.time)).toEqual([100, 200]);
    expect(pts.map((p) => p.time)).toEqual([200, 100]);
  });
});
