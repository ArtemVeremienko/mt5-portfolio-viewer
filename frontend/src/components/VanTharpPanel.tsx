import { Component, For, Show } from 'solid-js';
import { PortfolioStats, RDistributionBucket } from '../types';
import { Award, Target, BarChart3, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-solid';

interface VanTharpPanelProps {
  stats: PortfolioStats | null;
  rDistribution: RDistributionBucket[];
}

export const VanTharpPanel: Component<VanTharpPanelProps> = (props) => {
  const s = () => props.stats;

  const sqnBenchmarks = [
    { range: '< 1.6', label: 'Poor / Hard to Trade', color: 'text-red-400' },
    { range: '1.6 – 1.9', label: 'Average System', color: 'text-yellow-400' },
    { range: '2.0 – 2.4', label: 'Good System', color: 'text-emerald-400' },
    { range: '2.5 – 2.9', label: 'Very Good System', color: 'text-cyan-400' },
    { range: '3.0 – 5.0', label: 'Excellent System', color: 'text-blue-400' },
    { range: '5.0+', label: 'Superb / Holy Grail', color: 'text-purple-400' },
  ];

  const maxBucketCount = () => {
    return Math.max(1, ...props.rDistribution.map(b => b.count));
  };

  return (
    <div class="bg-slate-900/90 border border-purple-500/20 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-6">
      
      {/* Panel Header */}
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Award size={18} />
          </div>
          <div>
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              Dr. Van Tharp Quantitative Position & System Analytics
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                1R Risk Metric
              </span>
            </h3>
            <p class="text-xs text-slate-400">
              Normalizes performance by initial dollar risk (1R: Initial Stop Loss distance, or 1% balance / $0.20 micro floor) to measure genuine trading edge.
            </p>
          </div>
        </div>
      </div>

      {/* Primary 3-Metric Cards */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: SQN */}
        <div class="bg-slate-950/80 border border-purple-500/30 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div class="absolute -right-4 -bottom-4 opacity-5 text-purple-400">
            <Award size={96} />
          </div>
          <div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-purple-300 font-semibold uppercase tracking-wider">System Quality Number (SQN)</span>
              <Show when={(s()?.total_trades || 0) < 30}>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center gap-1">
                  <AlertTriangle size={11} />
                  <span>Small Sample</span>
                </span>
              </Show>
            </div>
            <div class="flex items-baseline gap-2 mt-2">
              <span class="text-3xl font-black text-white">{s()?.sqn?.toFixed(2) || '0.00'}</span>
              <span class={`text-xs font-bold px-2 py-0.5 rounded-full border ${s()?.sqn_rating?.badge || 'border-slate-700 text-slate-300'}`}>
                {s()?.sqn_rating?.category || 'Calculating'}
              </span>
            </div>

            {/* Developing Sample Notice & Mini Progress Bar */}
            <Show when={(s()?.total_trades || 0) < 30}>
              <div class="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-left">
                <div class="flex items-center justify-between text-[11px] font-semibold text-amber-400 mb-1">
                  <span>Sample Size: {s()?.total_trades || 0} / 30 trades</span>
                  <span class="text-[10px] text-amber-300 font-mono">
                    {Math.round(((s()?.total_trades || 0) / 30) * 100)}%
                  </span>
                </div>
                <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    class="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ((s()?.total_trades || 0) / 30) * 100)}%` }}
                  />
                </div>
                <p class="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Statistical confidence requires 30+ trades. Van Tharp benchmarks standardize at 100 trades; current small sample penalizes score via √N ({Math.sqrt(s()?.total_trades || 0).toFixed(2)} vs 10.0 benchmark).
                </p>
              </div>
            </Show>
          </div>
          <div class="text-[11px] text-slate-400 mt-3 space-y-1">
            <p>
              Formula: <span class="font-mono text-purple-300">(R̄ / σR) × min(10, √N)</span>. Consistency across {s()?.total_trades || 0} trades.
            </p>
            <Show when={(s()?.sl_verified_count ?? 0) + (s()?.sl_estimated_count ?? 0) > 0}>
              <p class="text-[10px] text-slate-500">
                1R Model: <span class="text-emerald-400 font-semibold">{s()?.sl_verified_count ?? 0} SL-Verified</span> • <span class="text-amber-400 font-semibold">{s()?.sl_estimated_count ?? 0} 1%-Estimated</span>
              </p>
            </Show>
          </div>
        </div>

        {/* Card 2: Expectancy (R̄) */}
        <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <span class="text-xs text-slate-400 font-semibold uppercase tracking-wider">R-Expectancy (R̄ per Trade)</span>
            <div class="flex items-baseline gap-2 mt-2">
              <span class={`text-3xl font-black ${ (s()?.r_expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
                {s()?.r_expectancy !== undefined ? `${(s()?.r_expectancy ?? 0) > 0 ? '+' : ''}${s()?.r_expectancy.toFixed(3)}R` : '0.00R'}
              </span>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 mt-3 flex justify-between">
            <span>Avg Win: <strong class="text-emerald-400">+{s()?.avg_win_r?.toFixed(2)}R</strong></span>
            <span>Avg Loss: <strong class="text-rose-400">{s()?.avg_loss_r?.toFixed(2)}R</strong></span>
          </div>
        </div>

        {/* Card 3: R-Multiple Extremes */}
        <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-lg">
          <div>
            <span class="text-xs text-slate-400 font-semibold uppercase tracking-wider">R-Dispersion & Extremes</span>
            <div class="flex items-baseline gap-2 mt-2">
              <span class="text-3xl font-black text-cyan-400">+{s()?.best_trade_r?.toFixed(2)}R</span>
              <span class="text-xs text-slate-400">Best Winner</span>
            </div>
          </div>
          <div class="text-[11px] text-slate-400 mt-3 flex justify-between">
            <span>Worst Trade: <strong class="text-rose-400">{s()?.worst_trade_r?.toFixed(2)}R</strong></span>
            <span>R Std Dev (σ): <strong class="text-slate-200">{s()?.r_std_dev?.toFixed(3)}R</strong></span>
          </div>
        </div>

      </div>

      {/* R-Multiple Distribution Histogram */}
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <BarChart3 size={15} class="text-purple-400" />
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">
              R-Multiple Distribution Histogram
            </h4>
          </div>
          <span class="text-[11px] text-slate-400">Percentage of trades per R-bucket</span>
        </div>

        <div class="grid grid-cols-7 gap-2 pt-2 items-end h-36 border-b border-slate-800 pb-2">
          <For each={props.rDistribution}>
            {(bucket) => {
              const heightPct = Math.max(8, (bucket.count / maxBucketCount()) * 100);
              const isProfit = !bucket.bucket.includes('-');
              return (
                <div class="flex flex-col items-center gap-1 h-full justify-end group">
                  <span class="text-[10px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {bucket.count} ({bucket.pct}%)
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    class={`w-full rounded-t-md transition-all duration-300 ${
                      isProfit
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 group-hover:brightness-110 shadow-sm shadow-emerald-500/20'
                        : 'bg-gradient-to-t from-rose-600 to-rose-400 group-hover:brightness-110 shadow-sm shadow-rose-500/20'
                    }`}
                  />
                  <span class="text-[10px] font-mono font-medium text-slate-300 truncate w-full text-center">
                    {bucket.bucket}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Van Tharp Benchmark Reference Table */}
      <div class="border-t border-slate-800/80 pt-3">
        <span class="text-[11px] text-slate-400 uppercase font-semibold tracking-wider block mb-2">
          Van Tharp SQN Classification Benchmarks
        </span>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <For each={sqnBenchmarks}>
            {(b) => (
              <div class="bg-slate-950/60 border border-slate-800 rounded-lg p-2 text-center text-xs">
                <span class={`font-mono font-bold block ${b.color}`}>{b.range}</span>
                <span class="text-[10px] text-slate-400">{b.label}</span>
              </div>
            )}
          </For>
        </div>
      </div>

    </div>
  );
};
