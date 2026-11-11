import { Component, createSignal, For, Show } from 'solid-js';
import { ExcursionStats, ExcursionTrade, MetricMode } from '../types';
import { Activity, ShieldAlert, TrendingUp, Target, Info, CheckCircle2 } from 'lucide-solid';

interface ExcursionPanelProps {
  excursionStats: ExcursionStats | null;
  mode: MetricMode;
}

export const ExcursionPanel: Component<ExcursionPanelProps> = (props) => {
  const [unitMode, setUnitMode] = createSignal<'auto' | 'pips'>('auto');
  const [hoveredTrade, setHoveredTrade] = createSignal<ExcursionTrade | null>(null);
  const [mousePos, setMousePos] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });

  const stats = () => props.excursionStats;
  const trades = () => props.excursionStats?.trades || [];

  const isRMode = () => unitMode() === 'auto' && props.mode === 'r';
  const isPipsMode = () => unitMode() === 'pips';

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
      ret = t.net_profit; // return still indicates win/loss
    } else if (isRMode()) {
      mae = t.mae_r;
      mfe = t.mfe_r;
      ret = t.r_multiple;
    }
    return { mae, mfe, ret };
  };

  // Bounds for Chart 1 (MAE vs Return)
  const maeChartBounds = () => {
    const list = trades();
    if (!list.length) return { maxMae: 10, minRet: -10, maxRet: 10 };
    let maxMae = 1;
    let maxRet = 1;
    let minRet = -1;

    for (const t of list) {
      const { mae, ret } = getTradeValues(t);
      if (mae > maxMae) maxMae = mae;
      if (ret > maxRet) maxRet = ret;
      if (ret < minRet) minRet = ret;
    }
    return {
      maxMae: maxMae * 1.15,
      minRet: minRet * 1.15,
      maxRet: maxRet * 1.15,
    };
  };

  // Bounds for Chart 2 (MFE vs Return)
  const mfeChartBounds = () => {
    const list = trades();
    if (!list.length) return { maxMfe: 10, minRet: -10, maxRet: 10 };
    let maxMfe = 1;
    let maxRet = 1;
    let minRet = -1;

    for (const t of list) {
      const { mfe, ret } = getTradeValues(t);
      if (mfe > maxMfe) maxMfe = mfe;
      if (ret > maxRet) maxRet = ret;
      if (ret < minRet) minRet = ret;
    }
    return {
      maxMfe: maxMfe * 1.15,
      minRet: minRet * 1.15,
      maxRet: maxRet * 1.15,
    };
  };

  return (
    <div class="space-y-5">
      
      {/* Top Header & Unit Selector */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Activity size={18} />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                Trade Excursion Analytics (MAE & MFE)
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Stop Loss & Target Optimization
                </span>
              </h3>
              <p class="text-xs text-slate-400">
                Measures unrealized drawdowns (MAE) and peak unrealized gains (MFE) during each trade's active lifetime.
              </p>
            </div>
          </div>
        </div>

        {/* Unit Selector Toggle */}
        <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              unitMode() === 'auto'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setUnitMode('auto')}
          >
            Mode Sync ({props.mode === 'r' ? 'R' : '$'})
          </button>
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              unitMode() === 'pips'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setUnitMode('pips')}
          >
            Pips / Points
          </button>
        </div>
      </div>

      {/* 4 Quantitative Insight Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Optimal SL Threshold */}
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
            90% of your winning trades never suffered a deeper drawdown than this. Wider SLs risk unnecessary losses.
          </p>
        </div>

        {/* Card 2: MFE Capture Efficiency */}
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

        {/* Card 3: Average MAE */}
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

        {/* Card 4: Average MFE */}
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

      {/* Dual Scatter Plots Grid */}
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

          {/* SVG Canvas Plot */}
          <div class="w-full h-80 bg-slate-950 rounded-xl relative border border-slate-850 p-4 select-none">
            {(() => {
              const b = maeChartBounds();
              const w = 480;
              const h = 260;
              const padLeft = 45;
              const padBottom = 30;
              const plotW = w - padLeft - 15;
              const plotH = h - padBottom - 15;

              // Zero return line Y coordinate
              const zeroY = 15 + plotH * (b.maxRet / (b.maxRet - b.minRet));

              // Optimal SL threshold line X coordinate
              const optSLVal = isPipsMode()
                ? (stats()?.optimal_sl_pips || 0)
                : (isRMode() ? (stats()?.optimal_sl_r || 0) : (stats()?.optimal_sl_amount || 0));
              const optSLX = padLeft + (optSLVal / b.maxMae) * plotW;

              return (
                <svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3" />
                  <line x1={padLeft} y1="15" x2={padLeft} y2={15 + plotH} stroke="#334155" stroke-width="1" />
                  <line x1={padLeft} y1={15 + plotH} x2={padLeft + plotW} y2={15 + plotH} stroke="#334155" stroke-width="1" />

                  {/* Optimal SL Guideline */}
                  {optSLVal > 0 && optSLX <= padLeft + plotW && (
                    <g>
                      <line x1={optSLX} y1="15" x2={optSLX} y2={15 + plotH} stroke="#10b981" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7" />
                      <text x={optSLX + 3} y="25" fill="#10b981" font-size="9" font-family="monospace">
                        90% SL Cutoff
                      </text>
                    </g>
                  )}

                  {/* Scatter Points */}
                  <For each={trades()}>
                    {(t) => {
                      const { mae, ret } = getTradeValues(t);
                      const cx = padLeft + (mae / b.maxMae) * plotW;
                      const cy = 15 + plotH * ((b.maxRet - ret) / (b.maxRet - b.minRet));
                      const isWin = ret >= 0;

                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={hoveredTrade()?.ticket === t.ticket ? 6 : 4}
                          fill={isWin ? '#10b981' : '#f43f5e'}
                          fill-opacity="0.8"
                          stroke={hoveredTrade()?.ticket === t.ticket ? '#ffffff' : (isWin ? '#059669' : '#e11d48')}
                          stroke-width="1.5"
                          class="cursor-pointer transition-all hover:scale-125"
                          onMouseEnter={(e) => {
                            setHoveredTrade(t);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMousePos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 10 });
                          }}
                          onMouseLeave={() => setHoveredTrade(null)}
                        />
                      );
                    }}
                  </For>

                  {/* Labels */}
                  <text x={padLeft} y={15 + plotH + 20} fill="#64748b" font-size="10">0</text>
                  <text x={padLeft + plotW} y={15 + plotH + 20} fill="#64748b" font-size="10" text-anchor="end">
                    {b.maxMae.toFixed(1)} {isPipsMode() ? 'pips' : (isRMode() ? 'R' : '$')} (MAE)
                  </text>
                  <text x={padLeft - 8} y="20" fill="#64748b" font-size="10" text-anchor="end">
                    +{b.maxRet.toFixed(1)}
                  </text>
                  <text x={padLeft - 8} y={15 + plotH} fill="#64748b" font-size="10" text-anchor="end">
                    {b.minRet.toFixed(1)}
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

          {/* SVG Canvas Plot */}
          <div class="w-full h-80 bg-slate-950 rounded-xl relative border border-slate-850 p-4 select-none">
            {(() => {
              const b = mfeChartBounds();
              const w = 480;
              const h = 260;
              const padLeft = 45;
              const padBottom = 30;
              const plotW = w - padLeft - 15;
              const plotH = h - padBottom - 15;

              // Zero return line Y coordinate
              const zeroY = 15 + plotH * (b.maxRet / (b.maxRet - b.minRet));

              return (
                <svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke="#334155" stroke-width="1.5" stroke-dasharray="3 3" />
                  <line x1={padLeft} y1="15" x2={padLeft} y2={15 + plotH} stroke="#334155" stroke-width="1" />
                  <line x1={padLeft} y1={15 + plotH} x2={padLeft + plotW} y2={15 + plotH} stroke="#334155" stroke-width="1" />

                  {/* 100% Capture Diagonal Reference Line */}
                  {(() => {
                    const maxDiag = Math.min(b.maxMfe, b.maxRet);
                    const x2 = padLeft + (maxDiag / b.maxMfe) * plotW;
                    const y2 = 15 + plotH * ((b.maxRet - maxDiag) / (b.maxRet - b.minRet));
                    return (
                      <g>
                        <line x1={padLeft} y1={zeroY} x2={x2} y2={y2} stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.6" />
                        <text x={x2 + 4} y={y2} fill="#38bdf8" font-size="9" font-family="monospace">
                          y = x (Perfect Exit)
                        </text>
                      </g>
                    );
                  })()}

                  {/* Scatter Points */}
                  <For each={trades()}>
                    {(t) => {
                      const { mfe, ret } = getTradeValues(t);
                      const cx = padLeft + (mfe / b.maxMfe) * plotW;
                      const cy = 15 + plotH * ((b.maxRet - ret) / (b.maxRet - b.minRet));
                      const isWin = ret >= 0;

                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={hoveredTrade()?.ticket === t.ticket ? 6 : 4}
                          fill={isWin ? '#38bdf8' : '#f43f5e'}
                          fill-opacity="0.8"
                          stroke={hoveredTrade()?.ticket === t.ticket ? '#ffffff' : (isWin ? '#0284c7' : '#e11d48')}
                          stroke-width="1.5"
                          class="cursor-pointer transition-all hover:scale-125"
                          onMouseEnter={(e) => {
                            setHoveredTrade(t);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMousePos({ x: rect.left + window.scrollX, y: rect.top + window.scrollY - 10 });
                          }}
                          onMouseLeave={() => setHoveredTrade(null)}
                        />
                      );
                    }}
                  </For>

                  {/* Labels */}
                  <text x={padLeft} y={15 + plotH + 20} fill="#64748b" font-size="10">0</text>
                  <text x={padLeft + plotW} y={15 + plotH + 20} fill="#64748b" font-size="10" text-anchor="end">
                    {b.maxMfe.toFixed(1)} {isPipsMode() ? 'pips' : (isRMode() ? 'R' : '$')} (MFE)
                  </text>
                  <text x={padLeft - 8} y="20" fill="#64748b" font-size="10" text-anchor="end">
                    +{b.maxRet.toFixed(1)}
                  </text>
                  <text x={padLeft - 8} y={15 + plotH} fill="#64748b" font-size="10" text-anchor="end">
                    {b.minRet.toFixed(1)}
                  </text>
                </svg>
              );
            })()}
          </div>
        </div>

      </div>

      {/* Floating Hover Tooltip */}
      <Show when={hoveredTrade()}>
        {(t) => (
          <div
            style={{
              position: 'fixed',
              left: `${mousePos().x}px`,
              top: `${mousePos().y - 120}px`,
              transform: 'translateX(-50%)',
              'pointer-events': 'none',
              'z-index': 9999,
            }}
            class="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 w-56 backdrop-blur-md"
          >
            <div class="flex items-center justify-between border-b border-slate-800 pb-1 font-mono">
              <span class="font-bold text-white">#{t().ticket} • {t().symbol}</span>
              <span class={`font-bold px-1.5 py-0.2 rounded text-[10px] ${t().net_profit >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
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
          </div>
        )}
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
              <th class="py-2 px-2">Ticket</th>
              <th class="py-2 px-2">Symbol</th>
              <th class="py-2 px-2">Type</th>
              <th class="py-2 px-2">Realized Return</th>
              <th class="py-2 px-2">MAE (Drawdown)</th>
              <th class="py-2 px-2">MFE (Peak Profit)</th>
              <th class="py-2 px-2 text-right">MFE Capture %</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-850">
            <For each={trades().slice(0, 15)}>
              {(t) => {
                const isWin = t.net_profit >= 0;
                const capturePct = t.mfe_amount > 0 && isWin ? Math.min(100, Math.max(0, (t.net_profit / t.mfe_amount) * 100)) : 0;
                return (
                  <tr class="hover:bg-slate-850/50 transition-colors">
                    <td class="py-2 px-2 font-mono text-slate-400">#{t.ticket}</td>
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
