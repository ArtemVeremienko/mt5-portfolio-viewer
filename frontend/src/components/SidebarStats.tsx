import { Component, Show } from 'solid-js';
import { PortfolioStats, AccountInfo, MetricMode } from '../types';
import { ShieldCheck, Award, TrendingUp, Info } from 'lucide-solid';

interface SidebarStatsProps {
  stats: PortfolioStats | null;
  account: AccountInfo | null;
  mode: MetricMode;
}

export const SidebarStats: Component<SidebarStatsProps> = (props) => {
  const s = () => props.stats;
  const acc = () => props.account;

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '$0.00';
    return (val >= 0 ? '$' : '-$') + Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPct = (val?: number) => {
    if (val === undefined || val === null) return '0.00%';
    return (val > 0 ? '+' : '') + val.toFixed(2) + '%';
  };

  const formatR = (val?: number) => {
    if (val === undefined || val === null) return '0.00R';
    return (val > 0 ? '+' : '') + val.toFixed(2) + 'R';
  };

  return (
    <aside class="w-full lg:w-72 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-5 shadow-xl backdrop-blur-sm">
      
      {/* Account Header Badge */}
      <div class="border-b border-slate-800/80 pb-3">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider font-semibold text-slate-400">Portfolio</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {acc()?.is_demo ? 'Demo' : 'Real (Live)'}
          </span>
        </div>
        <h2 class="text-base font-bold text-white mt-1 break-words leading-snug" title={acc()?.name}>
          {acc()?.name || 'Primary Portfolio'}
        </h2>
        <div class="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
          <span>{acc()?.broker}</span>
          <span>•</span>
          <span>1:{acc()?.leverage}</span>
        </div>
      </div>

      {/* Primary Highlights (Gain / R-Multiple) */}
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
        <Show when={props.mode !== 'r'} fallback={
          <>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium flex items-center gap-1">
                <TrendingUp size={13} class="text-purple-400" /> Total R Gained:
              </span>
              <span class={`text-base font-bold ${ (s()?.total_r ?? 0) >= 0 ? 'text-purple-400' : 'text-rose-400' }`}>
                {formatR(s()?.total_r)}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium">Van Tharp SQN:</span>
              <div class="flex items-center gap-1.5">
                <span class="text-sm font-bold text-white">{s()?.sqn?.toFixed(2) || '0.00'}</span>
                <span class={`text-[10px] px-1.5 py-0.2 rounded border font-semibold ${s()?.sqn_rating?.badge || 'border-slate-700 text-slate-300'}`}>
                  {s()?.sqn_rating?.category || 'N/A'}
                </span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium">R Expectancy (R̄):</span>
              <span class="text-xs font-semibold text-slate-200">
                {s()?.r_expectancy ? `${s()?.r_expectancy.toFixed(3)}R` : '0.000R'}
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-400 font-medium">Max Drawdown (R):</span>
              <span class="text-xs font-semibold text-rose-400">
                {s()?.max_drawdown_r ? `-${s()?.max_drawdown_r.toFixed(2)}R` : '0.00R'}
              </span>
            </div>
          </>
        }>
          <div class="flex items-center justify-between" title="Time-Weighted Return: compounded trading performance excluding deposits/withdrawals">
            <span class="text-xs text-slate-400 font-medium flex items-center gap-1 cursor-help">
              Gain (TWR): <Info size={11} class="text-slate-500" />
            </span>
            <span class={`text-base font-bold ${ (s()?.gain_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
              {formatPct(s()?.gain_pct)}
            </span>
          </div>

          <div class="flex items-center justify-between" title="Absolute Gain: total net profit divided by total deposits">
            <span class="text-xs text-slate-400 font-medium flex items-center gap-1 cursor-help">
              Abs. Gain: <Info size={11} class="text-slate-500" />
            </span>
            <span class={`text-xs font-semibold ${ (s()?.abs_gain_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
              {formatPct(s()?.abs_gain_pct)}
            </span>
          </div>

          <div class="flex items-center justify-between" title="Average daily return across total calendar days traded">
            <span class="text-xs text-slate-400 font-medium">Avg Daily:</span>
            <span class={`text-xs font-semibold ${ (s()?.daily_gain_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
              {formatPct(s()?.daily_gain_pct)}
            </span>
          </div>

          <div class="flex items-center justify-between" title="Average monthly return extrapolated from daily average (30.4 days)">
            <span class="text-xs text-slate-400 font-medium">Avg Monthly:</span>
            <span class={`text-xs font-semibold ${ (s()?.monthly_gain_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
              {formatPct(s()?.monthly_gain_pct)}
            </span>
          </div>

          <div class="flex items-center justify-between" title="Maximum peak-to-trough drawdown including intra-trade MAE dips">
            <span class="text-xs text-slate-400 font-medium flex items-center gap-1 cursor-help">
              Drawdown: <Info size={11} class="text-slate-500" />
            </span>
            <span class="text-xs font-semibold text-rose-400">
              {s()?.max_drawdown_pct?.toFixed(2)}% <span class="text-slate-500 font-normal">(-${(s()?.max_drawdown_amount ?? 0).toFixed(2)})</span>
            </span>
          </div>
        </Show>
      </div>

      {/* Capital & Financial Breakdown */}
      <div class="space-y-2 border-t border-slate-800/80 pt-3 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-slate-400">Balance:</span>
          <span class="font-semibold text-white">{formatCurrency(s()?.balance)}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Equity:</span>
          <div class="flex items-center gap-1.5">
            <span class="font-semibold text-white">{formatCurrency(s()?.equity)}</span>
            <span class="text-[10px] text-slate-500">
              ({s()?.balance ? (((s()?.equity ?? 0) / (s()?.balance || 1)) * 100).toFixed(1) : 100}%)
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Floating P&L:</span>
          {(() => {
            const fl = (s()?.equity ?? 0) - (s()?.balance ?? 0);
            return (
              <span class={`font-semibold font-mono tabular-nums ${fl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fl >= 0 ? '+' : ''}{formatCurrency(fl)}
              </span>
            );
          })()}
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Highest:</span>
          <span class="font-medium text-slate-300 font-mono tabular-nums">{formatCurrency(s()?.highest_balance)}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Profit:</span>
          <span class={`font-semibold font-mono tabular-nums ${ (s()?.total_profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400' }`}>
            {formatCurrency(s()?.total_profit)}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Interest (Swap):</span>
          <span class={`font-medium font-mono tabular-nums ${ (s()?.total_swap ?? 0) >= 0 ? 'text-slate-300' : 'text-rose-400/80' }`}>
            {formatCurrency(s()?.total_swap)}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Commissions:</span>
          <span class="font-medium text-slate-300 font-mono tabular-nums">{formatCurrency(s()?.total_commission)}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Free Margin:</span>
          <span class="font-medium text-slate-300 font-mono tabular-nums">
            {formatCurrency(props.account?.free_margin)}
            {props.account?.margin_level ? ` (${props.account.margin_level.toFixed(0)}%)` : ''}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Deposits:</span>
          <span class="font-medium text-slate-300 font-mono tabular-nums">{formatCurrency(s()?.deposits)}</span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-slate-400">Withdrawals:</span>
          <span class="font-medium text-slate-300 font-mono tabular-nums">{formatCurrency(s()?.withdrawals)}</span>
        </div>
      </div>

      {/* Account Specifications */}
      <div class="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 space-y-1.5">
        <div class="flex justify-between">
          <span>Broker:</span>
          <span class="text-slate-300 font-medium truncate max-w-[150px]">{acc()?.broker || 'N/A'}</span>
        </div>
        <div class="flex justify-between">
          <span>Account:</span>
          <span class="text-slate-300 font-mono">#{acc()?.login || '0'}</span>
        </div>
        <div class="flex justify-between">
          <span>Currency:</span>
          <span class="text-slate-300">{acc()?.currency || 'USD'}</span>
        </div>
        <div class="flex justify-between">
          <span>Leverage:</span>
          <span class="text-slate-300">1:{acc()?.leverage || 100}</span>
        </div>
      </div>

    </aside>
  );
};
