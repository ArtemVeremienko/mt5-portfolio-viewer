import { Component, For, Show } from 'solid-js';
import { MonthlyRow, MetricMode } from '../types';
import { Calendar } from 'lucide-solid';

interface MonthlyHeatmapProps {
  matrix: MonthlyRow[];
  mode: MetricMode;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const MonthlyHeatmap: Component<MonthlyHeatmapProps> = (props) => {
  const formatCell = (m: { profit: number; r: number; pct: number } | null) => {
    if (!m) return null;
    if (props.mode === 'pct') {
      return (m.pct > 0 ? '+' : '') + m.pct.toFixed(2) + '%';
    } else if (props.mode === 'currency') {
      return (m.profit >= 0 ? '+$' : '-$') + Math.abs(m.profit).toFixed(0);
    } else {
      return (m.r > 0 ? '+' : '') + m.r.toFixed(1) + 'R';
    }
  };

  const getCellColor = (m: { profit: number; r: number; pct: number } | null) => {
    if (!m) return 'bg-slate-900/40 text-slate-600';
    const val = props.mode === 'r' ? m.r : (props.mode === 'currency' ? m.profit : m.pct);
    if (val > 0) {
      if (val > 5) return 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30';
      return 'bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20';
    } else if (val < 0) {
      if (val < -5) return 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30';
      return 'bg-rose-500/10 text-rose-400 font-medium border border-rose-500/20';
    }
    return 'bg-slate-800/40 text-slate-400';
  };

  const formatTotal = (row: MonthlyRow) => {
    if (props.mode === 'pct') {
      return (row.total_pct > 0 ? '+' : '') + row.total_pct.toFixed(2) + '%';
    } else if (props.mode === 'currency') {
      return (row.total_profit >= 0 ? '+$' : '-$') + Math.abs(row.total_profit).toLocaleString(undefined, { maximumFractionDigits: 0 });
    } else {
      return (row.total_r > 0 ? '+' : '') + row.total_r.toFixed(1) + 'R';
    }
  };

  return (
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm overflow-x-auto">
      <div class="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
        <div class="flex items-center gap-2">
          <Calendar size={15} class="text-blue-400" />
          <h3 class="text-xs uppercase tracking-wider font-bold text-slate-300">Monthly Returns Heatmap</h3>
        </div>
        <span class="text-[11px] text-slate-400">
          Viewing in: <strong class="text-white capitalize">{props.mode === 'r' ? 'Van Tharp (R)' : props.mode}</strong>
        </span>
      </div>

      <table class="w-full text-center border-collapse text-xs">
        <thead>
          <tr class="text-[11px] text-slate-400 border-b border-slate-800">
            <th class="py-2 px-2 text-left font-semibold">Year</th>
            <For each={MONTH_NAMES}>
              {(m) => <th class="py-2 px-1 font-semibold">{m}</th>}
            </For>
            <th class="py-2 px-2 text-right font-bold text-slate-300">YTD</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-850">
          <For each={props.matrix}>
            {(row) => (
              <tr class="hover:bg-slate-850/40 transition-colors">
                <td class="py-2 px-2 text-left font-bold text-white font-mono">{row.year}</td>
                <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}>
                  {(mo) => {
                    const mInfo = row.months[mo];
                    return (
                      <td class="p-1">
                        <div class={`py-1.5 px-1 rounded-md text-[11px] transition-transform ${getCellColor(mInfo)}`}>
                          {formatCell(mInfo) || '—'}
                        </div>
                      </td>
                    );
                  }}
                </For>
                <td class="py-2 px-2 text-right font-bold">
                  <span class={`px-2 py-1 rounded-md ${row.total_profit >= 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'}`}>
                    {formatTotal(row)}
                  </span>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
};
