import { Component, For } from 'solid-js';
import { PortfolioStats, SymbolStat, HourlyStat, DayOfWeekStat, MetricMode } from '../types';
import { PieChart, Clock, BarChart2 } from 'lucide-solid';

interface TradingStatsProps {
  stats: PortfolioStats | null;
  symbols: SymbolStat[];
  hourly: HourlyStat[];
  days: DayOfWeekStat[];
  mode: MetricMode;
}

export const TradingStats: Component<TradingStatsProps> = (props) => {
  const s = () => props.stats;

  const formatVal = (currencyVal: number, rVal: number) => {
    if (props.mode === 'r') {
      return (rVal >= 0 ? '+' : '') + rVal.toFixed(2) + 'R';
    }
    return (currencyVal >= 0 ? '$' : '-$') + Math.abs(currencyVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div class="space-y-4">
      {/* 2-Column Grid: Summary Metrics & Trade Breakdown */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Box 1: Trade Performance Metrics */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Trading Performance</span>
            <span class="text-slate-400 font-mono">{s()?.total_trades || 0} Trades Total</span>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Profit Factor:</span>
              <span class="font-bold text-white text-sm">
                {s()?.profit_factor ? s()?.profit_factor.toFixed(2) : '0.00'}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Sharpe Ratio:</span>
              <span class="font-bold text-white">
                {s()?.sharpe_ratio ? s()?.sharpe_ratio.toFixed(2) : '0.00'}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Win Rate:</span>
              <div class="flex items-center gap-2">
                <span class="font-bold text-emerald-400">{s()?.win_rate?.toFixed(1)}%</span>
                <span class="text-[10px] text-slate-500">
                  ({s()?.won_trades} won / {s()?.lost_trades} lost)
                </span>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Longs Won:</span>
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-slate-200">
                  {s()?.long_won}/{s()?.long_trades}
                </span>
                <span class="text-emerald-400 font-medium">({s()?.long_win_rate?.toFixed(1)}%)</span>
              </div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Shorts Won:</span>
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-slate-200">
                  {s()?.short_won}/{s()?.short_trades}
                </span>
                <span class="text-emerald-400 font-medium">({s()?.short_win_rate?.toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Box 2: Trade Edge & Payoff Asymmetry */}
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-3 text-xs">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Trade Edge & Dispersion</span>
            <span class="text-slate-400">Mode: <strong class="text-white capitalize">{props.mode === 'r' ? 'Van Tharp (R)' : props.mode}</strong></span>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="text-slate-400">Average Win:</span>
              <span class="font-bold text-emerald-400">
                {props.mode === 'r' ? `+${s()?.avg_win_r?.toFixed(2)}R` : `$${s()?.avg_win?.toFixed(2)}`}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Average Loss:</span>
              <span class="font-bold text-rose-400">
                {props.mode === 'r' ? `${s()?.avg_loss_r?.toFixed(2)}R` : `-$${Math.abs(s()?.avg_loss || 0).toFixed(2)}`}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Expectancy:</span>
              <span class="font-bold text-white">
                {props.mode === 'r' ? `${s()?.r_expectancy?.toFixed(3)}R / trade` : `$${s()?.expectancy?.toFixed(2)} / trade`}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Best Trade:</span>
              <span class="font-bold text-emerald-400">
                {props.mode === 'r' ? `+${s()?.best_trade_r?.toFixed(2)}R` : `$${s()?.best_trade?.toFixed(2)}`}
              </span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-slate-400">Worst Trade:</span>
              <span class="font-bold text-rose-400">
                {props.mode === 'r' ? `${s()?.worst_trade_r?.toFixed(2)}R` : `-$${Math.abs(s()?.worst_trade || 0).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Symbol Breakdown Table */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm overflow-x-auto">
        <div class="flex items-center gap-2 mb-3 border-b border-slate-800/80 pb-2">
          <PieChart size={15} class="text-blue-400" />
          <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Performance Breakdown by Currency Pair / Symbol
          </h4>
        </div>

        <table class="w-full text-left text-xs">
          <thead>
            <tr class="text-[11px] text-slate-400 border-b border-slate-800">
              <th class="py-2 px-2 font-semibold">Symbol</th>
              <th class="py-2 px-2 font-semibold">Trades</th>
              <th class="py-2 px-2 font-semibold">Win Rate</th>
              <th class="py-2 px-2 text-right font-semibold">Total {props.mode === 'r' ? 'Return (R)' : 'Profit ($)'}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-850">
            <For each={props.symbols}>
              {(sym) => (
                <tr class="hover:bg-slate-850/50 transition-colors">
                  <td class="py-2 px-2 font-bold text-white font-mono">{sym.symbol}</td>
                  <td class="py-2 px-2 text-slate-300">{sym.trades}</td>
                  <td class="py-2 px-2">
                    <span class={`font-semibold ${sym.win_rate >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {sym.win_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td class="py-2 px-2 text-right font-bold">
                    <span class={sym.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {formatVal(sym.profit, sym.r)}
                    </span>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>

    </div>
  );
};
