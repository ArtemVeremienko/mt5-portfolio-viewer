import { Component, createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import { createChart, IChartApi, ISeriesApi, AreaSeries, LineSeries, ColorType } from 'lightweight-charts';
import { CurvePoint, MetricMode } from '../types';

interface PerformanceChartProps {
  curves: CurvePoint[];
  mode: MetricMode;
}

type ChartTab = 'growth' | 'balance' | 'profit' | 'drawdown' | 'r';

export const PerformanceChart: Component<PerformanceChartProps> = (props) => {
  let chartContainer: HTMLDivElement | undefined;
  let chart: IChartApi | null = null;
  let primarySeries: ISeriesApi<any> | null = null;
  let secondarySeries: ISeriesApi<any> | null = null;

  const [activeTab, setActiveTab] = createSignal<ChartTab>('growth');
  const [activeTimeframe, setActiveTimeframe] = createSignal<string>('ALL');

  // Sync tab with global mode if user changes mode
  createEffect(() => {
    if (props.mode === 'r') {
      setActiveTab('r');
    } else if (props.mode === 'pct') {
      if (activeTab() === 'r' || activeTab() === 'balance' || activeTab() === 'profit') {
        setActiveTab('growth');
      }
    } else if (props.mode === 'currency') {
      if (activeTab() === 'r' || activeTab() === 'growth') {
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
      rightPriceScale: {
        borderColor: '#1e293b',
        autoScale: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    updateChartData();
  };

  const updateChartData = () => {
    if (!chart || !props.curves || props.curves.length === 0) return;

    if (primarySeries) {
      chart.removeSeries(primarySeries);
      primarySeries = null;
    }
    if (secondarySeries) {
      chart.removeSeries(secondarySeries);
      secondarySeries = null;
    }

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

    const tab = activeTab();

    if (tab === 'growth') {
      primarySeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(16, 185, 129, 0.4)',
        bottomColor: 'rgba(16, 185, 129, 0.0)',
        lineColor: '#10b981',
        lineWidth: 2,
        priceFormat: { type: 'percent' },
      });
      primarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.growth_pct })));
    } else if (tab === 'balance') {
      // Balance Curve
      primarySeries = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
        title: 'Balance',
      });
      primarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.balance })));

      // Equity Curve
      secondarySeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        title: 'Equity',
      });
      secondarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.equity })));
    } else if (tab === 'profit') {
      primarySeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(59, 130, 246, 0.35)',
        bottomColor: 'rgba(59, 130, 246, 0.0)',
        lineColor: '#3b82f6',
        lineWidth: 2,
      });
      primarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.profit })));
    } else if (tab === 'drawdown') {
      primarySeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(239, 68, 68, 0.0)',
        bottomColor: 'rgba(239, 68, 68, 0.4)',
        lineColor: '#ef4444',
        lineWidth: 2,
        invertFilledArea: true,
        priceFormat: { type: 'percent' },
      });
      primarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: -Math.abs(d.drawdown_pct) })));
    } else if (tab === 'r') {
      primarySeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(168, 85, 247, 0.4)',
        bottomColor: 'rgba(168, 85, 247, 0.0)',
        lineColor: '#a855f7',
        lineWidth: 2,
      });
      primarySeries.setData(sortedData.map(d => ({ time: d.timestamp as any, value: d.cumulative_r })));
    }

    chart.timeScale().fitContent();
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
    activeTab();
    activeTimeframe();
    props.curves;
    updateChartData();
  });

  return (
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-col gap-3">
      
      {/* Top Header Controls */}
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        {/* Chart View Tabs */}
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            class={`px-3 py-1.2 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'growth' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('growth')}
          >
            Growth (%)
          </button>
          <button
            class={`px-3 py-1.2 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'balance' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('balance')}
          >
            Balance & Equity
          </button>
          <button
            class={`px-3 py-1.2 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'profit' ? 'bg-slate-800 text-blue-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('profit')}
          >
            Profit ($)
          </button>
          <button
            class={`px-3 py-1.2 rounded-lg text-xs font-semibold transition-all ${
              activeTab() === 'drawdown' ? 'bg-slate-800 text-rose-400 shadow' : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('drawdown')}
          >
            Drawdown (%)
          </button>
          <button
            class={`px-3 py-1.2 rounded-lg text-xs font-semibold transition-all ${
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

      {/* Lightweight Chart Canvas Container */}
      <div 
        ref={chartContainer} 
        class="w-full h-[360px] rounded-xl overflow-hidden relative border border-slate-950 shadow-inner"
      />

    </div>
  );
};
