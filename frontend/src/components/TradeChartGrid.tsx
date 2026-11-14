import { Component, createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  IChartApi,
  UTCTimestamp,
  SeriesMarker,
  Time,
} from 'lightweight-charts';
import { TradeDeal } from '../types';
import { Loader2, CandlestickChart, Database, WifiOff } from 'lucide-solid';

export interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlesResponse {
  ticket: number;
  h1: OhlcBar[];
  m5: OhlcBar[];
  m1: OhlcBar[];
  cached: boolean;
  mt5_connected: boolean;
}

interface TradeChartGridProps {
  trade: TradeDeal;
}

interface CandlePaneProps {
  title: string;
  tfSeconds: number;
  bars: OhlcBar[];
  trade: TradeDeal;
  heightClass: string;
  spanClass?: string;
}

function findBarTime(bars: OhlcBar[], targetTs: number, tfSeconds: number): UTCTimestamp | null {
  if (!bars.length || !targetTs) return null;
  // Exact bucket match or latest bar whose open time <= targetTs
  let best = bars[0].time;
  for (const b of bars) {
    if (b.time <= targetTs) {
      best = b.time;
    } else {
      break;
    }
  }
  // If targetTs is slightly before the first bar, clamp to first bar if within 2 bars
  if (targetTs < bars[0].time && bars[0].time - targetTs <= tfSeconds * 2) {
    best = bars[0].time;
  }
  return best as UTCTimestamp;
}

