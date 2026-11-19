import {
  type Component,
  createMemo,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Dices,
  Gauge,
  Play,
  ShieldAlert,
  TrendingUp,
} from 'lucide-solid';
import { runStrategyBenchmark } from '../api/portfolio';
import type {
  BenchmarkBarTf,
  BenchmarkFallbackMode,
  BenchmarkMode,
  BenchmarkResponse,
  ExcursionStats,
  TradeScope,
} from '../types';

interface BenchmarkPanelProps {
  excursionStats: ExcursionStats | null;
  allAccounts: boolean;
  symbol: string;
  direction: string;
  comment: string;
  magic: string;
  scope: TradeScope;
}

export const BenchmarkPanel: Component<BenchmarkPanelProps> = (props) => {
  const [barTf, setBarTf] = createSignal<BenchmarkBarTf>('m5');
  const [horizonBars, setHorizonBars] = createSignal<number>(30);
  const [iterations, setIterations] = createSignal<number>(1000);
  const [mode, setMode] = createSignal<BenchmarkMode>('coin_flip_direction');
  const [fallbackMode, setFallbackMode] = createSignal<BenchmarkFallbackMode>('realized_1r');
  const [atrMult, setAtrMult] = createSignal<number>(1.5);
  const [fixedRr, setFixedRr] = createSignal<number>(2.0);
  const [includeCosts, setIncludeCosts] = createSignal<boolean>(true);

  const [isRunning, setIsRunning] = createSignal<boolean>(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<BenchmarkResponse | null>(null);

  const executeSimulation = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const res = await runStrategyBenchmark({
        all_accounts: props.allAccounts,
        symbol: props.symbol || undefined,
        direction: props.direction || undefined,
        comment: props.comment || undefined,
        magic: props.magic ? Number(props.magic) : undefined,
        scope: props.scope,
        horizon_bars: horizonBars(),
        bar_tf: barTf(),
        iterations: iterations(),
        mode: mode(),
        include_costs: includeCosts(),
        fallback_mode: fallbackMode(),
        atr_mult: atrMult(),
        fixed_rr: fixedRr(),
        seed: 42,
      });
      setResult(res);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to run benchmark simulation.');
    } finally {
      setIsRunning(false);
    }
  };

  onMount(() => {
    void executeSimulation();
  });

  const maxHistCount = createMemo(() => {
    const bins = result()?.histogram || [];
    return Math.max(1, ...bins.map((b) => b.count));
  });

  const maxTwr = createMemo(() => {
    const curve = result()?.sizing.twr_curve || [];
    return Math.max(1.01, ...curve.map((p) => p.twr));
  });

  const inTradeEdgeRatio = createMemo(() => {
    const res = result();
    if (res) return res.actual.in_trade_edge_ratio;
    return props.excursionStats?.edge_ratio ?? 0;
  });

  return (
    <div class="space-y-4">
      {/* Controls Bar */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400">
              <Dices size={18} />
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-100">
                Coin-Flip Baseline &amp; Edge Ratio Benchmark
              </h2>
              <p class="text-[11px] text-slate-400">
                Monte Carlo random-entry simulation on historical OHLC bars + Kelly / Optimal-f sizing
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isRunning()}
            onClick={() => void executeSimulation()}
            class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-md shadow-blue-600/20 transition-all"
          >
            <Play size={14} />
            <span>{isRunning() ? 'Simulating...' : 'Run Simulation'}</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <label class="flex flex-col gap-1">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Bar Timeframe
            </span>
            <select
              value={barTf()}
              onChange={(e) => setBarTf(e.currentTarget.value as BenchmarkBarTf)}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="m1">M1</option>
              <option value="m5">M5</option>
              <option value="h1">H1</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Forward Horizon (N)
            </span>
            <select
              value={String(horizonBars())}
              onChange={(e) => setHorizonBars(Number(e.currentTarget.value))}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="15">15 bars</option>
              <option value="30">30 bars</option>
              <option value="60">60 bars</option>
              <option value="120">120 bars</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Iterations
            </span>
            <select
              value={String(iterations())}
              onChange={(e) => setIterations(Number(e.currentTarget.value))}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="500">500 runs</option>
              <option value="1000">1,000 runs</option>
              <option value="2500">2,500 runs</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Entry Mode
            </span>
            <select
              value={mode()}
              onChange={(e) => setMode(e.currentTarget.value as BenchmarkMode)}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="coin_flip_direction">50/50 Direction</option>
              <option value="window_jitter">Window Jitter + Dir</option>
            </select>
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              No-SL/TP Fallback
            </span>
            <select
              value={fallbackMode()}
              onChange={(e) => setFallbackMode(e.currentTarget.value as BenchmarkFallbackMode)}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="realized_1r">Realized 1R (Default)</option>
              <option value="atr">ATR Override</option>
              <option value="fixed_rr">Fixed R:R Override</option>
            </select>
          </label>

          <div class="flex flex-col justify-end gap-1">
            <label class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCosts()}
                onChange={(e) => setIncludeCosts(e.currentTarget.checked)}
                class="accent-blue-500"
              />
              <span class="text-slate-200 font-medium">Deduct Costs</span>
            </label>
          </div>
        </div>

        <Show when={fallbackMode() === 'atr' || fallbackMode() === 'fixed_rr'}>
          <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-3 text-xs">
            <Show when={fallbackMode() === 'atr'}>
              <label class="flex items-center gap-2">
                <span class="text-slate-400">ATR Multiplier:</span>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="10"
                  value={atrMult()}
                  onInput={(e) => setAtrMult(Number(e.currentTarget.value) || 1.5)}
                  class="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
                />
              </label>
            </Show>
            <label class="flex items-center gap-2">
              <span class="text-slate-400">Target R:R:</span>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="20"
                value={fixedRr()}
                onInput={(e) => setFixedRr(Number(e.currentTarget.value) || 2.0)}
                class="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200"
              />
            </label>
          </div>
        </Show>
      </div>

      <Show when={errorMsg()}>
        <div class="bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-4 py-3 text-xs">
          {errorMsg()}
        </div>
      </Show>

      <Show when={result()}>
        {(res) => (
          <>
            {/* Diagnostic Verdict Banner */}
            <Switch>
              <Match when={res().verdict === 'significant_edge'}>
                <div class="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 text-xs text-emerald-200">
                  <CheckCircle2 size={18} class="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div class="font-bold text-emerald-300">
                      Statistically Significant Entry Edge (p = {res().percentiles.p_value_net_r.toFixed(3)})
                    </div>
                    <div class="text-emerald-200/80 mt-0.5">
                      Your strategy outperforms {res().percentiles.net_r_pct}% of {res().iterations.toLocaleString()} random-entry runs on the same historical bars with a fixed-horizon E-ratio of {res().actual.horizon_edge_ratio.toFixed(2)}.
                    </div>
                  </div>
                </div>
              </Match>
              <Match when={res().verdict === 'no_candle_data'}>
                <div class="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-xs text-amber-200">
                  <AlertTriangle size={18} class="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div class="font-bold text-amber-300">No Cached OHLC Bars Found for Selected Scope</div>
                    <div class="text-amber-200/80 mt-0.5">
                      Open a trade chart or connect MT5 so historical {res().timeframe.toUpperCase()} candles can be cached for Monte Carlo bar replay. In-trade E-ratio ({inTradeEdgeRatio().toFixed(2)}) and Kelly / Optimal-f sizing are still computed below.
                    </div>
                  </div>
                </div>
              </Match>
              <Match when={res().verdict === 'inconclusive'}>
                <div class="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-xs text-amber-200">
                  <AlertTriangle size={18} class="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div class="font-bold text-amber-300">
                      Inconclusive {res().sample_size_warning ? `(Developing Sample: ${res().eligible_trades} / 30 trades)` : `(p = ${res().percentiles.p_value_net_r.toFixed(3)})`}
                    </div>
                    <div class="text-amber-200/80 mt-0.5">
                      Either sample size is under 30 trades or performance is not yet cleanly separated from the 95th percentile of random entries.
                    </div>
                  </div>
                </div>
              </Match>
              <Match when={res().verdict === 'no_edge'}>
                <div class="flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-4 py-3 text-xs text-rose-200">
                  <ShieldAlert size={18} class="text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div class="font-bold text-rose-300">
                      Indistinguishable from Coin-Flip Baseline (p = {res().percentiles.p_value_net_r.toFixed(3)})
                    </div>
                    <div class="text-rose-200/80 mt-0.5">
                      Your entries rank at the {res().percentiles.net_r_pct}th percentile of random runs. Current results may be driven by market drift or R:R mechanics rather than entry timing.
                    </div>
                  </div>
                </div>
              </Match>
            </Switch>

            {/* Primary KPI Comparison Grid */}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Edge Ratio Card */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span class="font-semibold uppercase tracking-wider">Edge Ratio (MFE / MAE)</span>
                  <TrendingUp size={15} class="text-blue-400" />
                </div>
                <div class="flex items-baseline justify-between">
                  <div>
                    <div class="text-2xl font-extrabold text-slate-100">
                      {res().actual.horizon_edge_ratio > 0
                        ? res().actual.horizon_edge_ratio.toFixed(2)
                        : inTradeEdgeRatio().toFixed(2)}
                    </div>
                    <div class="text-[11px] text-slate-400">
                      {res().horizon_bars}-bar Horizon ({res().actual.horizon_avg_mfe_r.toFixed(2)}R / {res().actual.horizon_avg_mae_r.toFixed(2)}R)
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold text-slate-300">
                      {res().random_baseline.edge_ratio_p50.toFixed(2)}
                    </div>
                    <div class="text-[11px] text-slate-500">Random p50</div>
                  </div>
                </div>
                <div class="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                  <span>In-Trade E-Ratio: <strong class="text-slate-200">{inTradeEdgeRatio().toFixed(2)}</strong></span>
                  <span>Random p95: <strong class="text-slate-200">{res().random_baseline.edge_ratio_p95.toFixed(2)}</strong></span>
                </div>
              </div>

              {/* Win Rate vs Breakeven & Random */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span class="font-semibold uppercase tracking-wider">Win Rate vs. Coin Flip</span>
                  <Gauge size={15} class="text-emerald-400" />
                </div>
                <div class="flex items-baseline justify-between">
                  <div>
                    <div class="text-2xl font-extrabold text-slate-100">
                      {res().actual.win_rate.toFixed(1)}%
                    </div>
                    <div class="text-[11px] text-slate-400">
                      {res().percentiles.win_rate_pct.toFixed(1)}th pct vs. random
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold text-slate-300">
                      {res().actual.breakeven_win_rate.toFixed(1)}%
                    </div>
                    <div class="text-[11px] text-slate-500">
                      Breakeven (1:{res().actual.avg_rr.toFixed(1)})
                    </div>
                  </div>
                </div>
                <div class="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                  <span>Random p50: <strong class="text-slate-200">{res().random_baseline.win_rate_p50.toFixed(1)}%</strong></span>
                  <span>Random p95: <strong class="text-slate-200">{res().random_baseline.win_rate_p95.toFixed(1)}%</strong></span>
                </div>
              </div>

              {/* Net R & Expectancy */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center justify-between text-xs text-slate-400">
                  <span class="font-semibold uppercase tracking-wider">Net R vs. Random Dist.</span>
                  <Activity size={15} class="text-amber-400" />
                </div>
                <div class="flex items-baseline justify-between">
                  <div>
                    <div
                      class={`text-2xl font-extrabold ${
                        res().actual.net_r >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {res().actual.net_r >= 0 ? '+' : ''}
                      {res().actual.net_r.toFixed(2)}R
                    </div>
                    <div class="text-[11px] text-slate-400">
                      Expectancy: {res().actual.expectancy_r >= 0 ? '+' : ''}{res().actual.expectancy_r.toFixed(3)}R / trade
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold text-slate-300">
                      {res().percentiles.net_r_pct.toFixed(1)}th
                    </div>
                    <div class="text-[11px] text-slate-500">Percentile</div>
                  </div>
                </div>
                <div class="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                  <span>Random p50: <strong class="text-slate-200">{res().random_baseline.net_r_p50.toFixed(1)}R</strong></span>
                  <span>Random p95: <strong class="text-slate-200">{res().random_baseline.net_r_p95.toFixed(1)}R</strong></span>
                </div>
              </div>
            </div>

            {/* Histogram + Kelly / Optimal-f Row */}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monte Carlo Net R Histogram */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Monte Carlo Net R Distribution ({res().eligible_trades} Trades × {res().iterations.toLocaleString()} Runs)
                    </h3>
                    <p class="text-[11px] text-slate-500">
                      Simulated random-entry outcomes on the same historical bars
                    </p>
                  </div>
                </div>

                <Show
                  when={res().histogram.length > 0}
                  fallback={
                    <div class="h-44 flex items-center justify-center text-xs text-slate-500">
                      No bar replay histogram available for current scope.
                    </div>
                  }
                >
                  <div class="h-44 flex items-end gap-1 pt-4 pb-1 px-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <For each={res().histogram}>
                      {(bin) => {
                        const heightPct = Math.max(3, (bin.count / maxHistCount()) * 100);
                        const containsActual =
                          res().actual.net_r >= bin.bin_start &&
                          res().actual.net_r <= bin.bin_end;
                        const aboveP95 = bin.bin_start >= res().random_baseline.net_r_p95;
                        return (
                          <div
                            class="flex-1 h-full flex flex-col justify-end items-center group relative"
                            title={`[${bin.bin_start.toFixed(1)}R, ${bin.bin_end.toFixed(1)}R]: ${bin.count} runs`}
                          >
                            <div
                              style={{ height: `${heightPct}%` }}
                              class={`w-full rounded-t transition-all ${
                                containsActual
                                  ? 'bg-blue-500 ring-2 ring-blue-300/60'
                                  : aboveP95
                                    ? 'bg-emerald-500/70 group-hover:bg-emerald-400'
                                    : 'bg-slate-700/80 group-hover:bg-slate-600'
                              }`}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                  <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>p5: {res().random_baseline.net_r_p5.toFixed(1)}R</span>
                    <span>p50: {res().random_baseline.net_r_p50.toFixed(1)}R</span>
                    <span class="text-emerald-400">p95: {res().random_baseline.net_r_p95.toFixed(1)}R</span>
                    <span class="text-blue-400 font-bold">Actual: {res().actual.net_r.toFixed(1)}R</span>
                  </div>
                </Show>
              </div>

              {/* Kelly & Optimal-f Sizing */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Position Sizing: Kelly Criterion &amp; Optimal-f
                    </h3>
                    <p class="text-[11px] text-slate-500">
                      Theoretical geometric growth vs. practical fractional risk (Current: {res().sizing.current_risk_pct.toFixed(2)}% / 1R)
                    </p>
                  </div>
                  <Coins size={16} class="text-amber-400" />
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                    <div class="text-[10px] text-slate-400 uppercase">Full Kelly</div>
                    <div class="text-base font-bold text-slate-200 mt-0.5">
                      {res().sizing.full_kelly_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                    <div class="text-[10px] text-slate-400 uppercase">Half Kelly</div>
                    <div class="text-base font-bold text-emerald-400 mt-0.5">
                      {res().sizing.half_kelly_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                    <div class="text-[10px] text-slate-400 uppercase">Quarter Kelly</div>
                    <div class="text-base font-bold text-blue-400 mt-0.5">
                      {res().sizing.quarter_kelly_pct.toFixed(2)}%
                    </div>
                  </div>
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                    <div class="text-[10px] text-slate-400 uppercase">0.25× Optimal-f</div>
                    <div class="text-base font-bold text-amber-400 mt-0.5">
                      {res().sizing.quarter_optimal_f_risk_pct.toFixed(2)}%
                    </div>
                    <div class="text-[10px] text-slate-500">
                      Full f*: {res().sizing.optimal_f_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <Show when={res().sizing.twr_curve.length > 0}>
                  <div class="space-y-1">
                    <div class="flex justify-between text-[10px] text-slate-400">
                      <span>TWR(f) Growth Curve</span>
                      <span>Peak TWR: <strong class="text-slate-200">{res().sizing.max_twr.toFixed(2)}×</strong></span>
                    </div>
                    <div class="h-20 flex items-end gap-0.5 px-1 pt-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                      <For each={res().sizing.twr_curve}>
                        {(pt) => {
                          const h = Math.max(4, (pt.twr / maxTwr()) * 100);
                          const isPeak = Math.abs(pt.twr - res().sizing.max_twr) < 0.01;
                          return (
                            <div
                              style={{ height: `${h}%` }}
                              title={`f=${pt.f_pct}% -> TWR=${pt.twr}x`}
                              class={`flex-1 rounded-t ${isPeak ? 'bg-amber-400' : 'bg-blue-500/60'}`}
                            />
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={res().verdict !== 'significant_edge'}>
                  <div class="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    Caution: Sizing up with Kelly or Optimal-f assumes verified positive edge (p &lt; 0.05).
                  </div>
                </Show>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};
