import { type Component, createSignal, Show } from 'solid-js';
import type { PortfolioStats } from '../../types';
import { getStorageItem, setStorageItem } from '../../utils/storage';

export interface OverviewStripProps {
  stats: PortfolioStats | undefined;
  openCount: number;
  onOpenTradesClick: () => void;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const OverviewStrip: Component<OverviewStripProps> = (props) => {
  const [propDailyLimit, setPropDailyLimit] = createSignal<number>(
    getStorageItem('propDailyLimit', -5, (v): v is number => isFiniteNumber(v) && v <= 0)
  );
  const [propMaxDdLimit, setPropMaxDdLimit] = createSignal<number>(
    getStorageItem('propMaxDdLimit', 10, (v): v is number => isFiniteNumber(v) && v > 0)
  );
  const [showPropConfig, setShowPropConfig] = createSignal(false);

  const st = () => props.stats;
  const bal = () => st()?.balance ?? 0;
  const eq = () => st()?.equity ?? bal();
  const fl = () => eq() - bal();
  const todayP = () => st()?.today_profit ?? 0;
  const weekP = () => st()?.week_profit ?? 0;
  const monthP = () => st()?.month_profit ?? 0;
  const equityDailyPct = () => (bal() > 0 ? ((todayP() + fl()) / bal()) * 100 : 0);
  const activeDdPct = () => st()?.current_drawdown_pct ?? 0;

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Today (UTC)
        </div>
        <div
          class={`text-sm font-bold font-mono mt-0.5 ${
            todayP() >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {todayP() >= 0 ? '+$' : '-$'}
          {Math.abs(todayP()).toFixed(2)}
        </div>
        <div class="text-[10px] text-slate-500 font-mono">
          {(st()?.today_r ?? 0) >= 0 ? '+' : ''}
          {(st()?.today_r ?? 0).toFixed(2)}R • {equityDailyPct() >= 0 ? '+' : ''}
          {equityDailyPct().toFixed(2)}%
        </div>
      </div>

      <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          This Week
        </div>
        <div
          class={`text-sm font-bold font-mono mt-0.5 ${
            weekP() >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {weekP() >= 0 ? '+$' : '-$'}
          {Math.abs(weekP()).toFixed(2)}
        </div>
        <div class="text-[10px] text-slate-500 font-mono">
          {(st()?.week_r ?? 0) >= 0 ? '+' : ''}
          {(st()?.week_r ?? 0).toFixed(2)}R
        </div>
      </div>

      <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          This Month
        </div>
        <div
          class={`text-sm font-bold font-mono mt-0.5 ${
            monthP() >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {monthP() >= 0 ? '+$' : '-$'}
          {Math.abs(monthP()).toFixed(2)}
        </div>
        <div class="text-[10px] text-slate-500 font-mono">
          {(st()?.month_r ?? 0) >= 0 ? '+' : ''}
          {(st()?.month_r ?? 0).toFixed(2)}R
        </div>
      </div>

      <button
        onClick={() => props.onOpenTradesClick()}
        class="text-left bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 rounded-xl px-3.5 py-2.5 transition-colors"
      >
        <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
          Floating P&L
        </div>
        <div
          class={`text-sm font-bold font-mono mt-0.5 ${
            fl() >= 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {fl() >= 0 ? '+$' : '-$'}
          {Math.abs(fl()).toFixed(2)}
        </div>
        <div class="text-[10px] text-blue-400 font-medium">
          {props.openCount} Open Position{props.openCount === 1 ? '' : 's'} →
        </div>
      </button>

      <div class="relative bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 col-span-2 sm:col-span-1">
        <div class="flex items-center justify-between">
          <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            Prop Risk Guard
          </div>
          <button
            onClick={() => setShowPropConfig(!showPropConfig())}
            class="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700"
            title="Configure Prop Firm DD limits"
          >
            Edit
          </button>
        </div>
        <div
          class="text-xs font-bold text-slate-200 font-mono mt-1"
          title="Includes closed today P&L + live floating P&L"
        >
          Daily Eq:{' '}
          <span class={equityDailyPct() <= propDailyLimit() * 0.8 ? 'text-rose-400' : 'text-emerald-400'}>
            {equityDailyPct().toFixed(2)}%
          </span>{' '}
          <span class="text-slate-500">/ {propDailyLimit()}%</span>
        </div>
        <div
          class="text-[10px] text-slate-400 font-mono"
          title={`Historical Max DD: ${(st()?.max_drawdown_pct ?? 0).toFixed(2)}%`}
        >
          Active DD:{' '}
          <span class={activeDdPct() >= propMaxDdLimit() * 0.8 ? 'text-rose-400' : 'text-amber-300'}>
            {activeDdPct().toFixed(2)}%
          </span>{' '}
          / {propMaxDdLimit()}%
        </div>
        <Show when={showPropConfig()}>
          <div class="absolute right-0 top-full mt-1.5 z-40 w-56 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-2 text-xs">
            <div class="font-bold text-white text-[11px]">Prop Firm Limits</div>
            <label class="flex items-center justify-between text-slate-300 text-[11px]">
              <span>Daily Loss %</span>
              <input
                id="prop-daily-limit"
                name="prop_daily_limit"
                type="number"
                step="0.5"
                max="0"
                value={propDailyLimit()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (!isNaN(v) && v <= 0) {
                    setPropDailyLimit(v);
                    setStorageItem('propDailyLimit', v);
                  }
                }}
                class="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white"
              />
            </label>
            <label class="flex items-center justify-between text-slate-300 text-[11px]">
              <span>Max DD %</span>
              <input
                id="prop-max-dd-limit"
                name="prop_max_dd_limit"
                type="number"
                step="0.5"
                min="1"
                value={propMaxDdLimit()}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (!isNaN(v) && v > 0) {
                    setPropMaxDdLimit(v);
                    setStorageItem('propMaxDdLimit', v);
                  }
                }}
                class="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white"
              />
            </label>
          </div>
        </Show>
      </div>
    </div>
  );
};