const CandlePane: Component<CandlePaneProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let chart: IChartApi | undefined;

  const renderChart = () => {
    if (!containerRef) return;
    if (chart) {
      chart.remove();
      chart = undefined;
    }

    const bars = props.bars;
    if (!bars || bars.length === 0) return;

    const width = containerRef.clientWidth || 320;
    const height = containerRef.clientHeight || 220;

    chart = createChart(containerRef, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1, style: LineStyle.Dashed },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.04, bottom: 0.04 },
      },
    });

    const t = props.trade;
    const openTs = t.open_time || t.time;
    const closeTs = t.time;
    const entryBarTime = findBarTime(bars, openTs, props.tfSeconds);
    const exitBarTime = findBarTime(bars, closeTs, props.tfSeconds);

    // Subtle open-to-close range highlight (solid rectangle via AreaSeries, or 1-bar Histogram fallback)
    if (entryBarTime !== null && exitBarTime !== null) {
      const minT = Math.min(entryBarTime as number, exitBarTime as number);
      const maxT = Math.max(entryBarTime as number, exitBarTime as number);
      const net = t.net_profit !== undefined ? t.net_profit : t.profit + (t.swap || 0) + (t.commission || 0);
      const bandColor = net >= 0 ? 'rgba(16, 185, 129, 0.10)' : 'rgba(244, 63, 94, 0.10)';
      const inRangeBars = bars.filter((b) => b.time >= minT && b.time <= maxT);

      if (inRangeBars.length >= 2) {
        const areaSeries = chart.addSeries(AreaSeries, {
          priceScaleId: 'band',
          lineVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          topColor: bandColor,
          bottomColor: bandColor,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 1 },
          }),
        });
        areaSeries.setData(
          inRangeBars.map((b) => ({
            time: b.time as UTCTimestamp,
            value: 1,
          }))
        );
      } else if (inRangeBars.length === 1) {
        const bandSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'band',
          priceLineVisible: false,
          lastValueVisible: false,
          base: 0,
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 1 },
          }),
        });
        bandSeries.setData([
          { time: inRangeBars[0].time as UTCTimestamp, value: 1, color: bandColor },
        ]);
      }

      chart.priceScale('band').applyOptions({
        visible: false,
        scaleMargins: { top: 0, bottom: 0 },
      });
    }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      priceLineVisible: false,
      lastValueVisible: false,
    });

    candleSeries.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }))
    );

    // Horizontal price lines: Entry, Exit, SL, TP (clean lines without overlapping axis boxes)
    if (t.open_price > 0) {
      candleSeries.createPriceLine({
        price: t.open_price,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }

    if (t.price > 0) {
      const net = t.net_profit !== undefined ? t.net_profit : t.profit + (t.swap || 0) + (t.commission || 0);
      candleSeries.createPriceLine({
        price: t.price,
        color: net >= 0 ? '#10b981' : '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }

    if (t.sl > 0) {
      candleSeries.createPriceLine({
        price: t.sl,
        color: '#fb7185',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
    }

    if (t.tp > 0) {
      candleSeries.createPriceLine({
        price: t.tp,
        color: '#34d399',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
      });
    }

    // Entry & Exit markers
    const markers: SeriesMarker<Time>[] = [];
    const isBuy = t.type === 0;
    if (entryBarTime !== null) {
      markers.push({
        time: entryBarTime,
        position: isBuy ? 'belowBar' : 'aboveBar',
        color: '#3b82f6',
        shape: isBuy ? 'arrowUp' : 'arrowDown',
        text: isBuy ? 'BUY' : 'SELL',
      });
    }
    if (exitBarTime !== null) {
      markers.push({
        time: exitBarTime,
        position: isBuy ? 'aboveBar' : 'belowBar',
        color: '#f59e0b',
        shape: isBuy ? 'arrowDown' : 'arrowUp',
        text: 'EXIT',
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markers.length > 0) {
      createSeriesMarkers(candleSeries, markers);
    }

    if (entryBarTime !== null && exitBarTime !== null && props.tfSeconds <= 300) {
      const entryIdx = bars.findIndex((b) => b.time === (entryBarTime as number));
      const exitIdx = bars.findIndex((b) => b.time === (exitBarTime as number));
      if (entryIdx >= 0 && exitIdx >= 0) {
        const padBefore = props.tfSeconds === 300 ? 40 : 30;
        const padAfter = props.tfSeconds === 300 ? 20 : 15;
        const fromIdx = Math.max(0, Math.min(entryIdx, exitIdx) - padBefore);
        const toIdx = Math.min(bars.length - 1, Math.max(entryIdx, exitIdx) + padAfter);
        chart.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
        return;
      }
    }

    chart.timeScale().fitContent();
  };

  onMount(() => {
    const ro = new ResizeObserver(() => {
      if (chart && containerRef) {
        chart.applyOptions({
          width: containerRef.clientWidth,
          height: containerRef.clientHeight,
        });
      }
    });
    if (containerRef) ro.observe(containerRef);
    onCleanup(() => {
      ro.disconnect();
      if (chart) {
        chart.remove();
        chart = undefined;
      }
    });
  });

  createEffect(() => {
    // Track bars and ticket
    void props.bars;
    void props.trade.ticket;
    queueMicrotask(() => renderChart());
  });

  return (
    <div class={`bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col ${props.spanClass || ''}`}>
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/80 bg-slate-900/50 text-[11px]">
        <span class="font-bold tracking-wider text-slate-200">{props.title}</span>
        <span class="font-mono text-slate-500">{props.bars.length} bars</span>
      </div>
      <Show
        when={props.bars.length > 0}
        fallback={
          <div class={`${props.heightClass} flex items-center justify-center text-[11px] text-slate-500 px-4 text-center`}>
            No {props.title} candle data available for this range.
          </div>
        }
      >
        <div ref={containerRef} class={`w-full ${props.heightClass}`} />
      </Show>
    </div>
  );
};

export const TradeChartGrid: Component<TradeChartGridProps> = (props) => {
  const [data, setData] = createSignal<CandlesResponse | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

  createEffect(() => {
    const ticket = props.trade.ticket;
    if (!ticket) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/trades/${ticket}/candles`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CandlesResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    onCleanup(() => {
      cancelled = true;
    });
  });

  const hasAnyBars = () => {
    const d = data();
    return Boolean(d && (d.h1.length > 0 || d.m5.length > 0 || d.m1.length > 0));
  };

  const netProfit = () => {
    const t = props.trade;
    return t.net_profit !== undefined ? t.net_profit : t.profit + (t.swap || 0) + (t.commission || 0);
  };

  return (
    <div class="space-y-2.5">
      <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div class="flex items-center gap-2">
          <CandlestickChart size={14} class="text-blue-400" />
          <span class="font-semibold text-slate-200">Multi-Timeframe Context</span>
          <span class="text-slate-500 font-mono">H1 • M5 • M1</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 font-mono text-[10px]">
          <Show when={props.trade.open_price > 0}>
            <span class="inline-flex items-center gap-1 text-blue-300">
              <span class="w-2.5 border-t border-dashed border-blue-400" />
              Entry {props.trade.open_price}
            </span>
          </Show>
          <Show when={props.trade.price > 0}>
            <span class={`inline-flex items-center gap-1 ${netProfit() >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              <span class={`w-2.5 border-t border-dashed ${netProfit() >= 0 ? 'border-emerald-400' : 'border-rose-400'}`} />
              Exit {props.trade.price}
            </span>
          </Show>
          <Show when={props.trade.sl > 0}>
            <span class="inline-flex items-center gap-1 text-rose-300">
              <span class="w-2.5 border-t border-dotted border-rose-400" />
              SL {props.trade.sl}
            </span>
          </Show>
          <Show when={props.trade.tp > 0}>
            <span class="inline-flex items-center gap-1 text-emerald-300">
              <span class="w-2.5 border-t border-dotted border-emerald-400" />
              TP {props.trade.tp}
            </span>
          </Show>
          <Show when={data()}>
            {(d) => (
              <>
                <Show when={d().cached}>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    <Database size={10} class="text-emerald-400" />
                    Cached
                  </span>
                </Show>
                <Show when={!d().mt5_connected && !hasAnyBars()}>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <WifiOff size={10} />
                    MT5 Offline
                  </span>
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>

      <Show when={loading()}>
        <div class="h-[460px] bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 size={16} class="animate-spin text-blue-400" />
          <span>Loading H1 / M5 / M1 candles...</span>
        </div>
      </Show>

      <Show when={!loading() && error()}>
        <div class="h-[240px] bg-slate-950/70 border border-rose-500/30 rounded-xl flex items-center justify-center text-xs text-rose-400 px-4 text-center">
          Failed to load trade candles: {error()}
        </div>
      </Show>

      <Show when={!loading() && !error() && data()}>
        {(d) => (
          <Show
            when={hasAnyBars()}
            fallback={
              <div class="h-[460px] bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col items-center justify-center gap-2 text-xs text-slate-400 px-6 text-center">
                <WifiOff size={20} class="text-slate-500" />
                <p class="font-medium text-slate-300">No chart candles available for #{props.trade.ticket}</p>
                <p class="text-[11px] text-slate-500 max-w-sm">
                  {d().mt5_connected
                    ? 'MT5 returned no historical bars for this symbol/timeframe range.'
                    : 'Connect MetaTrader 5 and open this trade once to cache its H1 / M5 / M1 candles.'}
                </p>
              </div>
            }
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <CandlePane title="H1" tfSeconds={3600} bars={d().h1} trade={props.trade} heightClass="h-[210px]" />
              <CandlePane title="M5" tfSeconds={300} bars={d().m5} trade={props.trade} heightClass="h-[210px]" />
              <CandlePane title="M1" tfSeconds={60} bars={d().m1} trade={props.trade} heightClass="h-[235px]" spanClass="md:col-span-2" />
            </div>
          </Show>
        )}
      </Show>
    </div>
  );
};
