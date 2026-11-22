import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { formatOrdinal } from '../utils/formatters';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Coins,
  Dices,
  Gauge,
  Info,
  Play,
  ShieldAlert,
  TrendingUp,
} from 'lucide-solid';
import { runStrategyBenchmark } from '../api/portfolio';
import type {
  AuditStats,
  BenchmarkBarTf,
  BenchmarkFallbackMode,
  BenchmarkMode,
  BenchmarkResponse,
  ExcursionStats,
  TradeScope,
} from '../types';

interface BenchmarkPanelProps {
  excursionStats: ExcursionStats | null;
  auditStats: AuditStats | null;
  activeLogin: number | null;
  allAccounts: boolean;
  symbol: string;
  direction: string;
  comment: string;
  magic: string;
  setupTag: string;
  excludeMistakes: boolean;
  revengeWindowMin: number;
  onRevengeWindowChange: (min: number) => void;
  scope: TradeScope;
}

function formatSignedR(val: number, decimals = 2): string {
  const fixed = Math.abs(val) < 10 ** -(decimals + 1) ? 0 : val;
  if (fixed > 0) return `+${fixed.toFixed(decimals)}R`;
  if (fixed < 0) return `-${Math.abs(fixed).toFixed(decimals)}R`;
  return `${(0).toFixed(decimals)}R`;
}

