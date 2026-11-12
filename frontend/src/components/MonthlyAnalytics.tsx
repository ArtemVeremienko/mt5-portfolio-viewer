import { Component, createSignal, For, Show } from 'solid-js';
import { MonthlyAnalyticsItem, MonthlyCurrency, MetricMode } from '../types';
import { SlidersHorizontal, Calendar, PieChart as PieIcon, BarChart2, Clock, Check } from 'lucide-solid';

interface MonthlyAnalyticsProps {
  monthlyAnalytics: MonthlyAnalyticsItem[];
  mode: MetricMode;
}

type MonthlyMetric = 'change' | 'profit' | 'lots' | 'pips';

export const MonthlyAnalytics: Component<MonthlyAnalyticsProps> = (props) => {
  // Available years from data, default to newest
  const years = () => {
    const set = new Set<number>();
    for (const m of (props.monthlyAnalytics || [])) {
      set.add(m.year);
    }
    const arr = Array.from(set).sort((a, b) => b - a);
    return arr.length ? arr : [new Date().getFullYear()];
  };

  const [selectedYear, setSelectedYear] = createSignal<number | null>(null);
  const [metric, setMetric] = createSignal<MonthlyMetric>('change');
  const [showSettingsPopover, setShowSettingsPopover] = createSignal<boolean>(false);

  const activeYear = () => {
    const yr = selectedYear();
    const available = years();
    if (yr !== null && available.includes(yr)) {
      return yr;
    }
    return available[0];
  };

  // Filter months for selected year (chronological Jan -> Dec)
  const yearMonths = () => {
    return (props.monthlyAnalytics || [])
      .filter(m => m.year === activeYear())
      .sort((a, b) => a.month - b.month);
  };

  // Selected month state (default to newest month of that year)
  const [selectedMonthKey, setSelectedMonthKey] = createSignal<string | null>(null);

  const selectedMonth = () => {
    const list = yearMonths();
    if (!list.length) return null;
    const key = selectedMonthKey();
    if (key) {
      const found = list.find(m => `${m.year}-${m.month}` === key);
      if (found) return found;
    }
    // Default to the most recent month with trades in this year
    return list[list.length - 1];
  };

  // Helper to format values for the Monthly Gain chart
  const formatMetricVal = (m: MonthlyAnalyticsItem) => {
    switch (metric()) {
      case 'change':
        return `${m.change_pct >= 0 ? '' : ''}${m.change_pct.toFixed(2)}%`;
      case 'profit':
        return `${m.profit >= 0 ? '$' : '-$'}${Math.abs(m.profit).toFixed(2)}`;
      case 'lots':
        return `${m.lots.toFixed(2)}`;
      case 'pips':
        return `${m.pips >= 0 ? '' : ''}${m.pips.toFixed(1)}`;
    }
  };

  const metricLabel = () => {
    switch (metric()) {
      case 'change': return 'Change';
      case 'profit': return 'Profit';
      case 'lots': return 'Lots';
      case 'pips': return 'Pips';
    }
  };

  // Palette for pie chart & bars
  const sliceColors = ['#c084fc', '#fb7185', '#38bdf8', '#34d399', '#facc15', '#a78bfa'];

  return (
    <div class="space-y-4">
      {/* Header Bar */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-wrap items-center justify-between gap-4 relative z-30">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <Calendar size={20} />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h3 class="text-sm font-bold text-white tracking-wide">Monthly Analytics</h3>
              
              {/* Year Selector Tabs */}
              <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <For each={years()}>
                  {(yr) => (
                    <button
                      onClick={() => {
                        setSelectedYear(yr);
                        setSelectedMonthKey(null);
                      }}
                      class={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        activeYear() === yr
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {yr}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              4-Quadrant performance breakdown: monthly growth, reward-to-risk ratio, currency share, and holding times
            </p>
          </div>
        </div>

        {/* Right Controls: Quick Inline Toggle + Sliders Popover */}
        <div class="flex items-center gap-2">
          {/* Quick Inline Metric Toggle */}
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <For each={['change', 'profit', 'lots', 'pips'] as MonthlyMetric[]}>
              {(m) => (
                <button
                  onClick={() => setMetric(m)}
                  class={`px-2.5 py-1 rounded-lg font-semibold capitalize transition-colors ${
                    metric() === m
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              )}
            </For>
          </div>

          {/* Settings Sliders Icon Button */}
          <div class="relative">
            <button
              onClick={() => setShowSettingsPopover(p => !p)}
              class={`p-2 rounded-xl border transition-colors ${
                showSettingsPopover()
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Metric Options"
            >
              <SlidersHorizontal size={17} />
            </button>

            {/* Floating Radio Popover (Matching Image 1 & 3) */}
            <Show when={showSettingsPopover()}>
              <div class="absolute right-0 top-12 z-50 bg-slate-900/98 border border-slate-700 rounded-2xl p-3 shadow-2xl ring-1 ring-slate-700/50 w-44 space-y-1 backdrop-blur-md animate-in fade-in">
                <div class="text-[10px] uppercase font-bold text-slate-400 px-2 pb-1 border-b border-slate-800">
                  Select Metric
                </div>
                <For each={[
                  { id: 'change', label: 'Change' },
                  { id: 'profit', label: 'Profit' },
                  { id: 'lots', label: 'Lots' },
                  { id: 'pips', label: 'Pips' },
                ] as { id: MonthlyMetric; label: string }[]}>
                  {(opt) => (
                    <button
                      onClick={() => {
                        setMetric(opt.id);
                        setShowSettingsPopover(false);
                      }}
                      class={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        metric() === opt.id
                          ? 'bg-blue-600/20 text-blue-300 font-bold border border-blue-500/30'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <div class="flex items-center gap-2.5">
                        <span class={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          metric() === opt.id ? 'border-blue-400 bg-blue-600' : 'border-slate-600 bg-slate-950'
                        }`}>
                          <Show when={metric() === opt.id}>
                            <span class="w-1.5 h-1.5 rounded-full bg-white" />
                          </Show>
                        </span>
                        <span>{opt.label}</span>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* 4-Quadrant 2x2 Grid */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* ========================================================= */}
        {/* QUADRANT 1: TOP-LEFT (Monthly Gain Bar Chart)             */}
        {/* ========================================================= */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-3 flex flex-col justify-between">
          <div class="text-center border-b border-slate-800/80 pb-2">
            <h4 class="text-xs font-bold text-slate-200 tracking-wide">
              Monthly Gain({metricLabel()})
            </h4>
          </div>

          {(() => {
            const months = yearMonths();
            if (!months.length) {
              return (
                <div class="h-60 flex items-center justify-center text-slate-500 text-xs">
                  No monthly trading records available for {activeYear()}
                </div>
              );
            }

            const values = months.map(m => {
              switch (metric()) {
                case 'change': return Math.abs(m.change_pct);
                case 'profit': return Math.abs(m.profit);
                case 'lots': return m.lots;
                case 'pips': return Math.abs(m.pips);
              }
            });
            const maxVal = Math.max(0.1, ...values);

            return (
              <div class="relative py-2">
                <svg viewBox="0 0 500 240" class="w-full h-60 overflow-visible">
                  {/* Grid Lines */}
                  <For each={[0, 0.33, 0.66, 1.0]}>
                    {(r) => {
                      const y = 190 - (r * 150);
                      const displayVal = r * maxVal;
                      return (
                        <g>
                          <line x1="40" y1={y} x2="480" y2={y} stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                          <text x="32" y={y + 3} text-anchor="end" fill="#64748b" font-size="9" font-family="monospace">
                            {metric() === 'change' ? `${displayVal.toFixed(1)}%` : (metric() === 'profit' ? `$${displayVal.toFixed(1)}` : displayVal.toFixed(1))}
                          </text>
                        </g>
                      );
                    }}
                  </For>
                  <line x1="40" y1="190" x2="480" y2="190" stroke="#334155" stroke-width="1.5" />

                  {/* Monthly Bars */}
                  <For each={months}>
                    {(m, i) => {
                      const count = months.length;
                      const step = 420 / count;
                      const barWidth = Math.min(65, Math.max(36, step * 0.55));
                      const xCenter = 55 + (i() * step) + (step / 2);
                      const x = xCenter - (barWidth / 2);

                      const val = (() => {
                        switch (metric()) {
                          case 'change': return m.change_pct;
                          case 'profit': return m.profit;
                          case 'lots': return m.lots;
                          case 'pips': return m.pips;
                        }
                      })();

                      const barH = (Math.abs(val) / maxVal) * 150;
                      const y = 190 - barH;
                      const isSelected = () => selectedMonth()?.month === m.month && selectedMonth()?.year === m.year;
                      
                      // Colors matching Image 1: Mauve `#c084fc` / Soft Coral `#f472b6`
                      const barColor = i() % 2 === 0 ? '#c084fc' : '#fb7185';

                      return (
                        <g
                          onClick={() => setSelectedMonthKey(`${m.year}-${m.month}`)}
                          class="cursor-pointer group"
                        >
                          {/* Active Month Glow / Outline */}
                          <Show when={isSelected()}>
                            <rect
                              x={x - 4}
                              y={y - 4}
                              width={barWidth + 8}
                              height={barH + 4}
                              fill="none"
                              stroke="#60a5fa"
                              stroke-width="2"
                              rx="6"
                              class="animate-pulse"
                            />
                          </Show>

                          {/* The Bar */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barH}
                            fill={barColor}
                            rx="3"
                            class={`transition-all ${isSelected() ? 'opacity-100 shadow-lg' : 'opacity-85 hover:opacity-100'}`}
                          />

                          {/* Value on Top */}
                          <text
                            x={xCenter}
                            y={y - 6}
                            text-anchor="middle"
                            fill="#ffffff"
                            font-size="10"
                            font-family="monospace"
                            font-weight="bold"
                          >
                            {formatMetricVal(m)}
                          </text>

                          {/* Month Label (Rotated like in Image 1: 'Oct 2026') */}
                          <g transform={`translate(${xCenter}, 205) rotate(-35)`}>
                            <text
                              x="0"
                              y="0"
                              text-anchor="end"
                              fill={isSelected() ? '#60a5fa' : '#94a3b8'}
                              font-size="10"
                              font-family="monospace"
                              font-weight={isSelected() ? 'bold' : 'normal'}
                            >
                              {m.short_name}
                            </text>
                          </g>
                        </g>
                      );
                    }}
                  </For>
                </svg>
              </div>
            );
          })()}
        </div>

        {/* ========================================================= */}
        {/* QUADRANT 2: TOP-RIGHT (Reward : Risk Ratios)              */}
        {/* ========================================================= */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-3 flex flex-col justify-between">
          <div class="text-center border-b border-slate-800/80 pb-2">
            <h4 class="text-xs font-bold text-slate-200 tracking-wide">
              {selectedMonth() ? `Reward : Risk Ratios for ${selectedMonth()?.month_name}.` : 'Reward : Risk Ratios'}
            </h4>
          </div>

          <Show when={selectedMonth()} fallback={
            <div class="h-60 flex items-center justify-center text-slate-500 text-xs italic">
              Please select a month.
            </div>
          }>
            {(() => {
              const currs = selectedMonth()?.currencies || [];
              const maxRatio = Math.max(4.0, ...currs.map(c => c.reward_risk_ratio));

              return (
                <div class="relative py-2">
                  <svg viewBox="0 0 500 240" class="w-full h-60 overflow-visible">
                    {/* Vertical X-axis ticks (0, 1, 2, 3, 4) */}
                    <For each={[0, 1, 2, 3, 4]}>
                      {(tick) => {
                        const x = 90 + ((tick / 4) * 360);
                        return (
                          <g>
                            <line x1={x} y1="20" x2={x} y2="200" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                            <text x={x} y="218" text-anchor="middle" fill="#64748b" font-size="10" font-family="monospace">
                              {tick}
                            </text>
                          </g>
                        );
                      }}
                    </For>
                    <line x1="90" y1="200" x2="470" y2="200" stroke="#334155" stroke-width="1.5" />

                    {/* Horizontal Bars by Currency */}
                    <For each={currs}>
                      {(c, i) => {
                        const barHeight = 36;
                        const y = 35 + (i() * 65);
                        const barW = Math.min(360, (c.reward_risk_ratio / 4.0) * 360);

                        return (
                          <g class="group">
                            {/* Symbol Name on Left */}
                            <text
                              x="80"
                              y={y + (barHeight / 2) + 4}
                              text-anchor="end"
                              fill="#f1f5f9"
                              font-size="11"
                              font-family="monospace"
                              font-weight="bold"
                            >
                              {c.symbol}
                            </text>

                            {/* Steel-blue bar matching Image 2 */}
                            <rect
                              x="90"
                              y={y}
                              width={barW}
                              height={barHeight}
                              fill="#60a5fa"
                              rx="3"
                              class="transition-all hover:fill-[#3b82f6]"
                            />

                            {/* Ratio Value on Right */}
                            <text
                              x={90 + barW + 8}
                              y={y + (barHeight / 2) + 4}
                              text-anchor="start"
                              fill="#ffffff"
                              font-size="11"
                              font-family="monospace"
                              font-weight="bold"
                            >
                              {c.reward_risk_ratio.toFixed(2)}
                              <Show when={c.is_all_wins}>
                                <tspan fill="#34d399" font-size="9" dx="6"> (100% Win)</tspan>
                              </Show>
                            </text>
                          </g>
                        );
                      }}
                    </For>
                  </svg>
                </div>
              );
            })()}
          </Show>
        </div>

        {/* ========================================================= */}
        {/* QUADRANT 3: BOTTOM-LEFT (Currencies Popularity Pie Chart)  */}
        {/* ========================================================= */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-3 flex flex-col justify-between">
          <div class="text-center border-b border-slate-800/80 pb-2">
            <h4 class="text-xs font-bold text-slate-200 tracking-wide">
              {selectedMonth() ? `Currencies popularity for ${selectedMonth()?.month_name}.` : 'Currencies popularity'}
            </h4>
          </div>

          <Show when={selectedMonth()} fallback={
            <div class="h-60 flex items-center justify-center text-slate-500 text-xs italic">
              Please select a month.
            </div>
          }>
            {(() => {
              const currs = selectedMonth()?.currencies || [];
              const cx = 250;
              const cy = 115;
              const radius = 80;

              let cumulativeAngle = 0;

              return (
                <div class="relative py-2">
                  <svg viewBox="0 0 500 240" class="w-full h-60 overflow-visible">
                    <For each={currs}>
                      {(c, i) => {
                        const sliceAngle = (c.popularity_pct / 100) * 2 * Math.PI;
                        const startA = cumulativeAngle;
                        const endA = cumulativeAngle + sliceAngle;
                        cumulativeAngle = endA;

                        const color = sliceColors[i() % sliceColors.length];

                        // If single slice is 100%
                        if (c.popularity_pct >= 99.9) {
                          return (
                            <g class="cursor-pointer">
                              <circle cx={cx} cy={cy} r={radius} fill={color} stroke="#0f172a" stroke-width="2" />
                              <text
                                x={cx}
                                y={cy + 4}
                                text-anchor="middle"
                                fill="#ffffff"
                                font-size="11"
                                font-family="monospace"
                                font-weight="bold"
                              >
                                {c.symbol}: 100%
                              </text>
                            </g>
                          );
                        }

                        // SVG Arc Path
                        const x1 = cx + radius * Math.cos(startA);
                        const y1 = cy + radius * Math.sin(startA);
                        const x2 = cx + radius * Math.cos(endA);
                        const y2 = cy + radius * Math.sin(endA);
                        const largeArc = sliceAngle > Math.PI ? 1 : 0;
                        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                        // Midpoint for label line
                        const midA = startA + (sliceAngle / 2);
                        const labelX = cx + (radius + 25) * Math.cos(midA);
                        const labelY = cy + (radius + 25) * Math.sin(midA);

                        return (
                          <g class="cursor-pointer group">
                            <path
                              d={d}
                              fill={color}
                              stroke="#0f172a"
                              stroke-width="2"
                              class="transition-all hover:opacity-90"
                            />
                            {/* Label matching Image 2: e.g. EURUSD: 25.0% */}
                            <text
                              x={labelX}
                              y={labelY + 4}
                              text-anchor={Math.cos(midA) >= 0 ? 'start' : 'end'}
                              fill="#f8fafc"
                              font-size="10.5"
                              font-family="monospace"
                              font-weight="bold"
                            >
                              {c.symbol}: {c.popularity_pct.toFixed(1)}%
                            </text>
                          </g>
                        );
                      }}
                    </For>
                  </svg>
                </div>
              );
            })()}
          </Show>
        </div>

        {/* ========================================================= */}
        {/* QUADRANT 4: BOTTOM-RIGHT (Average Holding Time Long/Short) */}
        {/* ========================================================= */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-3 flex flex-col justify-between">
          <div class="text-center border-b border-slate-800/80 pb-2">
            <h4 class="text-xs font-bold text-slate-200 tracking-wide">
              {selectedMonth() ? `Average holding time for ${selectedMonth()?.month_name}.` : 'Average holding time'}
            </h4>
          </div>

          <Show when={selectedMonth()} fallback={
            <div class="h-60 flex items-center justify-center text-slate-500 text-xs italic">
              Please select a month.
            </div>
          }>
            {(() => {
              const currs = selectedMonth()?.currencies || [];
              const maxMinutes = Math.max(16.67, ...currs.map(c => (c.avg_long_duration_sec + c.avg_short_duration_sec) / 60));

              return (
                <div class="relative py-2">
                  <svg viewBox="0 0 500 240" class="w-full h-60 overflow-visible">
                    {/* Time scale ticks matching Image 2: 0sec, 3.33min, 6.67min, 10min, 13.33min, 16.67min */}
                    <For each={[0, 0.2, 0.4, 0.6, 0.8, 1.0]}>
                      {(ratio) => {
                        const x = 90 + (ratio * 360);
                        const mins = ratio * maxMinutes;
                        const label = mins === 0 ? '0sec' : `${mins.toFixed(2)}min`;
                        return (
                          <g>
                            <line x1={x} y1="20" x2={x} y2="180" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                            <text x={x} y="196" text-anchor="middle" fill="#64748b" font-size="9" font-family="monospace">
                              {label}
                            </text>
                          </g>
                        );
                      }}
                    </For>
                    <line x1="90" y1="180" x2="470" y2="180" stroke="#334155" stroke-width="1.5" />

                    {/* Stacked Horizontal Bars by Currency */}
                    <For each={currs}>
                      {(c, i) => {
                        const barHeight = 32;
                        const y = 35 + (i() * 60);

                        const longMinutes = c.avg_long_duration_sec / 60;
                        const shortMinutes = c.avg_short_duration_sec / 60;

                        const longW = Math.min(360, (longMinutes / maxMinutes) * 360);
                        const shortW = Math.min(360 - longW, (shortMinutes / maxMinutes) * 360);

                        return (
                          <g class="group">
                            {/* Symbol Name */}
                            <text
                              x="80"
                              y={y + (barHeight / 2) + 4}
                              text-anchor="end"
                              fill="#f1f5f9"
                              font-size="11"
                              font-family="monospace"
                              font-weight="bold"
                            >
                              {c.symbol}
                            </text>

                            {/* Long Segment (Green) */}
                            <Show when={longW > 0}>
                              <rect
                                x="90"
                                y={y}
                                width={longW}
                                height={barHeight}
                                fill="#10b981"
                                rx={shortW > 0 ? 0 : 3}
                                class="transition-all hover:opacity-90"
                              >
                                <title>{`${c.symbol} Long Avg: ${c.avg_long_duration_str}`}</title>
                              </rect>
                            </Show>

                            {/* Short Segment (Coral/Red) */}
                            <Show when={shortW > 0}>
                              <rect
                                x={90 + longW}
                                y={y}
                                width={shortW}
                                height={barHeight}
                                fill="#f43f5e"
                                rx={longW > 0 ? 0 : 3}
                                class="transition-all hover:opacity-90"
                              >
                                <title>{`${c.symbol} Short Avg: ${c.avg_short_duration_str}`}</title>
                              </rect>
                            </Show>
                          </g>
                        );
                      }}
                    </For>
                  </svg>

                  {/* Legend matching Image 2 */}
                  <div class="flex items-center justify-center gap-8 pt-3 border-t border-slate-800/80 text-xs font-semibold">
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full bg-[#10b981] inline-block shadow-sm shadow-emerald-500/30" />
                      <span class="text-slate-300">Long</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full bg-[#f43f5e] inline-block shadow-sm shadow-rose-500/30" />
                      <span class="text-slate-300">Short</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </Show>
        </div>

      </div>
    </div>
  );
};
