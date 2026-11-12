import { Component, createSignal, onMount, onCleanup, createEffect, Show } from 'solid-js';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  AreaSeries, 
  LineSeries, 
  HistogramSeries, 
  ColorType 
} from 'lightweight-charts';
import { CurvePoint, MetricMode } from '../types';

interface PerformanceChartProps {
  curves: CurvePoint[];
  mode: MetricMode;
}

type ChartTab = 'growth' | 'balance' | 'profit' | 'drawdown' | 'r';

interface BarItemMeta {
  time: any;
  value: number;
  hoverColor: string;
  dateStr: string;
  title: string;
  primaryValue: string;
  secondaryValue: string;
  isPositive: boolean;
}

interface BarTooltipData {
  x: number;
  y: number;
  isPositive: boolean;
  flipped: boolean;
  title: string;
  dateStr: string;
  primaryValue: string;
  secondaryValue: string;
  valueColor: string;
}

const formatTooltipDate = (ts: number): string => {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const PerformanceChart: Component<PerformanceChartProps> = (props) => {
  let chartContainer: HTMLDivElement | undefined;
  let chart: IChartApi | null = null;
  
  // Active series references for dynamic cleanup
  let seriesList: ISeriesApi<any>[] = [];
  let activeBarSeries: ISeriesApi<any> | null = null;
  let activeHighlightSeries: ISeriesApi<any> | null = null;
  let barDataMap = new Map<number, BarItemMeta>();
  let lastHoveredTime: number | null = null;
  let isHandlingCrosshair = false;

  // Zoom and update tracking to preserve user zoom level across live ticks and pill toggles
  let lastTab: ChartTab | null = null;
  let lastTimeframe: string | null = null;
  let lastCurves: CurvePoint[] = [];
  let lastPillsState = {
    growth: true,
    equityGrowth: true,
    balance: true,
    equity: true,
    profit: true,
    drawdown: true,
    rCurve: true,
    changeBars: true,
  };

  const [activeTab, setActiveTab] = createSignal<ChartTab>('growth');
  const [activeTimeframe, setActiveTimeframe] = createSignal<string>('ALL');
  const [barTooltip, setBarTooltip] = createSignal<BarTooltipData | null>(null);

  // Series visibility toggles (Myfxbook style)
  const [showGrowth, setShowGrowth] = createSignal(true);
  const [showEquityGrowth, setShowEquityGrowth] = createSignal(true);
  const [showBalance, setShowBalance] = createSignal(true);
  const [showEquity, setShowEquity] = createSignal(true);
  const [showProfit, setShowProfit] = createSignal(true);
  const [showDrawdown, setShowDrawdown] = createSignal(true);
  const [showRCurve, setShowRCurve] = createSignal(true);
  const [showChangeBars, setShowChangeBars] = createSignal(true);

  // Sync tab with global mode ONLY when user explicitly toggles header mode
  let lastMode = props.mode;
  createEffect(() => {
    const currentMode = props.mode;
    if (currentMode !== lastMode) {
      lastMode = currentMode;
      if (currentMode === 'r') {
        setActiveTab('r');
      } else if (currentMode === 'pct') {
        setActiveTab('growth');
      } else if (currentMode === 'currency') {
        setActiveTab('balance');
      }
    }
  });

  const initChart = () => {
    if (!chartContainer) return;

    if (chart) {
      chart.remove();
      chart = null;
    }

    chart = createChart(chartContainer, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.4)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.4)' },
      },
      crosshair: {
        vertLine: { color: '#475569', width: 1, style: 2 },
        horzLine: { color: '#475569', width: 1, style: 2 },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: false,
      },
      leftPriceScale: {
        visible: false,
        autoScale: true,
        scaleMargins: {
          top: 0.10,
          bottom: 0.10,
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.10,
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Crosshair hover: illuminate hovered change bar using an error-free overlay series & show anchored tooltip
    chart.subscribeCrosshairMove((param) => {
      if (isHandlingCrosshair) return;
      isHandlingCrosshair = true;

      try {
        if (!activeHighlightSeries || !barDataMap.size) {
          setBarTooltip(null);
          return;
        }
        const time = param.time as number | undefined;
        if (time !== undefined && barDataMap.has(time)) {
          const curr = barDataMap.get(time)!;
          if (time !== lastHoveredTime) {
            try {
              activeHighlightSeries.setData([{ time: curr.time, value: curr.value, color: curr.hoverColor }]);
            } catch (e) {
              // Safe guard against canvas edge cases
            }
            lastHoveredTime = time;
          }

          // Calculate anchored tooltip coordinates
          try {
            const pt = param.point;
            if (pt) {
              let x = pt.x;
              try {
                const timeX = chart?.timeScale().timeToCoordinate(time as any);
                if (timeX !== null && timeX !== undefined && !isNaN(timeX)) {
                  x = timeX;
                }
              } catch (err) {
                // Ignore coordinate calculation errors
              }

              const y = pt.y;
              const cWidth = chartContainer?.clientWidth || 800;
              const isPos = curr.isPositive;
              
              // Clamp X so tooltip never clips left/right boundaries (card width ~140px)
              const clampedX = Math.max(75, Math.min(cWidth - 75, x));
              
              // Flip logic: if cursor Y is near top (< 120px), place tooltip below cursor
              const flipped = y < 120;
              
              setBarTooltip({
                x: clampedX,
                y,
                isPositive: isPos,
                flipped,
                title: curr.title,
                dateStr: curr.dateStr,
                primaryValue: curr.primaryValue,
                secondaryValue: curr.secondaryValue,
                valueColor: isPos ? 'text-emerald-400' : 'text-rose-400',
              });
            } else {
              setBarTooltip(null);
            }
          } catch (e) {
            setBarTooltip(null);
          }
        } else {
          if (lastHoveredTime !== null) {
            try {
              activeHighlightSeries.setData([]);
            } catch (e) {
              // Safe guard against canvas edge cases
            }
            lastHoveredTime = null;
          }
          setBarTooltip(null);
        }
      } finally {
        isHandlingCrosshair = false;
      }
    });

    updateChartData(true);
  };

  const clearSeries = () => {
    if (!chart) return;
    for (const s of seriesList) {
      try {
        chart.removeSeries(s);
      } catch (e) {
        // Ignored
      }
    }
    seriesList = [];
    activeBarSeries = null;
    activeHighlightSeries = null;
    barDataMap.clear();
    lastHoveredTime = null;
    isHandlingCrosshair = false;
    setBarTooltip(null);
  };

  const updateChartData = (shouldFitContent: boolean = false) => {
    if (!chart || !props.curves || props.curves.length === 0) return;

    let prevLogicalRange: any = null;
    if (!shouldFitContent) {
      try {
        prevLogicalRange = chart.timeScale().getVisibleLogicalRange();
      } catch (e) {
        // Ignored
      }
    }

    clearSeries();

    // Filter curves by active timeframe
    let data = [...props.curves];
    const now = Math.floor(Date.now() / 1000);
    const tf = activeTimeframe();

    if (tf === '7D') data = data.filter(d => d.timestamp >= now - 7 * 86400);
    else if (tf === '1M') data = data.filter(d => d.timestamp >= now - 30 * 86400);
    else if (tf === '3M') data = data.filter(d => d.timestamp >= now - 90 * 86400);
    else if (tf === 'YTD') {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      data = data.filter(d => d.timestamp >= yearStart);
    } else if (tf === '1Y') data = data.filter(d => d.timestamp >= now - 365 * 86400);

    // Deduplicate data by timestamp (Lightweight charts requirement)
    const uniqueMap = new Map<number, CurvePoint>();
    for (const pt of data) {
      uniqueMap.set(pt.timestamp, pt);
    }
    const sortedData = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    if (!sortedData.length) return;

    const tab = activeTab();
    const hasBars = showChangeBars() && tab !== 'drawdown';

    // Split scaling: upper region for main curves, bars take ~80% of chart space with dimmed colors
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.10,
      },
    });
    chart.priceScale('left').applyOptions({
      visible: false,
      autoScale: true,
      scaleMargins: {
        top: 0.10,
        bottom: 0.10,
      },
    });

    if (tab === 'growth') {
      // 1. Change Bars (%) on left scale (~80% chart space, dimmed default, bright hover)
      if (showChangeBars()) {
        const barSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'percent' },
          priceScaleId: 'left',
          title: 'Change (%)',
        });
        activeBarSeries = barSeries;
        const barItems = sortedData.map(d => {
          const val = d.change_pct ?? 0;
          const amt = d.change_amount ?? 0;
          const dimmedColor = val >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
          const hoverColor = val >= 0 ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.95)';
          const isPos = val >= 0;
          barDataMap.set(d.timestamp, {
            time: d.timestamp,
            value: val,
            hoverColor,
            dateStr: formatTooltipDate(d.timestamp),
            title: 'Change',
            primaryValue: (isPos ? '+' : '') + val.toFixed(2) + '%',
            secondaryValue: (amt >= 0 ? '+$' : '-$') + Math.abs(amt).toFixed(2),
            isPositive: isPos,
          });
          return {
            time: d.timestamp as any,
            value: val,
            color: dimmedColor,
          };
        });
        barSeries.setData(barItems);
        seriesList.push(barSeries);

        // Overlay series for hover highlight
        const highlightSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'percent' },
          priceScaleId: 'left',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        highlightSeries.setData([]);
        activeHighlightSeries = highlightSeries;
        seriesList.push(highlightSeries);
      }

      // 2. Growth (%) Area/Line on right scale (upper region)
      if (showGrowth()) {
        const growthSeries = chart.addSeries(AreaSeries, {
          topColor: 'rgba(16, 185, 129, 0.35)',
          bottomColor: 'rgba(16, 185, 129, 0.0)',
          lineColor: '#10b981',
          lineWidth: 2,
          priceFormat: { type: 'percent' },
          priceScaleId: 'right',
          title: 'Growth',
        });
        growthSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.growth_pct })));
        seriesList.push(growthSeries);
      }

      // 3. Equity Growth (%)
      if (showEquityGrowth()) {
        const equityGrowthSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceFormat: { type: 'percent' },
          priceScaleId: 'right',
          title: 'Equity Growth',
        });
        equityGrowthSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.growth_pct })));
        seriesList.push(equityGrowthSeries);
      }

    } else if (tab === 'balance') {
      // 1. Profit Change Bars ($) on left scale (~80% chart space)
      if (showChangeBars()) {
        const barSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          title: 'Trade Profit ($)',
        });
        activeBarSeries = barSeries;
        const barItems = sortedData.map(d => {
          const val = d.change_amount ?? 0;
          const pct = d.change_pct ?? 0;
          const dimmedColor = val >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
          const hoverColor = val >= 0 ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.95)';
          const isPos = val >= 0;
          barDataMap.set(d.timestamp, {
            time: d.timestamp,
            value: val,
            hoverColor,
            dateStr: formatTooltipDate(d.timestamp),
            title: 'Trade Profit',
            primaryValue: (isPos ? '+$' : '-$') + Math.abs(val).toFixed(2),
            secondaryValue: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
            isPositive: isPos,
          });
          return {
            time: d.timestamp as any,
            value: val,
            color: dimmedColor,
          };
        });
        barSeries.setData(barItems);
        seriesList.push(barSeries);

        const highlightSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        highlightSeries.setData([]);
        activeHighlightSeries = highlightSeries;
        seriesList.push(highlightSeries);
      }

      // 2. Balance Curve on right scale (upper region)
      if (showBalance()) {
        const balanceSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 2,
          priceScaleId: 'right',
          title: 'Balance',
        });
        balanceSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.balance })));
        seriesList.push(balanceSeries);
      }

      // 3. Equity Curve
      if (showEquity()) {
        const equitySeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceScaleId: 'right',
          title: 'Equity',
        });
        equitySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.equity })));
        seriesList.push(equitySeries);
      }

    } else if (tab === 'profit') {
      // 1. Trade Profit Bars ($) on left scale (~80% chart space)
      if (showChangeBars()) {
        const barSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          title: 'Trade Return ($)',
        });
        activeBarSeries = barSeries;
        const barItems = sortedData.map(d => {
          const val = d.change_amount ?? 0;
          const pct = d.change_pct ?? 0;
          const dimmedColor = val >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
          const hoverColor = val >= 0 ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.95)';
          const isPos = val >= 0;
          barDataMap.set(d.timestamp, {
            time: d.timestamp,
            value: val,
            hoverColor,
            dateStr: formatTooltipDate(d.timestamp),
            title: 'Trade Return',
            primaryValue: (isPos ? '+$' : '-$') + Math.abs(val).toFixed(2),
            secondaryValue: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%',
            isPositive: isPos,
          });
          return {
            time: d.timestamp as any,
            value: val,
            color: dimmedColor,
          };
        });
        barSeries.setData(barItems);
        seriesList.push(barSeries);

        const highlightSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        highlightSeries.setData([]);
        activeHighlightSeries = highlightSeries;
        seriesList.push(highlightSeries);
      }

      // 2. Cumulative Profit on right scale (upper region)
      if (showProfit()) {
        const profitSeries = chart.addSeries(AreaSeries, {
          topColor: 'rgba(59, 130, 246, 0.35)',
          bottomColor: 'rgba(59, 130, 246, 0.0)',
          lineColor: '#3b82f6',
          lineWidth: 2,
          priceScaleId: 'right',
          title: 'Cumulative Profit',
        });
        profitSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.profit })));
        seriesList.push(profitSeries);
      }

    } else if (tab === 'drawdown') {
      // Drawdown Curve on right scale
      if (showDrawdown()) {
        const drawdownSeries = chart.addSeries(AreaSeries, {
          topColor: 'rgba(239, 68, 68, 0.0)',
          bottomColor: 'rgba(239, 68, 68, 0.4)',
          lineColor: '#ef4444',
          lineWidth: 2,
          invertFilledArea: true,
          priceFormat: { type: 'percent' },
          priceScaleId: 'right',
          title: 'Drawdown (%)',
        });
        drawdownSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: -Math.abs(d.drawdown_pct) })));
        seriesList.push(drawdownSeries);
      }

    } else if (tab === 'r') {
      // 1. R-Multiple Bars on left scale (~80% chart space)
      if (showChangeBars()) {
        const barSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          priceFormat: {
            type: 'custom',
            formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + 'R',
          },
          title: 'Trade R',
        });
        activeBarSeries = barSeries;
        const barItems = sortedData.map(d => {
          const val = d.change_r ?? 0;
          const amt = d.change_amount ?? 0;
          const pct = d.change_pct ?? 0;
          const dimmedColor = val >= 0 ? 'rgba(168, 85, 247, 0.28)' : 'rgba(244, 63, 94, 0.28)';
          const hoverColor = val >= 0 ? 'rgba(168, 85, 247, 0.95)' : 'rgba(244, 63, 94, 0.95)';
          const isPos = val >= 0;
          barDataMap.set(d.timestamp, {
            time: d.timestamp,
            value: val,
            hoverColor,
            dateStr: formatTooltipDate(d.timestamp),
            title: 'Trade Return',
            primaryValue: (isPos ? '+' : '') + val.toFixed(2) + 'R',
            secondaryValue: (amt >= 0 ? '+$' : '-$') + Math.abs(amt).toFixed(2) + (pct !== 0 ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''),
            isPositive: isPos,
          });
          return {
            time: d.timestamp as any,
            value: val,
            color: dimmedColor,
          };
        });
        barSeries.setData(barItems);
        seriesList.push(barSeries);

        const highlightSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: 'left',
          priceFormat: {
            type: 'custom',
            formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + 'R',
          },
          lastValueVisible: false,
          priceLineVisible: false,
        });
        highlightSeries.setData([]);
        activeHighlightSeries = highlightSeries;
        seriesList.push(highlightSeries);
      }

      // 2. Cumulative R on right scale (upper region)
      if (showRCurve()) {
        const rSeries = chart.addSeries(AreaSeries, {
          topColor: 'rgba(168, 85, 247, 0.4)',
          bottomColor: 'rgba(168, 85, 247, 0.0)',
          lineColor: '#a855f7',
          lineWidth: 2,
          priceScaleId: 'right',
          priceFormat: {
            type: 'custom',
            formatter: (p: number) => (p >= 0 ? '+' : '') + p.toFixed(2) + 'R',
          },
          title: 'Cumulative R',
        });
        rSeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.cumulative_r })));
        seriesList.push(rSeries);
      }
    }

    if (!shouldFitContent && prevLogicalRange) {
      try {
        chart.timeScale().setVisibleLogicalRange(prevLogicalRange);
      } catch (e) {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }
  };

  onMount(() => {
    initChart();
    const handleResize = () => {
      if (chart && chartContainer) {
        chart.applyOptions({ width: chartContainer.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    onCleanup(() => {
      window.removeEventListener('resize', handleResize);
      if (chart) chart.remove();
    });
  });

  createEffect(() => {
    const tab = activeTab();
    const tf = activeTimeframe();
    const g = showGrowth();
    const eg = showEquityGrowth();
    const b = showBalance();
    const eq = showEquity();
    const pr = showProfit();
    const dd = showDrawdown();
    const rc = showRCurve();
    const cb = showChangeBars();
    const curves = props.curves || [];

    const tabChanged = tab !== lastTab;
    const tfChanged = tf !== lastTimeframe;
    const pillsChanged = 
      g !== lastPillsState.growth ||
      eg !== lastPillsState.equityGrowth ||
      b !== lastPillsState.balance ||
      eq !== lastPillsState.equity ||
      pr !== lastPillsState.profit ||
      dd !== lastPillsState.drawdown ||
      rc !== lastPillsState.rCurve ||
      cb !== lastPillsState.changeBars;

    const curvesChanged = 
      curves.length !== lastCurves.length ||
      (curves.length > 0 && (
        curves[0].timestamp !== lastCurves[0]?.timestamp ||
        curves[curves.length - 1].timestamp !== lastCurves[lastCurves.length - 1]?.timestamp ||
        curves[curves.length - 1].balance !== lastCurves[lastCurves.length - 1]?.balance ||
        curves[curves.length - 1].equity !== lastCurves[lastCurves.length - 1]?.equity
      ));

    // If series already exist and nothing relevant changed (e.g. background 1s tick that didn't modify curves), skip update
    if (!tabChanged && !tfChanged && !pillsChanged && !curvesChanged && seriesList.length > 0) {
      return;
    }

    // Auto-fit ONLY on: tab change, timeframe change, or first time data loads (or account switch)
    const isAccountSwitchOrFirstLoad = 
      curves.length > 0 && (
        lastCurves.length === 0 || 
        curves[0]?.timestamp !== lastCurves[0]?.timestamp
      );
    const shouldFitContent = tabChanged || tfChanged || isAccountSwitchOrFirstLoad;

    // Update state trackers
    lastTab = tab;
    lastTimeframe = tf;
    lastCurves = [...curves];
    lastPillsState = {
      growth: g,
      equityGrowth: eg,
      balance: b,
      equity: eq,
      profit: pr,
      drawdown: dd,
      rCurve: rc,
      changeBars: cb,
    };

    updateChartData(shouldFitContent);
  });

  return (
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-col gap-3">
      
      {/* Top Header Controls: Views & Timeframe */}
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        {/* Chart View Tabs */}
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'growth' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('growth')}
          >
            Growth (%)
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'balance' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('balance')}
          >
            Balance & Equity
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'profit' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('profit')}
          >
            Profit ($)
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'drawdown' ? 'bg-slate-800 text-rose-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('drawdown')}
          >
            Drawdown (%)
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'r' ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30 shadow' : 'text-purple-400/80 hover:text-purple-200'
            }`}
            onClick={() => setActiveTab('r')}
          >
            Van Tharp R-Curve
          </button>
        </div>

        {/* Timeframe Filter Buttons */}
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {['7D', '1M', '3M', 'YTD', '1Y', 'ALL'].map((tf) => (
            <button
              class={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                activeTimeframe() === tf
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => setActiveTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Series Legend Bar (Compact Above Canvas) */}
      <div class="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <div class="flex flex-wrap items-center gap-1.5">
          {/* Toggles for Growth View */}
          <Show when={activeTab() === 'growth'}>
            <button
              onClick={() => setShowGrowth(!showGrowth())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showGrowth()
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showGrowth() ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
              <span>Growth (%)</span>
            </button>

            <button
              onClick={() => setShowEquityGrowth(!showEquityGrowth())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showEquityGrowth()
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showEquityGrowth() ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
              <span>Equity Growth (%)</span>
            </button>

            <button
              onClick={() => setShowChangeBars(!showChangeBars())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showChangeBars()
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class="flex items-end gap-0.5 h-3">
                <span class={`w-1 h-2 rounded-xs ${showChangeBars() ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <span class={`w-1 h-3 rounded-xs ${showChangeBars() ? 'bg-rose-400' : 'bg-slate-600'}`}></span>
              </span>
              <span>Change Bars (%)</span>
            </button>
          </Show>

          {/* Toggles for Balance View */}
          <Show when={activeTab() === 'balance'}>
            <button
              onClick={() => setShowBalance(!showBalance())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showBalance()
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showBalance() ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
              <span>Balance</span>
            </button>

            <button
              onClick={() => setShowEquity(!showEquity())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showEquity()
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showEquity() ? 'bg-amber-400' : 'bg-slate-600'}`}></span>
              <span>Equity</span>
            </button>

            <button
              onClick={() => setShowChangeBars(!showChangeBars())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showChangeBars()
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class="flex items-end gap-0.5 h-3">
                <span class={`w-1 h-2 rounded-xs ${showChangeBars() ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <span class={`w-1 h-3 rounded-xs ${showChangeBars() ? 'bg-rose-400' : 'bg-slate-600'}`}></span>
              </span>
              <span>Profit Change Bars ($)</span>
            </button>
          </Show>

          {/* Toggles for Profit View */}
          <Show when={activeTab() === 'profit'}>
            <button
              onClick={() => setShowProfit(!showProfit())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showProfit()
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showProfit() ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
              <span>Cumulative Profit</span>
            </button>

            <button
              onClick={() => setShowChangeBars(!showChangeBars())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showChangeBars()
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-300 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class="flex items-end gap-0.5 h-3">
                <span class={`w-1 h-2 rounded-xs ${showChangeBars() ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <span class={`w-1 h-3 rounded-xs ${showChangeBars() ? 'bg-rose-400' : 'bg-slate-600'}`}></span>
              </span>
              <span>Trade Profit Bars ($)</span>
            </button>
          </Show>

          {/* Toggles for Drawdown View */}
          <Show when={activeTab() === 'drawdown'}>
            <button
              onClick={() => setShowDrawdown(!showDrawdown())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showDrawdown()
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showDrawdown() ? 'bg-rose-400' : 'bg-slate-600'}`}></span>
              <span>Drawdown (%)</span>
            </button>
          </Show>

          {/* Toggles for Van Tharp R-Curve View */}
          <Show when={activeTab() === 'r'}>
            <button
              onClick={() => setShowRCurve(!showRCurve())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showRCurve()
                  ? 'bg-purple-500/10 border-purple-500/40 text-purple-300 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class={`h-2 w-2 rounded-full ${showRCurve() ? 'bg-purple-400' : 'bg-slate-600'}`}></span>
              <span>Cumulative R</span>
            </button>

            <button
              onClick={() => setShowChangeBars(!showChangeBars())}
              class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                showChangeBars()
                  ? 'bg-purple-500/10 border-purple-500/40 text-purple-300 font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-500 line-through opacity-50'
              }`}
            >
              <span class="flex items-end gap-0.5 h-3">
                <span class={`w-1 h-2 rounded-xs ${showChangeBars() ? 'bg-purple-400' : 'bg-slate-600'}`}></span>
                <span class={`w-1 h-3 rounded-xs ${showChangeBars() ? 'bg-rose-400' : 'bg-slate-600'}`}></span>
              </span>
              <span>R-Multiple Bars</span>
            </button>
          </Show>
        </div>

        <span class="text-[10px] text-slate-500 italic hidden sm:inline">
          Click series pill to toggle
        </span>
      </div>

      {/* Lightweight Chart Canvas Container with Anchored Tooltip */}
      <div class="w-full h-[375px] rounded-xl relative border border-slate-950 shadow-inner">
        <div ref={chartContainer} class="w-full h-full rounded-xl overflow-hidden" />
        
        <Show when={barTooltip()}>
          <div
            class="pointer-events-none absolute z-50 transition-all duration-75 select-none"
            style={{
              left: `${barTooltip()?.x ?? 0}px`,
              top: `${barTooltip()?.y ?? 0}px`,
              transform: barTooltip()?.flipped
                ? 'translate(-50%, 14px)'
                : 'translate(-50%, calc(-100% - 14px))',
            }}
          >
            <div class="relative bg-slate-900/95 border border-slate-700/90 shadow-2xl backdrop-blur-md rounded-xl px-3.5 py-2.5 text-center min-w-[130px] flex flex-col gap-0.5">
              {/* Caret pointing to cursor */}
              <Show when={!barTooltip()?.flipped}>
                <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-r border-b border-slate-700/90 rotate-45" />
              </Show>
              <Show when={barTooltip()?.flipped}>
                <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-l border-t border-slate-700/90 rotate-45" />
              </Show>

              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {barTooltip()?.title}
              </div>
              <div class="text-[11px] font-medium text-slate-300 font-mono">
                {barTooltip()?.dateStr}
              </div>
              <div class={`text-sm font-bold font-mono tracking-tight ${barTooltip()?.valueColor}`}>
                {barTooltip()?.primaryValue}
              </div>
              <Show when={barTooltip()?.secondaryValue}>
                <div class="text-[11px] font-semibold font-mono text-slate-400">
                  {barTooltip()?.secondaryValue}
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};