function formatEdgeRatio(val: number | null | undefined): string {
  if (val === null) return '∞ (0 MAE)';
  if (val === undefined) return '0.00';
  return val.toFixed(2);
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
  const [executedConfigKey, setExecutedConfigKey] = createSignal<string>('');
  let latestRunId = 0;

  const currentConfigKey = createMemo(() =>
    JSON.stringify([
      barTf(),
      horizonBars(),
      iterations(),
      mode(),
      fallbackMode(),
      atrMult(),
      fixedRr(),
      includeCosts(),
    ]),
  );

  const isParamsStale = createMemo(
    () => Boolean(executedConfigKey()) && executedConfigKey() !== currentConfigKey(),
  );

  const executeSimulation = async () => {
    const runId = ++latestRunId;
    const snapKey = currentConfigKey();
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
        setup_tag: props.setupTag || undefined,
        exclude_mistakes: props.excludeMistakes,
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
      if (runId === latestRunId) {
        setResult(res);
        setExecutedConfigKey(snapKey);
      }
    } catch (e) {
      if (runId === latestRunId) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === 'string'
              ? e
              : 'Failed to run benchmark simulation.';
        setErrorMsg(msg);
      }
    } finally {
      if (runId === latestRunId) {
        setIsRunning(false);
      }
    }
  };

  onMount(() => {
    void executeSimulation();
  });

  createEffect(
    on(
      [
        () => props.activeLogin,
        () => props.allAccounts,
        () => props.symbol,
        () => props.direction,
        () => props.comment,
        () => props.magic,
        () => props.setupTag,
        () => props.excludeMistakes,
        () => props.scope,
      ],
      () => {
        void executeSimulation();
      },
      { defer: true },
    ),
  );

  const maxHistCount = createMemo(() => {
    const bins = result()?.histogram || [];
    return Math.max(1, ...bins.map((b) => b.count));
  });

  const histRange = createMemo(() => {
    const bins = result()?.histogram || [];
    const first = bins[0];
    const last = bins[bins.length - 1];
    if (!first || !last) return { min: 0, max: 0 };
    return {
      min: first.bin_start,
      max: last.bin_end,
    };
  });

  const isActualOffScale = createMemo(() => {
    const res = result();
    const bins = res?.histogram || [];
    const first = bins[0];
    const last = bins[bins.length - 1];
    if (!res || !first || !last) return null;
    if (res.actual.net_r > last.bin_end) return 'above';
    if (res.actual.net_r < first.bin_start) return 'below';
    return null;
  });

  const maxTwr = createMemo(() => {
    const curve = result()?.sizing.twr_curve || [];
    return Math.max(1.01, ...curve.map((p) => p.twr));
  });

  const inTradeEdgeRatio = createMemo<number | null>(() => {
    const res = result();
    if (res) return res.actual.in_trade_edge_ratio;
    return props.excursionStats?.edge_ratio ?? 0;
  });

  const modeDescription = createMemo(() => {
    switch (mode()) {
      case 'coin_flip_direction':
        return 'Random 50/50 BUY/SELL at each trade’s exact open time.';
      case 'window_jitter':
        return 'Random direction + random entry bar offset (−20 / +10 bars around open).';
      case 'random_session':
        return 'Random direction + random bar sampled from your active UTC session hours.';
    }
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
              <h2 class="text-sm font-bold text-slate-100 flex flex-wrap items-center gap-2">
                <span>Coin-Flip Baseline &amp; Edge Ratio Benchmark</span>
                <Show when={props.auditStats}>
                  {(audit) => (
                    <span
                      title={
                        audit().system_classification === 'poker'
                          ? 'Net Expectancy > 0R with ≥ 30 trades (overall expectancy, independent of Monte Carlo p-value)'
                          : audit().system_classification === 'roulette'
                            ? 'Net Expectancy ≤ 0R with ≥ 30 trades'
                            : 'Fewer than 30 trades — sample size still developing'
                      }
                      class={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-help ${
                        audit().system_classification === 'poker'
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : audit().system_classification === 'roulette'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {audit().system_classification === 'poker'
                        ? 'Poker (+EV)'
                        : audit().system_classification === 'roulette'
                          ? 'Roulette (E ≤ 0)'
                          : 'Developing (<30)'}
                    </span>
                  )}
                </Show>
              </h2>
              <p class="text-[11px] text-slate-400">
                Monte Carlo random-entry simulation on historical OHLC bars + Kelly / Optimal-f sizing
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <Show when={isParamsStale() && !isRunning()}>
              <span class="text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1">
                Parameters changed — click Run Simulation
              </span>
            </Show>
            <button
              type="button"
              disabled={isRunning()}
              onClick={() => void executeSimulation()}
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 text-white shadow-md transition-all ${
                isParamsStale()
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30 ring-2 ring-amber-400/50'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
              }`}
            >
              <Play size={14} />
              <span>{isRunning() ? 'Simulating...' : 'Run Simulation'}</span>
            </button>
          </div>
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
            <span
              class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold"
              title="Number of bars scanned forward after entry (ignoring SL/TP) to measure pure entry Edge Ratio"
            >
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

          <label class="flex flex-col gap-1" title={modeDescription()}>
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
              <span>Entry Mode</span>
              <Info size={11} class="text-slate-500" />
            </span>
            <select
              value={mode()}
              onChange={(e) => setMode(e.currentTarget.value as BenchmarkMode)}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="coin_flip_direction">50/50 Direction</option>
              <option value="window_jitter">Window Jitter + Dir</option>
              <option value="random_session">Random Session Bars</option>
            </select>
          </label>

          <label
            class="flex flex-col gap-1"
            title="Exit rule used for trades that lacked an explicit SL or TP on the MT5 order"
          >
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              No-SL/TP Fallback
            </span>
            <select
              value={fallbackMode()}
              onChange={(e) => setFallbackMode(e.currentTarget.value as BenchmarkFallbackMode)}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="realized_1r">Realized 1R (Default)</option>
              <option value="atr">ATR(14) Override</option>
              <option value="fixed_rr">Fixed R:R Override</option>
            </select>
          </label>

          <div class="flex flex-col justify-end gap-1">
            <label
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer select-none"
              title="Deduct recorded commission + swap normalized by 1R on simulated trades"
            >
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

        <div class="mt-2 text-[11px] text-slate-500">{modeDescription()}</div>

        <Show when={fallbackMode() === 'atr' || fallbackMode() === 'fixed_rr'}>
          <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-4 text-xs">
            <Show when={fallbackMode() === 'atr'}>
              <label class="flex items-center gap-2">
                <span class="text-slate-400">ATR(14) Multiplier (SL = N × ATR):</span>
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
              <span class="text-slate-400">Target R:R (TP = N × SL):</span>
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
          <div class={`space-y-4 transition-opacity ${isRunning() ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* Skipped trades notice */}
            <Show when={(res().skipped_trades ?? 0) > 0 && res().eligible_trades > 0}>
              <div class="flex items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2 text-[11px] text-slate-300">
                <Info size={14} class="text-blue-400 shrink-0" />
                <span>
                  Evaluated <strong>{res().eligible_trades}</strong> of{' '}
                  <strong>{res().total_trades}</strong> trades ({res().skipped_trades} skipped due to missing {res().timeframe.toUpperCase()} OHLC bars).
                </span>
              </div>
            </Show>

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
                      Your strategy outperforms {formatOrdinal(res().percentiles.net_r_pct)} percentile of {res().iterations.toLocaleString()} random-entry runs on the same historical bars with a {res().horizon_bars}-bar E-ratio of {formatEdgeRatio(res().actual.horizon_edge_ratio)}.
                    </div>
                  </div>
                </div>
              </Match>
              <Match when={res().verdict === 'mixed_signal'}>
                <div class="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3 text-xs text-blue-200">
                  <Info size={18} class="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div class="font-bold text-blue-300">
                      Mixed Signal: Net R Beats Random (p = {res().percentiles.p_value_net_r.toFixed(3)}), Low Horizon E-Ratio ({formatEdgeRatio(res().actual.horizon_edge_ratio)})
                    </div>
                    <div class="text-blue-200/80 mt-0.5">
                      Your Net R ranks at the {formatOrdinal(res().percentiles.net_r_pct)} percentile, but {res().horizon_bars}-bar uncapped E-Ratio is below 1.25 — suggesting edge comes from trade management / exits rather than immediate entry timing.
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
                      Open a trade chart or connect MT5 so historical {res().timeframe.toUpperCase()} candles can be cached for Monte Carlo bar replay. In-trade E-ratio ({formatEdgeRatio(inTradeEdgeRatio())}) and Kelly / Optimal-f sizing are still computed below.
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
                      Your entries rank at the {formatOrdinal(res().percentiles.net_r_pct)} percentile of random runs. Current results may be driven by market drift or R:R mechanics rather than entry timing.
                    </div>
                  </div>
                </div>
              </Match>
            </Switch>

            <Show when={res().percentiles.win_rate_pct >= 95 && res().percentiles.net_r_pct < 50 && res().eligible_trades >= 20}>
              <div class="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2 text-[11px] text-amber-200">
                <AlertTriangle size={14} class="text-amber-400 shrink-0" />
                <span>
                  Win Rate beats {formatOrdinal(res().percentiles.win_rate_pct)} pct of random entries, but Net R sits at {formatOrdinal(res().percentiles.net_r_pct)} pct — average loss size / R:R is eroding your entry timing edge.
                </span>
              </div>
            </Show>

            {/* Primary KPI Comparison Grid */}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Edge Ratio Card */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div
                  class="flex items-center justify-between text-xs text-slate-400"
                  title="Uncapped MFE / MAE over N bars after entry vs. In-Trade MFE / MAE from entry to actual exit"
                >
                  <span class="font-semibold uppercase tracking-wider">Edge Ratio (MFE / MAE)</span>
                  <TrendingUp size={15} class="text-blue-400" />
                </div>
                <div class="flex items-baseline justify-between">
                  <div>
                    <div class="text-2xl font-extrabold text-slate-100">
                      {res().actual.horizon_edge_ratio === null
                        ? '∞ (0 MAE)'
                        : res().actual.horizon_edge_ratio! > 0
                          ? formatEdgeRatio(res().actual.horizon_edge_ratio)
                          : formatEdgeRatio(inTradeEdgeRatio())}
                    </div>
                    <div class="text-[11px] text-slate-400">
                      {res().horizon_bars}-bar Uncapped ({res().actual.horizon_avg_mfe_r.toFixed(2)}R / {res().actual.horizon_avg_mae_r.toFixed(2)}R)
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
                  <span title="MFE / MAE measured strictly between entry and actual exit">
                    In-Trade E-Ratio: <strong class="text-slate-200">{formatEdgeRatio(inTradeEdgeRatio())}</strong>
                  </span>
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
                      {formatOrdinal(res().percentiles.win_rate_pct)} pct vs. random
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold text-slate-300">
                      {res().actual.breakeven_win_rate.toFixed(1)}%
                    </div>
                    <div class="text-[11px] text-slate-500">
                      Breakeven (Avg R:R {res().actual.avg_rr.toFixed(2)})
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
                        res().actual.net_r > 0
                          ? 'text-emerald-400'
                          : res().actual.net_r < 0
                            ? 'text-rose-400'
                            : 'text-slate-200'
                      }`}
                    >
                      {formatSignedR(res().actual.net_r, 2)}
                    </div>
                    <div class="text-[11px] text-slate-400">
                      Expectancy: {formatSignedR(res().actual.expectancy_r, 3)} / trade
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-sm font-bold text-slate-300">
                      {formatOrdinal(res().percentiles.net_r_pct)}
                    </div>
                    <div class="text-[11px] text-slate-500">Percentile</div>
                  </div>
                </div>
                <div class="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                  <span>Random p50: <strong class="text-slate-200">{formatSignedR(res().random_baseline.net_r_p50, 1)}</strong></span>
                  <span>Random p95: <strong class="text-slate-200">{formatSignedR(res().random_baseline.net_r_p95, 1)}</strong></span>
                </div>
              </div>
            </div>

            {/* Histogram + Kelly / Optimal-f Row */}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monte Carlo Net R Histogram */}
              <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Monte Carlo Net R Distribution ({res().eligible_trades} {res().eligible_trades === 1 ? 'Trade' : 'Trades'} × {res().iterations.toLocaleString()} Runs)
                    </h3>
                    <p class="text-[11px] text-slate-500">
                      Simulated random-entry outcomes on the same historical bars
                    </p>
                  </div>
                  <Show when={isActualOffScale()}>
                    {(dir) => (
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        Actual {formatSignedR(res().actual.net_r, 2)} ({dir() === 'above' ? 'above max bin →' : '← below min bin'})
                      </span>
                    )}
                  </Show>
                </div>

                <Show
                  when={res().histogram.length > 0}
                  fallback={
                    <div class="h-44 flex items-center justify-center text-xs text-slate-500">
                      No bar replay histogram available for current scope.
                    </div>
                  }
                >
                  <div class="relative">
                    <div class="flex justify-between text-[10px] text-slate-500 font-mono mb-1">
                      <span>Max freq: {maxHistCount()} runs</span>
                      <span>
                        Range: {formatSignedR(histRange().min, 1)} to {formatSignedR(histRange().max, 1)}
                      </span>
                    </div>
                    <div class="h-40 flex items-end gap-1 pt-3 pb-1 px-1 bg-slate-950/60 rounded-xl border border-slate-800/80">
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
                              title={`[${bin.bin_start.toFixed(1)}R, ${bin.bin_end.toFixed(1)}R]: ${bin.count} ${bin.count === 1 ? 'run' : 'runs'}`}
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
                  </div>
                  <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-800/70">
                    <div class="flex items-center gap-3 font-mono">
                      <span>p5: {formatSignedR(res().random_baseline.net_r_p5, 1)}</span>
                      <span>p50: {formatSignedR(res().random_baseline.net_r_p50, 1)}</span>
                      <span class="text-emerald-400">p95: {formatSignedR(res().random_baseline.net_r_p95, 1)}</span>
                      <span class="text-blue-400 font-bold">Actual: {formatSignedR(res().actual.net_r, 2)}</span>
                    </div>
                    <div class="flex items-center gap-2.5 text-[10px] text-slate-500">
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-blue-500 inline-block" /> Actual</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-emerald-500/70 inline-block" /> ≥ p95</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-slate-700 inline-block" /> Random</span>
                    </div>
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
                      Assumed 1R baseline: {res().sizing.current_risk_pct.toFixed(2)}% / trade
                    </p>
                  </div>
                  <Coins size={16} class="text-amber-400" />
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div
                    class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5"
                    title="Win% − (Loss% ÷ AvgWinR/AvgLossR)"
                  >
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
                  <div
                    class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5"
                    title="0.25× Optimal-f converted to % account risk per 1R trade (f* ÷ |Worst Loss R| × 0.25)"
                  >
                    <div class="text-[10px] text-slate-400 uppercase">0.25× Opt-f Risk</div>
                    <div class="text-base font-bold text-amber-400 mt-0.5">
                      {res().sizing.quarter_optimal_f_risk_pct.toFixed(2)}%
                    </div>
                    <div class="text-[10px] text-slate-500">
                      Full f*: {res().sizing.optimal_f_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <Show
                  when={res().sizing.twr_curve.length > 0}
                  fallback={
                    <div class="h-20 flex items-center justify-center text-[11px] text-slate-500 bg-slate-950/60 rounded-xl border border-slate-800/80 px-3 text-center">
                      No positive Terminal Wealth Relative (TWR) growth curve when Optimal-f = 0%.
                    </div>
                  }
                >
                  <div class="space-y-1">
                    <div class="flex justify-between text-[10px] text-slate-400">
                      <span>Terminal Wealth Relative TWR(f) · f = 4% to 96%</span>
                      <span>
                        Peak TWR: <strong class="text-slate-200">{res().sizing.max_twr.toFixed(2)}×</strong>
                      </span>
                    </div>
                    <div class="h-20 flex items-end gap-0.5 px-1 pt-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                      <For each={res().sizing.twr_curve}>
                        {(pt) => {
                          const h = Math.max(4, (pt.twr / maxTwr()) * 100);
                          const isPeak = Math.abs(pt.twr - res().sizing.max_twr) < 0.01;
                          return (
                            <div
                              style={{ height: `${h}%` }}
                              title={`f=${pt.f_pct}% of worst loss -> TWR=${pt.twr}x`}
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
          </div>
        )}
      </Show>

      {/* System Audit & Process Discipline Section */}
      <Show when={props.auditStats}>
        {(audit) => (
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. In-Sample vs Out-of-Sample Survival */}
            <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                    In-Sample vs. Out-of-Sample Survival
                  </h3>
                  <p class="text-[11px] text-slate-500">
                    50/50 chronological split &amp; rolling {audit().oos_survival.rolling_window_size}-trade windows
                  </p>
                </div>
                <Show when={audit().oos_survival.eligible}>
                  <span
                    class={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      audit().oos_survival.oos_survived
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {audit().oos_survival.oos_survived ? 'OOS Survived' : 'OOS Failed'}
                  </span>
                </Show>
              </div>

              <Show
                when={audit().oos_survival.eligible}
                fallback={
                  <div class="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    Requires at least {audit().oos_survival.min_trades_required} closed trades to run In-Sample vs. Out-of-Sample split.
                  </div>
                }
              >
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1">
                    <div class="text-[10px] uppercase text-slate-400 font-semibold">
                      In-Sample ({audit().oos_survival.in_sample.count})
                    </div>
                    <div
                      class={`text-base font-bold ${
                        audit().oos_survival.in_sample.expectancy_r > 0
                          ? 'text-emerald-400'
                          : audit().oos_survival.in_sample.expectancy_r < 0
                            ? 'text-rose-400'
                            : 'text-slate-200'
                      }`}
                    >
                      {formatSignedR(audit().oos_survival.in_sample.expectancy_r, 3)}
                      <span class="text-[10px] font-normal text-slate-400"> / trade</span>
                    </div>
                    <div class="text-[10px] text-slate-400">
                      WR {audit().oos_survival.in_sample.win_rate.toFixed(1)}% · PF{' '}
                      {audit().oos_survival.in_sample.profit_factor.toFixed(2)}
                    </div>
                  </div>

                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1">
                    <div class="text-[10px] uppercase text-slate-400 font-semibold">
                      Out-of-Sample ({audit().oos_survival.out_of_sample.count})
                    </div>
                    <div
                      class={`text-base font-bold ${
                        audit().oos_survival.out_of_sample.expectancy_r > 0
                          ? 'text-emerald-400'
                          : audit().oos_survival.out_of_sample.expectancy_r < 0
                            ? 'text-rose-400'
                            : 'text-slate-200'
                      }`}
                    >
                      {formatSignedR(audit().oos_survival.out_of_sample.expectancy_r, 3)}
                      <span class="text-[10px] font-normal text-slate-400"> / trade</span>
                    </div>
                    <div class="text-[10px] text-slate-400">
                      WR {audit().oos_survival.out_of_sample.win_rate.toFixed(1)}% · PF{' '}
                      {audit().oos_survival.out_of_sample.profit_factor.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div class="pt-2 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                  <span>
                    Rolling {audit().oos_survival.rolling_window_size}-Trade Windows Positive:{' '}
                    <strong class="text-slate-200">
                      {audit().oos_survival.rolling_positive_pct.toFixed(1)}%
                    </strong>
                  </span>
                  <span>
                    Decay:{' '}
                    <strong class="text-slate-200">
                      {(() => {
                        const deg = audit().oos_survival.degradation_pct;
                        return deg === null ? 'N/A (IS ≤ 0)' : `${deg.toFixed(1)}%`;
                      })()}
                    </strong>
                  </span>
                </div>
              </Show>
            </div>

            {/* 2. Execution-Drift Detectors */}
            <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Execution-Drift Detectors
                  </h3>
                  <p class="text-[11px] text-slate-500">
                    SL widening (&gt;15% past SL) &amp; post-loss revenge sizing
                  </p>
                </div>
                <select
                  aria-label="Revenge Window"
                  value={String(props.revengeWindowMin)}
                  onChange={(e) => props.onRevengeWindowChange(Number(e.currentTarget.value))}
                  class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
                  title="Time window after a loss to flag ≥1.25× size increases"
                >
                  <option value="30">30m window</option>
                  <option value="60">1h window</option>
                  <option value="90">1.5h window</option>
                  <option value="120">2h window</option>
                </select>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs">
                <div
                  class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1"
                  title="SL-verified trades losing more than 1.15R or tagged 'Moved SL'"
                >
                  <div class="text-[10px] uppercase text-slate-400 font-semibold">SL Widened</div>
                  <div
                    class={`text-lg font-extrabold ${
                      audit().execution_drift.sl_widened_count > 0
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {audit().execution_drift.sl_widened_count}
                    <span class="text-xs font-normal text-slate-400 ml-1">
                      ({audit().execution_drift.sl_widened_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-500">
                    Extra loss beyond -1R:{' '}
                    {audit().execution_drift.sl_widened_extra_r > 0
                      ? `-${audit().execution_drift.sl_widened_extra_r.toFixed(2)}R`
                      : '0.00R'}
                  </div>
                </div>

                <div
                  class="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 space-y-1"
                  title="Trades opened within the selected window after a loss with ≥1.25× volume/risk, or tagged Revenge / Oversized"
                >
                  <div class="text-[10px] uppercase text-slate-400 font-semibold">
                    Revenge Sizing
                  </div>
                  <div
                    class={`text-lg font-extrabold ${
                      audit().execution_drift.revenge_count > 0
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {audit().execution_drift.revenge_count}
                    <span class="text-xs font-normal text-slate-400 ml-1">
                      ({audit().execution_drift.revenge_pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-500">
                    Net impact: {formatSignedR(audit().execution_drift.revenge_net_r, 2)}
                  </div>
                </div>
              </div>
              <div class="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
                Flags trades ≥1.25× prior volume/risk within {audit().execution_drift.revenge_window_min}m of a loss or tagged Moved SL / Revenge / Oversized.
              </div>
            </div>

            {/* 3. 2x2 Process vs Outcome Matrix */}
            <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Process vs. Outcome Matrix
                </h3>
                <p class="text-[11px] text-slate-500">
                  Classifies trades by journal mistake tags &amp; process grades
                </p>
              </div>

              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5">
                  <div class="text-[10px] uppercase text-emerald-300 font-semibold">
                    Disciplined Win
                  </div>
                  <div class="text-[10px] text-emerald-300/60">No mistakes · Win</div>
                  <div class="text-base font-bold text-emerald-200 mt-0.5">
                    {audit().process_matrix.disciplined_win.count}
                    <span class="text-[10px] font-normal text-emerald-300/80 ml-1">
                      ({audit().process_matrix.disciplined_win.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-emerald-300/80">
                    {formatSignedR(audit().process_matrix.disciplined_win.net_r, 2)}
                  </div>
                </div>

                <div class="bg-blue-500/10 border border-blue-500/25 rounded-xl p-2.5">
                  <div class="text-[10px] uppercase text-blue-300 font-semibold">
                    Disciplined Loss
                  </div>
                  <div class="text-[10px] text-blue-300/60">No mistakes · Loss</div>
                  <div class="text-base font-bold text-blue-200 mt-0.5">
                    {audit().process_matrix.disciplined_loss.count}
                    <span class="text-[10px] font-normal text-blue-300/80 ml-1">
                      ({audit().process_matrix.disciplined_loss.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-blue-300/80">
                    {formatSignedR(audit().process_matrix.disciplined_loss.net_r, 2)}
                  </div>
                </div>

                <div class="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5">
                  <div class="text-[10px] uppercase text-amber-300 font-semibold">
                    Lucky Gamble
                  </div>
                  <div class="text-[10px] text-amber-300/60">Mistake/C-grade · Win</div>
                  <div class="text-base font-bold text-amber-200 mt-0.5">
                    {audit().process_matrix.lucky_gamble.count}
                    <span class="text-[10px] font-normal text-amber-300/80 ml-1">
                      ({audit().process_matrix.lucky_gamble.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-amber-300/80">
                    {formatSignedR(audit().process_matrix.lucky_gamble.net_r, 2)}
                  </div>
                </div>

                <div class="bg-rose-500/10 border border-rose-500/25 rounded-xl p-2.5">
                  <div class="text-[10px] uppercase text-rose-300 font-semibold">
                    Self-Inflicted Loss
                  </div>
                  <div class="text-[10px] text-rose-300/60">Mistake/C-grade · Loss</div>
                  <div class="text-base font-bold text-rose-200 mt-0.5">
                    {audit().process_matrix.self_inflicted_loss.count}
                    <span class="text-[10px] font-normal text-rose-300/80 ml-1">
                      ({audit().process_matrix.self_inflicted_loss.pct.toFixed(0)}%)
                    </span>
                  </div>
                  <div class="text-[10px] text-rose-300/80">
                    {formatSignedR(audit().process_matrix.self_inflicted_loss.net_r, 2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
