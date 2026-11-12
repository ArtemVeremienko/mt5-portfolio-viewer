import { Component, createSignal, For, Show } from 'solid-js';
import { ExcursionStats, ExcursionTrade, MetricMode } from '../types';
import { 
  Activity, 
  ShieldAlert, 
  TrendingUp, 
  Target, 
  Crosshair, 
  Zap, 
  AlertTriangle,
  Layers,
  Sparkles
} from 'lucide-solid';

interface ExcursionPanelProps {
  excursionStats: ExcursionStats | null;
  mode: MetricMode;
}

type ExcursionView = 'dual' | 'quality_matrix';

export const ExcursionPanel: Component<ExcursionPanelProps> = (props) => {
  const [unitMode, setUnitMode] = createSignal<'auto' | 'pips'>('auto');
  const [activeView, setActiveView] = createSignal<ExcursionView>('dual');
  const [hoveredTrade, setHoveredTrade] = createSignal<ExcursionTrade | null>(null);
  const [mousePos, setMousePos] = createSignal<{ x: number; y: number; placeBelow: boolean }>({ x: 0, y: 0, placeBelow: false });

  let leaveTimer: any = null;

  const handlePointEnter = (e: MouseEvent, t: ExcursionTrade) => {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    const target = e.currentTarget as SVGElement;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top;

    // Viewport-relative coordinates for position: fixed (no scroll offsets)
    const clampedX = Math.max(140, Math.min(window.innerWidth - 140, centerX));
    const placeBelow = centerY < 170;
    const clampedY = placeBelow ? (rect.bottom + 12) : (centerY - 12);

    setMousePos({ x: clampedX, y: clampedY, placeBelow });
    setHoveredTrade(t);
  };

  const handlePointLeave = () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      setHoveredTrade(null);
    }, 80);
  };

  const stats = () => props.excursionStats;
  const trades = () => props.excursionStats?.trades || [];

  const isRMode = () => unitMode() === 'auto' && props.mode === 'r';
  const isPipsMode = () => unitMode() === 'pips';

  // Local date/time formatting helpers
  const formatFullDateTime = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const formatShortDateTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Value formatters
  const formatExcursion = (pips: number, amt: number, r: number) => {
    if (isPipsMode()) return `${pips.toFixed(1)} pips`;
    if (isRMode()) return `${r.toFixed(2)}R`;
    return `$${amt.toFixed(2)}`;
  };

  const formatReturn = (t: ExcursionTrade) => {
    if (isRMode()) {
      return (t.r_multiple > 0 ? '+' : '') + t.r_multiple.toFixed(2) + 'R';
    }
    return (t.net_profit >= 0 ? '+$' : '-$') + Math.abs(t.net_profit).toFixed(2);
  };

  const getTradeValues = (t: ExcursionTrade) => {
    let mae = t.mae_amount;
    let mfe = t.mfe_amount;
    let ret = t.net_profit;

    if (isPipsMode()) {
      mae = t.mae_pips;
      mfe = t.mfe_pips;
      ret = t.net_profit;
    } else if (isRMode()) {
      mae = t.mae_r;
      mfe = t.mfe_r;
      ret = t.r_multiple;
    }
    return { mae, mfe, ret };
  };

  // Format axis tick numbers smartly based on data scale
  const formatAxisNum = (val: number) => {
    const abs = Math.abs(val);
    if (abs === 0) return '0';
    if (abs < 0.05) return val.toFixed(3);
    if (abs < 1.0) return val.toFixed(2);
    if (abs < 10.0) return val.toFixed(1);
    return val.toFixed(0);
  };

  // Bounds for Chart 1 (MAE vs Return) - Auto-fits cleanly to true data range
  const maeChartBounds = () => {
    const list = trades();
    if (!list.length) return { maxMae: 1.0, minRet: -1.0, maxRet: 1.0 };
    let maxMae = 0.001;
    let maxRet = 0.001;
    let minRet = -0.001;

    for (const t of list) {
      const { mae, ret } = getTradeValues(t);
      if (mae > maxMae) maxMae = mae;
      if (ret > maxRet) maxRet = ret;
      if (ret < minRet) minRet = ret;
    }

    // 10% breathing room padding
    const paddingMae = Math.max(0.005, maxMae * 0.10);
    const finalMaxMae = Math.max(0.01, maxMae + paddingMae);

    const paddingRet = Math.max(0.005, (maxRet - minRet) * 0.10);
    const finalMaxRet = maxRet + paddingRet;
    const finalMinRet = minRet - paddingRet;

    return {
      maxMae: finalMaxMae,
      minRet: finalMinRet,
      maxRet: finalMaxRet,
    };
  };

  // Bounds for Chart 2 (MFE vs Return) - Auto-fits cleanly to true data range
  const mfeChartBounds = () => {
    const list = trades();
    if (!list.length) return { maxMfe: 1.0, minRet: -1.0, maxRet: 1.0 };
    let maxMfe = 0.001;
    let maxRet = 0.001;
    let minRet = -0.001;

    for (const t of list) {
      const { mfe, ret } = getTradeValues(t);
      if (mfe > maxMfe) maxMfe = mfe;
      if (ret > maxRet) maxRet = ret;
      if (ret < minRet) minRet = ret;
    }

    const paddingMfe = Math.max(0.005, maxMfe * 0.10);
    const finalMaxMfe = Math.max(0.01, maxMfe + paddingMfe);

    const paddingRet = Math.max(0.005, (maxRet - minRet) * 0.10);
    const finalMaxRet = maxRet + paddingRet;
    const finalMinRet = minRet - paddingRet;

    return {
      maxMfe: finalMaxMfe,
      minRet: finalMinRet,
      maxRet: finalMaxRet,
    };
  };

  // Bounds for Chart 3 (MFE vs MAE Quality Matrix) - Auto-fits independently on X and Y
  const qualityMatrixBounds = () => {
    const list = trades();
    if (!list.length) return { maxMae: 1.0, maxMfe: 1.0, midMae: 0.5, midMfe: 0.5 };
    let maxMae = 0.001;
    let maxMfe = 0.001;
    let sumMae = 0;
    let sumMfe = 0;

    for (const t of list) {
      const { mae, mfe } = getTradeValues(t);
      if (mae > maxMae) maxMae = mae;
      if (mfe > maxMfe) maxMfe = mfe;
      sumMae += mae;
      sumMfe += mfe;
    }

    const finalMaxMae = Math.max(0.01, maxMae * 1.15);
    const finalMaxMfe = Math.max(0.01, maxMfe * 1.15);
    const midMae = sumMae / Math.max(1, list.length);
    const midMfe = sumMfe / Math.max(1, list.length);

    return { maxMae: finalMaxMae, maxMfe: finalMaxMfe, midMae, midMfe };
  };

  // Quadrant Metrics for Trade Quality Matrix
  const qualityMetrics = () => {
    const list = trades();
    if (!list.length) {
      return {
        payoffRatio: 0,
        favorablePct: 0,
        sniperPct: 0,
        toxicPct: 0,
        sniperCount: 0,
        toxicCount: 0,
        rollerCount: 0,
        scratchCount: 0,
      };
    }

    const { midMae, midMfe } = qualityMatrixBounds();
    let favorableCount = 0;
    let sniperCount = 0;
    let toxicCount = 0;
    let rollerCount = 0;
    let scratchCount = 0;
    let totalMae = 0;
    let totalMfe = 0;

    for (const t of list) {
      const { mae, mfe } = getTradeValues(t);
      totalMae += mae;
      totalMfe += mfe;

      if (mfe > mae) favorableCount++;

      // Quadrants based on strategy median/average
      if (mae <= midMae && mfe >= midMfe) sniperCount++;
      else if (mae > midMae && mfe < midMfe) toxicCount++;
      else if (mae > midMae && mfe >= midMfe) rollerCount++;
      else scratchCount++;
    }

    const payoffRatio = totalMae > 0 ? (totalMfe / totalMae) : 1.0;
    const total = list.length;

    return {
      payoffRatio: Number(payoffRatio.toFixed(2)),
      favorablePct: Number(((favorableCount / total) * 100).toFixed(1)),
      sniperPct: Number(((sniperCount / total) * 100).toFixed(1)),
      toxicPct: Number(((toxicCount / total) * 100).toFixed(1)),
      sniperCount,
      toxicCount,
      rollerCount,
      scratchCount,
    };
  };

  return (
    <div class="space-y-5">
      
      {/* Top Header & View / Unit Selectors */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Activity size={18} />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                Trade Excursion Analytics & Quality Matrix
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  MAE & MFE Suite
                </span>
              </h3>
              <p class="text-xs text-slate-400">
                Measure intra-trade drawdowns (MAE), peak gains (MFE), and assess entry timing quality.
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher & Unit Toggles */}
        <div class="flex flex-wrap items-center gap-2">
          {/* Chart View Toggle */}
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeView() === 'dual'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setActiveView('dual')}
            >
              <Layers size={13} />
              <span>Dual Excursions vs. Return</span>
            </button>
            <button
              class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeView() === 'quality_matrix'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-purple-300 hover:text-white'
              }`}
              onClick={() => setActiveView('quality_matrix')}
            >
              <Crosshair size={13} />
              <span>Trade Quality Matrix (MFE vs MAE)</span>
            </button>
          </div>

          {/* Unit Toggle */}
          <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              class={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                unitMode() === 'auto'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setUnitMode('auto')}
            >
              Mode Sync ({props.mode === 'r' ? 'R' : '$'})
            </button>
            <button
              class={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                unitMode() === 'pips'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setUnitMode('pips')}
            >
              Pips
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic 4 Quantitative Insight Cards */}
      <Show when={activeView() === 'dual'} fallback={
        /* Scorecards for Trade Quality Matrix */
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div class="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-purple-300 font-semibold mb-1">
                <span class="uppercase tracking-wider">Potential Payoff Ratio</span>
                <Sparkles size={15} />
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {qualityMetrics().payoffRatio}x
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Average MFE divided by Average MAE. Measures natural upside asymmetry during open trades.
            </p>
          </div>

          <div class="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Favorable Asymmetry Rate</span>
                <TrendingUp size={15} />
              </div>
              <div class="text-2xl font-black text-emerald-400 mt-1">
                {qualityMetrics().favorablePct}%
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Percentage of trades where peak upside exceeded adverse drawdown (MFE &gt; MAE).
            </p>
          </div>

          <div class="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-cyan-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Clean Entry Rate (Sniper)</span>
                <Crosshair size={15} />
              </div>
              <div class="text-2xl font-black text-cyan-400 mt-1">
                {qualityMetrics().sniperPct}%
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Trades landing in the High MFE / Low MAE quadrant ({qualityMetrics().sniperCount} trades).
            </p>
          </div>

          <div class="bg-slate-900/90 border border-rose-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-rose-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Toxic Trade Rate (Bleeders)</span>
                <AlertTriangle size={15} />
              </div>
              <div class="text-2xl font-black text-rose-400 mt-1">
                {qualityMetrics().toxicPct}%
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Trades with deep drawdowns and minimal upside potential ({qualityMetrics().toxicCount} trades).
            </p>
          </div>

        </div>
      }>
        {/* Scorecards for Standard Dual Plots */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div class="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-emerald-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Optimal SL Cutoff</span>
                <ShieldAlert size={15} />
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {formatExcursion(
                  stats()?.optimal_sl_pips || 0,
                  stats()?.optimal_sl_amount || 0,
                  stats()?.optimal_sl_r || 0
                )}
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              90% of your winning trades never suffered a deeper drawdown than this.
            </p>
          </div>

          <div class="bg-slate-900/90 border border-blue-500/30 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-blue-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">MFE Capture Efficiency</span>
                <Target size={15} />
              </div>
              <div class="text-2xl font-black text-white mt-1">
                {stats()?.mfe_capture_efficiency_pct?.toFixed(1) || '0.0'}%
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Average % of maximum available profit locked in before close on winning trades.
            </p>
          </div>

          <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Average MAE (Drawdown)</span>
                <Activity size={15} />
              </div>
              <div class="text-2xl font-black text-rose-400 mt-1">
                {formatExcursion(
                  stats()?.avg_mae_pips || 0,
                  stats()?.avg_mae_amount || 0,
                  stats()?.avg_mae_r || 0
                )}
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Average intra-trade drawdown experienced across all {trades().length} trades.
            </p>
          </div>

          <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-xs text-slate-400 font-semibold mb-1">
                <span class="uppercase tracking-wider">Average MFE (Peak Profit)</span>
                <TrendingUp size={15} />
              </div>
              <div class="text-2xl font-black text-cyan-400 mt-1">
                {formatExcursion(
                  stats()?.avg_mfe_pips || 0,
                  stats()?.avg_mfe_amount || 0,
                  stats()?.avg_mfe_r || 0
                )}
              </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-2">
              Average peak potential profit floating before trade closure.
            </p>
          </div>

        </div>
      </Show>

      {/* Chart Views */}
      <Show when={activeView() === 'dual'} fallback={
        /* Trade Quality Matrix (MFE vs MAE) Full-Width View */
        <div class="bg-slate-900/90 border border-purple-500/20 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div>
              <h4 class="text-sm font-bold text-white flex items-center gap-2">
                Trade Quality Matrix: MFE vs. MAE
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Entry Quality & Asymmetry Map
                </span>
              </h4>
              <p class="text-xs text-slate-400">
                X-Axis: Intra-trade Drawdown (MAE) • Y-Axis: Peak Potential Profit (MFE)
              </p>
            </div>
            <div class="flex items-center gap-3 text-xs">
              <span class="flex items-center gap-1.5 text-purple-300 font-mono text-[11px]">
                <span class="h-2 w-2 rounded-full bg-purple-400"></span> Diagonal: MFE = MAE (1:1 Ratio)
              </span>
            </div>
          </div>

          {/* Full-width SVG Quadrant Map */}
          <div class="w-full h-96 bg-slate-950 rounded-xl relative border border-slate-800 p-4 select-none">
            {(() => {
              const b = qualityMatrixBounds();
              const q = qualityMetrics();
              const w = 800;
              const h = 340;
              const padLeft = 55;
              const padBottom = 35;
              const plotW = w - padLeft - 25;
              const plotH = h - padBottom - 20;

              // Mid divider coordinates
              const midX = padLeft + (b.midMae / b.maxMae) * plotW;
              const midY = 20 + plotH * (1 - (b.midMfe / b.maxMfe));

              // Diagonal 1:1 line endpoints (MFE = MAE)
              const diagVal = Math.min(b.maxMae, b.maxMfe);
              const diagX2 = padLeft + (diagVal / b.maxMae) * plotW;
              const diagY2 = 20 + plotH * (1 - (diagVal / b.maxMfe));

              return (
                <svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full overflow-visible">
                  {/* Quadrant Background Tints */}
                  {/* Top-Left: Clean / Sniper */}
                  <rect x={padLeft} y="20" width={midX - padLeft} height={midY - 20} fill="#10b981" fill-opacity="0.04" />
                  {/* Top-Right: Rollercoaster */}
                  <rect x={midX} y="20" width={padLeft + plotW - midX} height={midY - 20} fill="#3b82f6" fill-opacity="0.04" />
                  {/* Bottom-Left: Scratch / Stalled */}
                  <rect x={padLeft} y={midY} width={midX - padLeft} height={20 + plotH - midY} fill="#64748b" fill-opacity="0.04" />
                  {/* Bottom-Right: Toxic / Bleeders */}
                  <rect x={midX} y={midY} width={padLeft + plotW - midX} height={20 + plotH - midY} fill="#f43f5e" fill-opacity="0.05" />

                  {/* Non-overlapping Quadrant Badges */}
                  <g>
                    {/* Top-Left Badge: Clean / Sniper */}
                    <g opacity="0.9">
                      <rect x={padLeft + 10} y="26" width="160" height="30" rx="6" fill="#0b1120" fill-opacity="0.85" stroke="#10b981" stroke-opacity="0.35" stroke-width="1" />
                      <text x={padLeft + 18} y="40" fill="#10b981" font-size="10" font-weight="bold">CLEAN / SNIPER ({q.sniperPct}%)</text>
                      <text x={padLeft + 18} y="50" fill="#6ee7b7" font-size="8">Low Drawdown, High Profit</text>
                    </g>

                    {/* Top-Right Badge: Rollercoaster */}
                    <g opacity="0.9">
                      <rect x={padLeft + plotW - 170} y="26" width="165" height="30" rx="6" fill="#0b1120" fill-opacity="0.85" stroke="#3b82f6" stroke-opacity="0.35" stroke-width="1" />
                      <text x={padLeft + plotW - 162} y="40" fill="#60a5fa" font-size="10" font-weight="bold">ROLLERCOASTER ({((q.rollerCount / Math.max(1, trades().length)) * 100).toFixed(1)}%)</text>
                      <text x={padLeft + plotW - 162} y="50" fill="#93c5fd" font-size="8">High Drawdown, High Gain</text>
                    </g>

                    {/* Bottom-Left Badge: Scratch / Noise */}
                    <g opacity="0.9">
                      <rect x={padLeft + 10} y={20 + plotH - 34} width="160" height="24" rx="6" fill="#0b1120" fill-opacity="0.85" stroke="#64748b" stroke-opacity="0.35" stroke-width="1" />
                      <text x={padLeft + 18} y={20 + plotH - 18} fill="#94a3b8" font-size="10" font-weight="bold">SCRATCH / NOISE ({((q.scratchCount / Math.max(1, trades().length)) * 100).toFixed(1)}%)</text>
                    </g>

                    {/* Bottom-Right Badge: Toxic / Bleeders */}
                    <g opacity="0.9">
                      <rect x={padLeft + plotW - 170} y={20 + plotH - 34} width="165" height="24" rx="6" fill="#0b1120" fill-opacity="0.85" stroke="#f43f5e" stroke-opacity="0.35" stroke-width="1" />
                      <text x={padLeft + plotW - 162} y={20 + plotH - 18} fill="#f43f5e" font-size="10" font-weight="bold">TOXIC / BLEEDERS ({q.toxicPct}%)</text>
                    </g>
                  </g>

                  {/* 1:1 Diagonal Line (MFE = MAE) */}
                  <line x1={padLeft} y1={20 + plotH} x2={diagX2} y2={diagY2} stroke="#c084fc" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.8" />
                  <text
                    x={diagX2 - 8}
                    y={Math.max(30, diagY2 - 8)}
                    fill="#c084fc"
                    font-size="9"
                    font-family="monospace"
                    text-anchor="end"
                  >
                    y = x (1:1 Ratio)
                  </text>

                  {/* Dynamic Average Dividers */}
                  <line x1={midX} y1="20" x2={midX} y2={20 + plotH} stroke="#475569" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" />
                  <line x1={padLeft} y1={midY} x2={padLeft + plotW} y2={midY} stroke="#475569" stroke-width="1" stroke-dasharray="2 2" opacity="0.6" />

                  {/* Axes */}
                  <line x1={padLeft} y1="20" x2={padLeft} y2={20 + plotH} stroke="#334155" stroke-width="1.5" />
                  <line x1={padLeft} y1={20 + plotH} x2={padLeft + plotW} y2={20 + plotH} stroke="#334155" stroke-width="1.5" />

                  {/* Scatter Circles */}
                  <For each={trades()}>
                    {(t) => {
                      const { mae, mfe } = getTradeValues(t);
                      const cx = padLeft + (mae / b.maxMae) * plotW;
                      const cy = 20 + plotH * (1 - (mfe / b.maxMfe));
                      const isFavorable = mfe >= mae;
                      const isHovered = () => hoveredTrade()?.ticket === t.ticket;

                      return (
                        <g
                          class="cursor-pointer"
                          onMouseEnter={(e) => handlePointEnter(e, t)}
                          onMouseLeave={handlePointLeave}
                        >
                          {/* Invisible expanded hit target to prevent micro-flicker */}
                          <circle cx={cx} cy={cy} r="12" fill="transparent" />
                          {/* Visible dot */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered() ? 7 : 5}
                            fill={isFavorable ? '#10b981' : '#f43f5e'}
                            fill-opacity={isHovered() ? 1.0 : 0.85}
                            stroke={isHovered() ? '#ffffff' : (isFavorable ? '#059669' : '#e11d48')}
                            stroke-width={isHovered() ? 2.5 : 1.5}
                            class="transition-colors duration-150"
                          />
                        </g>
                      );
                    }}
                  </For>

                  {/* Axis Labels */}
                  <text x={padLeft} y={20 + plotH + 20} fill="#64748b" font-size="10">0</text>
                  <text x={padLeft + plotW} y={20 + plotH + 20} fill="#64748b" font-size="10" text-anchor="end">
                    {formatAxisNum(b.maxMae)} {isPipsMode() ? 'pips' : (isRMode() ? 'R' : '$')} (MAE Drawdown)
                  </text>
                  <text x={padLeft - 10} y="25" fill="#64748b" font-size="10" text-anchor="end">
                    {formatAxisNum(b.maxMfe)}
                  </text>
                  <text x={padLeft - 10} y={20 + plotH} fill="#64748b" font-size="10" text-anchor="end">
                    0 (MFE)
                  </text>
                </svg>
              );
            })()}
          </div>
        </div>
      }>
        {/* Standard Dual Scatter Plots Grid */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          
          {/* Plot 1: MAE vs Realized Return */}
          <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div>
                <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  MAE vs. Realized Return (Stop Loss Analysis)
                </h4>
                <p class="text-[11px] text-slate-400">X: Max Drawdown (MAE) • Y: Realized Return</p>
              </div>
              <div class="flex items-center gap-2 text-[10px]">
                <span class="flex items-center gap-1 text-emerald-400"><span class="h-2 w-2 rounded-full bg-emerald-400"></span> Winner</span>
                <span class="flex items-center gap-1 text-rose-400"><span class="h-2 w-2 rounded-full bg-rose-400"></span> Loser</span>
              </div>
            </div>

            <div class="w-full h-80 bg-slate-950 rounded-xl relative border border-slate-800 p-4 select-none">
              {(() => {
                const b = maeChartBounds();
                const w = 480;
                const h = 260;
                const padLeft = 45;
                const padBottom = 30;
                const plotW = w - padLeft - 25;
                const plotH = h - padBottom - 15;

                const zeroY = 15 + plotH * (b.maxRet / (b.maxRet - b.minRet));
                const optSLVal = isPipsMode()
                  ? (stats()?.optimal_sl_pips || 0)
                  : (isRMode() ? (stats()?.optimal_sl_r || 0) : (stats()?.optimal_sl_amount || 0));
                const optSLX = padLeft + (optSLVal / b.maxMae) * plotW;
                const slLabelAnchor = optSLX > (padLeft + plotW - 85) ? 'end' : 'start';
                const slLabelX = optSLX > (padLeft + plotW - 85) ? optSLX - 5 : optSLX + 4;

                return (
                  <svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full overflow-visible">
                    <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3" />
                    <line x1={padLeft} y1="15" x2={padLeft} y2={15 + plotH} stroke="#334155" stroke-width="1" />
                    <line x1={padLeft} y1={15 + plotH} x2={padLeft + plotW} y2={15 + plotH} stroke="#334155" stroke-width="1" />

                    {optSLVal > 0 && optSLX <= padLeft + plotW && (
                      <g>
                        <line x1={optSLX} y1="15" x2={optSLX} y2={15 + plotH} stroke="#10b981" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7" />
                        <text
                          x={slLabelX}
                          y="25"
                          fill="#10b981"
                          font-size="9"
                          font-family="monospace"
                          text-anchor={slLabelAnchor}
                        >
                          90% SL Cutoff
                        </text>
                      </g>
                    )}

                    <For each={trades()}>
                      {(t) => {
                        const { mae, ret } = getTradeValues(t);
                        const cx = padLeft + (mae / b.maxMae) * plotW;
                        const cy = 15 + plotH * ((b.maxRet - ret) / (b.maxRet - b.minRet));
                        const isWin = ret >= 0;
                        const isHovered = () => hoveredTrade()?.ticket === t.ticket;

                        return (
                          <g
                            class="cursor-pointer"
                            onMouseEnter={(e) => handlePointEnter(e, t)}
                            onMouseLeave={handlePointLeave}
                          >
                            <circle cx={cx} cy={cy} r="12" fill="transparent" />
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered() ? 6.5 : 4.5}
                              fill={isWin ? '#10b981' : '#f43f5e'}
                              fill-opacity={isHovered() ? 1.0 : 0.85}
                              stroke={isHovered() ? '#ffffff' : (isWin ? '#059669' : '#e11d48')}
                              stroke-width={isHovered() ? 2.5 : 1.5}
                              class="transition-colors duration-150"
                            />
                          </g>
                        );
                      }}
                    </For>

                    <text x={padLeft} y={15 + plotH + 20} fill="#64748b" font-size="10">0</text>
                    <text x={padLeft + plotW} y={15 + plotH + 20} fill="#64748b" font-size="10" text-anchor="end">
                      {formatAxisNum(b.maxMae)} {isPipsMode() ? 'pips' : (isRMode() ? 'R' : '$')} (MAE)
                    </text>
                    <text x={padLeft - 8} y="20" fill="#64748b" font-size="10" text-anchor="end">
                      +{formatAxisNum(b.maxRet)}
                    </text>
                    <text x={padLeft - 8} y={15 + plotH} fill="#64748b" font-size="10" text-anchor="end">
                      {formatAxisNum(b.minRet)}
                    </text>
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* Plot 2: MFE vs Realized Return */}
          <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div>
                <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  MFE vs. Realized Return (Exit & Target Efficiency)
                </h4>
                <p class="text-[11px] text-slate-400">X: Max Potential Profit (MFE) • Y: Realized Return</p>
              </div>
              <span class="text-[10px] text-slate-400 font-mono">Diagonal: 100% Exit Efficiency</span>
            </div>

            <div class="w-full h-80 bg-slate-950 rounded-xl relative border border-slate-800 p-4 select-none">
              {(() => {
                const b = mfeChartBounds();
                const w = 480;
                const h = 260;
                const padLeft = 45;
                const padBottom = 30;
                const plotW = w - padLeft - 25;
                const plotH = h - padBottom - 15;

                const zeroY = 15 + plotH * (b.maxRet / (b.maxRet - b.minRet));

                return (
                  <svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full overflow-visible">
                    <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3" />
                    <line x1={padLeft} y1="15" x2={padLeft} y2={15 + plotH} stroke="#334155" stroke-width="1" />
                    <line x1={padLeft} y1={15 + plotH} x2={padLeft + plotW} y2={15 + plotH} stroke="#334155" stroke-width="1" />

                    {(() => {
                      const maxDiag = Math.min(b.maxMfe, b.maxRet);
                      const x2 = padLeft + (maxDiag / b.maxMfe) * plotW;
                      const y2 = 15 + plotH * ((b.maxRet - maxDiag) / (b.maxRet - b.minRet));
                      const labelX = x2 - 8;
                      const labelY = Math.max(26, y2 - 6);
                      return (
                        <g>
                          <line x1={padLeft} y1={zeroY} x2={x2} y2={y2} stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
                          <text
                            x={labelX}
                            y={labelY}
                            fill="#38bdf8"
                            font-size="9"
                            font-family="monospace"
                            text-anchor="end"
                          >
                            y = x (Perfect Exit)
                          </text>
                        </g>
                      );
                    })()}

                    <For each={trades()}>
                      {(t) => {
                        const { mfe, ret } = getTradeValues(t);
                        const cx = padLeft + (mfe / b.maxMfe) * plotW;
                        const cy = 15 + plotH * ((b.maxRet - ret) / (b.maxRet - b.minRet));
                        const isWin = ret >= 0;
                        const isHovered = () => hoveredTrade()?.ticket === t.ticket;

                        return (
                          <g
                            class="cursor-pointer"
                            onMouseEnter={(e) => handlePointEnter(e, t)}
                            onMouseLeave={handlePointLeave}
                          >
                            <circle cx={cx} cy={cy} r="12" fill="transparent" />
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered() ? 6.5 : 4.5}
                              fill={isWin ? '#38bdf8' : '#f43f5e'}
                              fill-opacity={isHovered() ? 1.0 : 0.85}
                              stroke={isHovered() ? '#ffffff' : (isWin ? '#0284c7' : '#e11d48')}
                              stroke-width={isHovered() ? 2.5 : 1.5}
                              class="transition-colors duration-150"
                            />
                          </g>
                        );
                      }}
                    </For>

                    <text x={padLeft} y={15 + plotH + 20} fill="#64748b" font-size="10">0</text>
                    <text x={padLeft + plotW} y={15 + plotH + 20} fill="#64748b" font-size="10" text-anchor="end">
                      {formatAxisNum(b.maxMfe)} {isPipsMode() ? 'pips' : (isRMode() ? 'R' : '$')} (MFE)
                    </text>
                    <text x={padLeft - 8} y="20" fill="#64748b" font-size="10" text-anchor="end">
                      +{formatAxisNum(b.maxRet)}
                    </text>
                    <text x={padLeft - 8} y={15 + plotH} fill="#64748b" font-size="10" text-anchor="end">
                      {formatAxisNum(b.minRet)}
                    </text>
                  </svg>
                );
              })()}
            </div>
          </div>

        </div>
      </Show>

      {/* Floating Hover Tooltip */}
      <Show when={hoveredTrade()}>
        {(t) => {
          const ratio = t().mae_amount > 0 ? (t().mfe_amount / t().mae_amount).toFixed(2) : '∞';
          return (
            <div
              style={{
                position: 'fixed',
                left: `${mousePos().x}px`,
                top: `${mousePos().y}px`,
                transform: mousePos().placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                'pointer-events': 'none',
                'z-index': 9999,
              }}
              class="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 w-72 backdrop-blur-md pointer-events-none select-none transition-transform duration-75 ease-out animate-in fade-in"
            >
              <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono">
                <div class="flex items-center gap-1.5 overflow-hidden">
                  <span class="text-slate-200 font-bold">{formatShortDateTime(t().time)}</span>
                  <span class="text-slate-500 text-[10px]">#{t().ticket}</span>
                  <span class="text-slate-600">•</span>
                  <span class="font-bold text-white">{t().symbol}</span>
                </div>
                <span class={`font-bold px-1.5 py-0.2 rounded text-[10px] shrink-0 ml-1.5 ${t().net_profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {t().type === 0 ? 'BUY' : 'SELL'}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Realized Return:</span>
                <span class={`font-bold ${t().net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatReturn(t())}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Max Adverse (MAE):</span>
                <span class="font-mono text-rose-400">
                  {formatExcursion(t().mae_pips, t().mae_amount, t().mae_r)}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Max Favorable (MFE):</span>
                <span class="font-mono text-cyan-400">
                  {formatExcursion(t().mfe_pips, t().mfe_amount, t().mfe_r)}
                </span>
              </div>
              <div class="flex justify-between border-t border-slate-800 pt-1 text-[11px]">
                <span class="text-purple-300">Intra-trade Ratio (MFE/MAE):</span>
                <span class="font-mono font-bold text-purple-300">{ratio}x</span>
              </div>
            </div>
          );
        }}
      </Show>

      {/* Trade Excursions Breakdown Table */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm overflow-x-auto">
        <div class="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
          <div class="flex items-center gap-2">
            <Activity size={15} class="text-blue-400" />
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Recent Trade Excursion Summary
            </h4>
          </div>
          <span class="text-[11px] text-slate-400">
            {trades().length} trades analyzed
          </span>
        </div>

        <table class="w-full text-left text-xs">
          <thead>
            <tr class="text-[11px] text-slate-400 border-b border-slate-800">
              <th class="py-2.5 px-3">Date & Time / Ticket</th>
              <th class="py-2.5 px-2">Symbol</th>
              <th class="py-2.5 px-2">Type</th>
              <th class="py-2.5 px-2">Realized Return</th>
              <th class="py-2.5 px-2">MAE (Drawdown)</th>
              <th class="py-2.5 px-2">MFE (Peak Profit)</th>
              <th class="py-2.5 px-2 text-right">Intra Ratio</th>
              <th class="py-2.5 px-2 text-right">MFE Capture %</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <For each={trades().slice(0, 15)}>
              {(t) => {
                const isWin = t.net_profit >= 0;
                const capturePct = t.mfe_amount > 0 && isWin ? Math.min(100, Math.max(0, (t.net_profit / t.mfe_amount) * 100)) : 0;
                const ratio = t.mae_amount > 0 ? (t.mfe_amount / t.mae_amount).toFixed(2) : '∞';
                return (
                  <tr class="hover:bg-slate-800/30 transition-colors">
                    <td class="py-2 px-3 font-mono">
                      <div class="text-slate-200 font-semibold whitespace-nowrap">{formatFullDateTime(t.time)}</div>
                      <div class="text-[10px] text-slate-500 font-normal">#{t.ticket}</div>
                    </td>
                    <td class="py-2 px-2 font-mono font-bold text-white">{t.symbol}</td>
                    <td class="py-2 px-2">
                      <span class={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${t.type === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {t.type === 0 ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td class="py-2 px-2 font-bold">
                      <span class={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatReturn(t)}
                      </span>
                    </td>
                    <td class="py-2 px-2 font-mono text-rose-400">
                      {formatExcursion(t.mae_pips, t.mae_amount, t.mae_r)}
                    </td>
                    <td class="py-2 px-2 font-mono text-cyan-400">
                      {formatExcursion(t.mfe_pips, t.mfe_amount, t.mfe_r)}
                    </td>
                    <td class="py-2 px-2 text-right font-mono text-purple-300 font-semibold">
                      {ratio}x
                    </td>
                    <td class="py-2 px-2 text-right font-mono font-semibold">
                      <span class={isWin ? 'text-blue-400' : 'text-slate-500'}>
                        {isWin ? `${capturePct.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>

    </div>
  );
};
