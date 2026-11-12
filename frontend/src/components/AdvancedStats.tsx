import { Component, createSignal, For, Show } from 'solid-js';
import { 
  PortfolioStats, 
  CurrencySummaryItem, 
  HourlyStat, 
  DayOfWeekStat, 
  RiskOfRuinItem, 
  DurationTrade, 
  MetricMode 
} from '../types';
import { 
  BarChart3, 
  Clock, 
  Calendar, 
  ShieldAlert, 
  Hourglass, 
  Layers
} from 'lucide-solid';

interface AdvancedStatsProps {
  stats: PortfolioStats | null;
  currencySummary: CurrencySummaryItem[];
  hourly: HourlyStat[];
  days: DayOfWeekStat[];
  riskOfRuin: RiskOfRuinItem[];
  durationTrades: DurationTrade[];
  mode: MetricMode;
}

export const AdvancedStats: Component<AdvancedStatsProps> = (props) => {
  const [activeSubTab, setActiveSubTab] = createSignal<
    'trades' | 'summary' | 'hourly' | 'daily' | 'ruin' | 'duration'
  >('trades');

  // Hourly chart display toggle: trade counts vs net profit
  const [hourlyViewMode, setHourlyViewMode] = createSignal<'counts' | 'profit'>('counts');

  // Tooltip state for Duration scatter plot (bulletproof viewport fixed coordinates)
  const [hoveredDurationTrade, setHoveredDurationTrade] = createSignal<DurationTrade | null>(null);
  const [durationMousePos, setDurationMousePos] = createSignal<{ x: number; y: number; placeBelow: boolean }>({ x: 0, y: 0, placeBelow: false });
  let durationLeaveTimer: any = null;

  const handleDurationPointEnter = (e: MouseEvent, t: DurationTrade) => {
    if (durationLeaveTimer) {
      clearTimeout(durationLeaveTimer);
      durationLeaveTimer = null;
    }
    const target = e.currentTarget as SVGElement;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top;

    const clampedX = Math.max(140, Math.min(window.innerWidth - 140, centerX));
    const placeBelow = centerY < 170;
    const clampedY = placeBelow ? (rect.bottom + 12) : (centerY - 12);

    setDurationMousePos({ x: clampedX, y: clampedY, placeBelow });
    setHoveredDurationTrade(t);
  };

  const handleDurationPointLeave = () => {
    if (durationLeaveTimer) clearTimeout(durationLeaveTimer);
    durationLeaveTimer = setTimeout(() => {
      setHoveredDurationTrade(null);
    }, 80);
  };

  const s = () => props.stats;

  const formatMoney = (val: number) => {
    return (val >= 0 ? '$' : '-$') + Math.abs(val).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatPipsOrMoney = (pips: number, money: number) => {
    if (props.mode === 'r') {
      return (money >= 0 ? '+' : '') + money.toFixed(2) + 'R';
    }
    return `${pips >= 0 ? '' : ''}${pips.toFixed(1)} pips / ${formatMoney(money)}`;
  };

  // Dynamic Hourly Range: 1 hour buffer before first column and after last column
  const activeHourlyStats = () => {
    const list = props.hourly || [];
    const withTrades = list.filter(h => h.trades > 0);
    if (!withTrades.length) return list;
    const minH = Math.min(...withTrades.map(h => h.hour));
    const maxH = Math.max(...withTrades.map(h => h.hour));
    const startH = Math.max(0, minH - 1); // 1 hour buffer before
    const endH = Math.min(23, maxH + 1);   // 1 hour buffer after
    return list.filter(h => h.hour >= startH && h.hour <= endH);
  };

  // Dynamic Daily Range: remove empty days
  const activeDailyStats = () => {
    const list = props.days || [];
    const withTrades = list.filter(d => d.trades > 0);
    return withTrades.length > 0 ? withTrades : list;
  };

  return (
    <div class="space-y-4">
      {/* Sub-tab Navigation Bar */}
      <div class="flex items-center gap-1.5 bg-slate-900/95 border border-slate-800 p-1.5 rounded-2xl shadow-xl backdrop-blur-sm overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('trades')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'trades'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <BarChart3 size={15} />
          <span>Trades</span>
        </button>

        <button
          onClick={() => setActiveSubTab('summary')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'summary'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers size={15} />
          <span>Summary</span>
        </button>

        <button
          onClick={() => setActiveSubTab('hourly')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'hourly'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Clock size={15} />
          <span>Hourly</span>
        </button>

        <button
          onClick={() => setActiveSubTab('daily')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'daily'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Calendar size={15} />
          <span>Daily</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ruin')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'ruin'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/30'
              : 'text-rose-400 hover:text-rose-200 hover:bg-rose-950/30'
          }`}
        >
          <ShieldAlert size={15} />
          <span>Risk of Ruin</span>
        </button>

        <button
          onClick={() => setActiveSubTab('duration')}
          class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeSubTab() === 'duration'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Hourglass size={15} />
          <span>Duration</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. TRADES TAB (Clean table-like UI, no horizontal line overlap)*/}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'trades'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            
            {/* Column 1 */}
            <div class="space-y-0.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Trades:</span>
                <span class="font-bold text-white text-sm font-mono">{s()?.total_trades || 0}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Profitability:</span>
                <div class="w-32 flex items-center gap-1.5">
                  <div class="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div 
                      class="bg-emerald-500 h-full transition-all duration-500" 
                      style={{ width: `${s()?.profitability_won_pct || s()?.win_rate || 0}%` }} 
                      title={`Won: ${(s()?.profitability_won_pct || s()?.win_rate || 0).toFixed(1)}%`}
                    />
                    <div 
                      class="bg-rose-500 h-full transition-all duration-500" 
                      style={{ width: `${s()?.profitability_lost_pct || (100 - (s()?.win_rate || 0))}%` }} 
                      title={`Lost: ${(s()?.profitability_lost_pct || (100 - (s()?.win_rate || 0))).toFixed(1)}%`}
                    />
                  </div>
                  <span class="text-[10px] text-slate-300 font-mono font-bold">
                    {(s()?.profitability_won_pct || s()?.win_rate || 0).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Pips:</span>
                <span class="font-bold text-white font-mono">{s()?.total_pips?.toFixed(1) || '0.0'}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Average Win:</span>
                <span class="font-bold text-emerald-400 font-mono">
                  {props.mode === 'r'
                    ? `${(s()?.avg_win_r ?? 0) >= 0 ? '+' : ''}${(s()?.avg_win_r ?? 0).toFixed(2)}R`
                    : formatPipsOrMoney(s()?.avg_win_pips || 0, s()?.avg_win || 0)}
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Average Loss:</span>
                <span class="font-bold text-rose-400 font-mono">
                  {props.mode === 'r'
                    ? `${(s()?.avg_loss_r ?? 0).toFixed(2)}R`
                    : `-${Math.abs(s()?.avg_loss_pips || 0).toFixed(1)} pips / -${formatMoney(Math.abs(s()?.avg_loss || 0))}`}
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Lots:</span>
                <span class="font-bold text-white font-mono">{s()?.total_lots?.toFixed(2) || '0.00'}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Commissions:</span>
                <span class="font-bold text-slate-300 font-mono">
                  {s()?.total_commission ? `-$${Math.abs(s()!.total_commission).toFixed(2)}` : '$0.00'}
                </span>
              </div>
            </div>

            {/* Column 2 */}
            <div class="space-y-0.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Longs Won:</span>
                <div class="font-mono text-slate-200">
                  <span class="text-slate-400">({s()?.long_won || 0}/{s()?.long_trades || 0})</span>{' '}
                  <span class="font-bold text-emerald-400">{s()?.long_win_rate?.toFixed(0) || 0}%</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Shorts Won:</span>
                <div class="font-mono text-slate-200">
                  <span class="text-slate-400">({s()?.short_won || 0}/{s()?.short_trades || 0})</span>{' '}
                  <span class="font-bold text-emerald-400">{s()?.short_win_rate?.toFixed(0) || 0}%</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Best Trade ($):</span>
                <div class="font-mono">
                  <Show when={s()?.best_trade_date}>
                    <span class="text-slate-500 text-[11px] mr-1">({s()?.best_trade_date})</span>
                  </Show>
                  <span class="font-bold text-emerald-400">+{s()?.best_trade?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Worst Trade ($):</span>
                <div class="font-mono">
                  <Show when={s()?.worst_trade_date}>
                    <span class="text-slate-500 text-[11px] mr-1">({s()?.worst_trade_date})</span>
                  </Show>
                  <span class="font-bold text-rose-400">-{Math.abs(s()?.worst_trade || 0).toFixed(2)}</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Best Trade (Pips):</span>
                <div class="font-mono">
                  <Show when={s()?.best_trade_pips_date}>
                    <span class="text-slate-500 text-[11px] mr-1">({s()?.best_trade_pips_date})</span>
                  </Show>
                  <span class="font-bold text-emerald-400">+{s()?.best_trade_pips?.toFixed(1) || '0.0'}</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Worst Trade (Pips):</span>
                <div class="font-mono">
                  <Show when={s()?.worst_trade_pips_date}>
                    <span class="text-slate-500 text-[11px] mr-1">({s()?.worst_trade_pips_date})</span>
                  </Show>
                  <span class="font-bold text-rose-400">-{Math.abs(s()?.worst_trade_pips || 0).toFixed(1)}</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium">Avg. Trade Length:</span>
                <span class="font-bold text-slate-200 font-mono">{s()?.avg_trade_length_str || '0m'}</span>
              </div>
            </div>

            {/* Column 3 (Clean dotted underline tooltips with zero divider interference) */}
            <div class="space-y-0.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Gross Profit divided by Gross Loss">
                  Profit Factor:
                </span>
                <span class="font-bold text-white font-mono text-sm">{s()?.profit_factor?.toFixed(2) || '0.00'}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Standard deviation of trade net profits">
                  Standard Deviation:
                </span>
                <span class="font-bold text-white font-mono">${s()?.profit_std_dev?.toFixed(3) || '0.000'}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Annualized Sharpe ratio based on trade returns">
                  Sharpe Ratio:
                </span>
                <span class="font-bold text-white font-mono">{s()?.sharpe_ratio?.toFixed(2) || '0.00'}</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Z-Score streak randomness test and probability of non-randomness">
                  Z-Score (Probability):
                </span>
                <span class="font-bold text-slate-200 font-mono">
                  {s()?.z_score?.toFixed(2) || '0.00'} ({s()?.z_score_p_value?.toFixed(2) || '0.00'}%)
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Expected mathematical edge per trade">
                  Expectancy:
                </span>
                <span class="font-bold text-slate-200 font-mono">
                  {s()?.expectancy_pips?.toFixed(1) || '0.0'} Pips / ${s()?.expectancy?.toFixed(2) || '0.00'}
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Average Holding Period Return per trade">
                  AHPR:
                </span>
                <span class="font-bold text-slate-200 font-mono">{s()?.ahpr_pct?.toFixed(2) || '0.00'}%</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Geometric Holding Period Return per trade">
                  GHPR:
                </span>
                <span class="font-bold text-slate-200 font-mono">{s()?.ghpr_pct?.toFixed(2) || '0.00'}%</span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Downside-risk-adjusted annualized return (penalizes only negative days)">
                  Sortino / Calmar:
                </span>
                <span class="font-bold text-slate-200 font-mono">
                  {s()?.sortino_ratio?.toFixed(2) || '0.00'} / {s()?.calmar_ratio?.toFixed(2) || '0.00'}
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Net Profit divided by Max Drawdown ($), and Half-Kelly optimal risk %">
                  Recovery / Half-Kelly:
                </span>
                <span class="font-bold text-slate-200 font-mono">
                  {s()?.recovery_factor?.toFixed(2) || '0.00'}x / {s()?.half_kelly_pct?.toFixed(1) || '0.0'}%
                </span>
              </div>

              <div class="flex justify-between items-center py-2 px-2.5 rounded-lg hover:bg-slate-800/30 transition-colors">
                <span class="text-slate-400 font-medium pb-0.5 border-b border-dotted border-slate-500 hover:border-slate-300 cursor-help" title="Longest consecutive win/loss streak and longest drawdown duration in days">
                  Streaks (W/L) / Max DD Dur.:
                </span>
                <span class="font-bold text-slate-200 font-mono">
                  {s()?.max_consecutive_wins ?? 0}W / {s()?.max_consecutive_losses ?? 0}L ({s()?.max_dd_duration_days?.toFixed(1) ?? '0.0'}d)
                </span>
              </div>
            </div>

          </div>
        </div>
      </Show>

      {/* ------------------------------------------------------------- */}
      {/* 2. SUMMARY TAB (Clear vertical separators between sections)   */}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'summary'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="text-[11px] border-b border-slate-800">
                <th class="py-2.5 px-3 font-semibold text-slate-400 border-r-2 border-slate-700/80 w-32">
                  Currency
                </th>
                
                {/* Longs Header Group */}
                <th class="py-2.5 px-2 text-center font-bold text-blue-400 bg-blue-950/30 border-r-2 border-slate-700/80" colspan="3">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                    Longs
                  </span>
                </th>

                {/* Shorts Header Group */}
                <th class="py-2.5 px-2 text-center font-bold text-amber-400 bg-amber-950/30 border-r-2 border-slate-700/80" colspan="3">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                    Shorts
                  </span>
                </th>

                {/* Total Header Group */}
                <th class="py-2.5 px-2 text-center font-bold text-slate-200 bg-slate-800/40" colspan="5">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
                    Total
                  </span>
                </th>
              </tr>

              <tr class="text-[10px] text-slate-500 border-b border-slate-800 bg-slate-950/50">
                <th class="py-1.5 px-3 border-r-2 border-slate-700/80"></th>
                
                {/* Longs subheaders */}
                <th class="py-1.5 px-2.5 text-right bg-blue-950/15">Trades</th>
                <th class="py-1.5 px-2.5 text-right bg-blue-950/15">Pips</th>
                <th class="py-1.5 px-2.5 text-right bg-blue-950/15 border-r-2 border-slate-700/80">Profit($)</th>

                {/* Shorts subheaders */}
                <th class="py-1.5 px-2.5 text-right bg-amber-950/15">Trades</th>
                <th class="py-1.5 px-2.5 text-right bg-amber-950/15">Pips</th>
                <th class="py-1.5 px-2.5 text-right bg-amber-950/15 border-r-2 border-slate-700/80">Profit($)</th>

                {/* Total subheaders */}
                <th class="py-1.5 px-2.5 text-right">Trades</th>
                <th class="py-1.5 px-2.5 text-right">Pips</th>
                <th class="py-1.5 px-2.5 text-right">Profit($)</th>
                <th class="py-1.5 px-3 text-center">Won(%)</th>
                <th class="py-1.5 px-3 text-center">Lost(%)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-mono">
              <For each={props.currencySummary}>
                {(row) => (
                  <tr class="hover:bg-slate-800/30 transition-colors">
                    <td class="py-3 px-3 font-bold text-white text-xs border-r-2 border-slate-700/80">
                      {row.symbol}
                    </td>
                    
                    {/* Longs Cells */}
                    <td class="py-3 px-2.5 text-right text-slate-300 bg-blue-950/10">{row.long_trades}</td>
                    <td class={`py-3 px-2.5 text-right font-medium bg-blue-950/10 ${row.long_pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.long_pips.toFixed(1)}
                    </td>
                    <td class={`py-3 px-2.5 text-right font-medium bg-blue-950/10 border-r-2 border-slate-700/80 ${row.long_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.long_profit.toFixed(2)}
                    </td>

                    {/* Shorts Cells */}
                    <td class="py-3 px-2.5 text-right text-slate-300 bg-amber-950/10">{row.short_trades}</td>
                    <td class={`py-3 px-2.5 text-right font-medium bg-amber-950/10 ${row.short_pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.short_pips.toFixed(1)}
                    </td>
                    <td class={`py-3 px-2.5 text-right font-medium bg-amber-950/10 border-r-2 border-slate-700/80 ${row.short_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.short_profit.toFixed(2)}
                    </td>

                    {/* Total Cells */}
                    <td class="py-3 px-2.5 text-right font-bold text-white">{row.total_trades}</td>
                    <td class={`py-3 px-2.5 text-right font-bold ${row.total_pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.total_pips.toFixed(1)}
                    </td>
                    <td class={`py-3 px-2.5 text-right font-bold ${row.total_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.total_profit.toFixed(2)}
                    </td>

                    {/* Won & Lost Badges */}
                    <td class="py-3 px-3 text-center">
                      <span class="inline-block px-2.5 py-1 rounded bg-[#133026] text-emerald-300 font-bold text-[11px] border border-emerald-500/20">
                        {row.won_count} ({row.won_pct.toFixed(0)}%)
                      </span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <span class="inline-block px-2.5 py-1 rounded bg-[#35181c] text-rose-300 font-bold text-[11px] border border-rose-500/20">
                        {row.lost_count} ({row.lost_pct.toFixed(0)}%)
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      {/* ------------------------------------------------------------- */}
      {/* 3. HOURLY TAB (Fitted to actual data with 1h buffer)          */}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'hourly'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 class="text-xs font-bold text-white uppercase tracking-wider">Hourly Performance Distribution</h4>
              <p class="text-[11px] text-slate-400">
                Fitted to active trading window ({activeHourlyStats()[0]?.hour ?? 0}:00 to {activeHourlyStats()[activeHourlyStats().length - 1]?.hour ?? 23}:00 UTC)
              </p>
            </div>
            
            {/* View Mode Toggle */}
            <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setHourlyViewMode('counts')}
                class={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  hourlyViewMode() === 'counts' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Trade Counts (Win/Loss)
              </button>
              <button
                onClick={() => setHourlyViewMode('profit')}
                class={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  hourlyViewMode() === 'profit' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Net Profit ($)
              </button>
            </div>
          </div>

          {/* Trading Sessions Breakdown (Tokyo / London / New York) */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <For each={[
              { name: 'Tokyo / Asia', window: '00:00–08:59 UTC', hours: [0,1,2,3,4,5,6,7,8] },
              { name: 'London', window: '07:00–15:59 UTC', hours: [7,8,9,10,11,12,13,14,15] },
              { name: 'New York', window: '12:00–20:59 UTC', hours: [12,13,14,15,16,17,18,19,20] },
            ]}>
              {(sess) => {
                const stats = () => {
                  const rows = (props.hourly || []).filter(h => sess.hours.includes(h.hour));
                  const trades = rows.reduce((a, b) => a + b.trades, 0);
                  const won = rows.reduce((a, b) => a + b.won, 0);
                  const profit = rows.reduce((a, b) => a + b.profit, 0);
                  const r = rows.reduce((a, b) => a + b.r, 0);
                  const wr = trades > 0 ? (won / trades) * 100 : 0;
                  return { trades, wr, profit, r };
                };
                return (
                  <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                    <div>
                      <div class="font-bold text-slate-200">{sess.name}</div>
                      <div class="text-[10px] text-slate-500 font-mono">{sess.window}</div>
                      <div class="text-[10px] text-slate-400 mt-1">{stats().trades} trades • {stats().wr.toFixed(0)}% WR</div>
                    </div>
                    <div class="text-right font-mono">
                      <div class={`font-bold ${stats().profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats().profit >= 0 ? '+$' : '-$'}{Math.abs(stats().profit).toFixed(2)}
                      </div>
                      <div class="text-[10px] text-purple-300">{stats().r >= 0 ? '+' : ''}{stats().r.toFixed(2)}R</div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          {/* SVG Stacked Bar Chart */}
          {(() => {
            const hStats = activeHourlyStats();
            const count = hStats.length || 1;
            const maxTrades = Math.max(1, ...hStats.map(h => h.trades));
            const maxProfit = Math.max(1, ...hStats.map(h => Math.abs(h.profit)));

            // Dynamic layout calculations to fill the chart cleanly
            const svgWidth = 860;
            const leftPad = 60;
            const rightPad = 40;
            const usableWidth = svgWidth - leftPad - rightPad;
            const step = usableWidth / count;
            const barWidth = Math.min(54, Math.max(28, step * 0.65));

            return (
              <div class="relative">
                <svg viewBox={`0 0 ${svgWidth} 260`} class="w-full h-64 overflow-visible">
                  {/* Grid lines */}
                  <line x1={leftPad} y1="20" x2={svgWidth - rightPad} y2="20" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                  <line x1={leftPad} y1="75" x2={svgWidth - rightPad} y2="75" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                  <line x1={leftPad} y1="130" x2={svgWidth - rightPad} y2="130" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                  <line x1={leftPad} y1="185" x2={svgWidth - rightPad} y2="185" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                  <line x1={leftPad} y1="230" x2={svgWidth - rightPad} y2="230" stroke="#334155" stroke-width="1.5" />

                  {/* Bars for active hours */}
                  <For each={hStats}>
                    {(h, i) => {
                      const xCenter = leftPad + (i() * step) + (step / 2);
                      const x = xCenter - (barWidth / 2);

                      if (hourlyViewMode() === 'counts') {
                        const totalHeight = (h.trades / maxTrades) * 190;
                        const winHeight = h.trades > 0 ? (h.won / h.trades) * totalHeight : 0;
                        const lossHeight = totalHeight - winHeight;
                        const yBase = 230;

                        return (
                          <g class="group cursor-pointer">
                            {/* Loser portion (purple top) */}
                            <Show when={lossHeight > 0}>
                              <rect
                                x={x}
                                y={yBase - totalHeight}
                                width={barWidth}
                                height={lossHeight}
                                fill="#8b5cf6"
                                rx="3"
                                class="transition-all hover:opacity-80"
                              />
                            </Show>

                            {/* Winner portion (green bottom) */}
                            <Show when={winHeight > 0}>
                              <rect
                                x={x}
                                y={yBase - winHeight}
                                width={barWidth}
                                height={winHeight}
                                fill="#84cc16"
                                rx="3"
                                class="transition-all hover:opacity-80"
                              />
                            </Show>

                            {/* Trade count on top */}
                            <Show when={h.trades > 0}>
                              <text
                                x={xCenter}
                                y={yBase - totalHeight - 6}
                                text-anchor="middle"
                                fill="#f1f5f9"
                                font-size="11"
                                font-family="monospace"
                                font-weight="bold"
                              >
                                {h.trades}
                              </text>
                            </Show>

                            {/* Hour label */}
                            <text
                              x={xCenter}
                              y="248"
                              text-anchor="middle"
                              fill={h.trades > 0 ? '#94a3b8' : '#475569'}
                              font-size="11"
                              font-family="monospace"
                              font-weight={h.trades > 0 ? '600' : '400'}
                            >
                              {String(h.hour).padStart(2, '0')}:00
                            </text>
                          </g>
                        );
                      } else {
                        // Profit View
                        const isProf = h.profit >= 0;
                        const barH = (Math.abs(h.profit) / maxProfit) * 190;
                        const y = 230 - barH;

                        return (
                          <g class="group cursor-pointer">
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barH}
                              fill={isProf ? '#10b981' : '#f43f5e'}
                              rx="3"
                              class="transition-all hover:opacity-80"
                            />
                            <Show when={h.trades > 0}>
                              <text
                                x={xCenter}
                                y={y - 6}
                                text-anchor="middle"
                                fill={isProf ? '#34d399' : '#fb7185'}
                                font-size="10"
                                font-family="monospace"
                                font-weight="bold"
                              >
                                {h.profit >= 0 ? '+' : ''}{h.profit.toFixed(2)}
                              </text>
                            </Show>
                            <text
                              x={xCenter}
                              y="248"
                              text-anchor="middle"
                              fill={h.trades > 0 ? '#94a3b8' : '#475569'}
                              font-size="11"
                              font-family="monospace"
                              font-weight={h.trades > 0 ? '600' : '400'}
                            >
                              {String(h.hour).padStart(2, '0')}:00
                            </text>
                          </g>
                        );
                      }
                    }}
                  </For>
                </svg>

                {/* Legend */}
                <div class="flex items-center justify-center gap-6 pt-2 border-t border-slate-800/80 text-xs font-medium">
                  <Show when={hourlyViewMode() === 'counts'} fallback={
                    <div class="flex items-center gap-6">
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded bg-emerald-500 inline-block" />
                        <span class="text-slate-300">Profitable Hours</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded bg-rose-500 inline-block" />
                        <span class="text-slate-300">Losing Hours</span>
                      </div>
                    </div>
                  }>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded bg-[#84cc16] inline-block" />
                      <span class="text-slate-300">Winners</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded bg-[#8b5cf6] inline-block" />
                      <span class="text-slate-300">Losers</span>
                    </div>
                  </Show>
                </div>
              </div>
            );
          })()}
        </div>
      </Show>

      {/* ------------------------------------------------------------- */}
      {/* 4. DAILY TAB (Empty days removed, fitting active trading days) */}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'daily'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div class="text-center">
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">Winners Vs. Losers</h4>
            <p class="text-[11px] text-slate-400">Trade distribution across active trading days</p>
          </div>

          {(() => {
            const dStats = activeDailyStats();
            const count = dStats.length || 1;
            const maxTrades = Math.max(5, ...dStats.map(d => d.trades));

            const svgWidth = 800;
            const leftPad = 60;
            const rightPad = 40;
            const usableWidth = svgWidth - leftPad - rightPad;
            const step = usableWidth / count;
            const barWidth = Math.min(80, Math.max(48, step * 0.55));

            return (
              <div class="relative py-2">
                <svg viewBox={`0 0 ${svgWidth} 280`} class="w-full h-72 overflow-visible">
                  {/* Grid lines */}
                  <For each={[0, 0.25, 0.5, 0.75, 1.0]}>
                    {(ratio) => {
                      const y = 230 - (ratio * 180);
                      const val = Math.round(ratio * maxTrades);
                      return (
                        <g>
                          <line x1={leftPad} y1={y} x2={svgWidth - rightPad} y2={y} stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                          <text x={leftPad - 12} y={y + 4} text-anchor="end" fill="#64748b" font-size="10" font-family="monospace">
                            {val}
                          </text>
                        </g>
                      );
                    }}
                  </For>
                  <line x1={leftPad} y1="230" x2={svgWidth - rightPad} y2="230" stroke="#334155" stroke-width="1.5" />

                  {/* Active Day Bars */}
                  <For each={dStats}>
                    {(day, i) => {
                      const xCenter = leftPad + (i() * step) + (step / 2);
                      const x = xCenter - (barWidth / 2);
                      const totalH = (day.trades / maxTrades) * 180;
                      const winH = day.trades > 0 ? (day.won / day.trades) * totalH : 0;
                      const lossH = totalH - winH;
                      const yBase = 230;

                      return (
                        <g class="group cursor-pointer">
                          {/* Losers (Purple Top) */}
                          <Show when={lossH > 0}>
                            <rect
                              x={x}
                              y={yBase - totalH}
                              width={barWidth}
                              height={lossH}
                              fill="#8b5cf6"
                              rx="3"
                              class="transition-all hover:opacity-85"
                            />
                          </Show>

                          {/* Winners (Lime Green Bottom) */}
                          <Show when={winH > 0}>
                            <rect
                              x={x}
                              y={yBase - winH}
                              width={barWidth}
                              height={winH}
                              fill="#84cc16"
                              rx="3"
                              class="transition-all hover:opacity-85"
                            />
                          </Show>

                          {/* Trade count on top of bar */}
                          <Show when={day.trades > 0}>
                            <text
                              x={xCenter}
                              y={yBase - totalH - 6}
                              text-anchor="middle"
                              fill="#f8fafc"
                              font-size="12"
                              font-family="monospace"
                              font-weight="bold"
                            >
                              {day.trades}
                            </text>
                          </Show>

                          {/* Day label */}
                          <text
                            x={xCenter}
                            y="252"
                            text-anchor="middle"
                            fill="#94a3b8"
                            font-size="12"
                            font-weight="600"
                          >
                            {day.day}
                          </text>
                        </g>
                      );
                    }}
                  </For>
                </svg>

                {/* Legend */}
                <div class="flex items-center justify-center gap-8 pt-4 border-t border-slate-800/80 text-xs font-semibold">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-[#84cc16] inline-block shadow-sm shadow-lime-500/30" />
                    <span class="text-slate-300">Winners</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-[#8b5cf6] inline-block shadow-sm shadow-purple-500/30" />
                    <span class="text-slate-300">Losers</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </Show>

      {/* ------------------------------------------------------------- */}
      {/* 5. RISK OF RUIN TAB                                           */}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'ruin'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div class="overflow-x-auto">
            <table class="w-full text-center border-collapse">
              <tbody>
                {/* Row 1: Loss Size */}
                <tr class="border-b border-slate-800/80">
                  <td class="text-left py-3 px-4 text-xs font-semibold text-slate-300 whitespace-nowrap">
                    Loss Size
                  </td>
                  <For each={props.riskOfRuin || []}>
                    {(col) => (
                      <td class="py-3 px-3 font-mono font-bold text-xs bg-[#40181d]/90 text-rose-200 border-l border-slate-800">
                        {col.loss_size_pct}%
                      </td>
                    )}
                  </For>
                </tr>

                {/* Row 2: Probability of Loss */}
                <tr class="border-b border-slate-800/80">
                  <td class="text-left py-3 px-4 text-xs font-semibold text-slate-300 whitespace-nowrap">
                    Probability of Loss
                  </td>
                  <For each={props.riskOfRuin || []}>
                    {(col) => (
                      <td 
                        class="py-3 px-3 font-mono text-xs bg-[#36161a]/90 text-rose-300 border-l border-slate-800 cursor-help transition-colors hover:bg-rose-950"
                        title={`Probability of losing ${col.loss_size_pct}% of capital based on your historical edge`}
                      >
                        {col.probability}
                      </td>
                    )}
                  </For>
                </tr>

                {/* Row 3: Consecutive Losing Trades */}
                <tr>
                  <td class="text-left py-3 px-4 text-xs font-semibold text-slate-300 whitespace-nowrap">
                    Consecutive Losing Trades
                  </td>
                  <For each={props.riskOfRuin || []}>
                    {(col) => (
                      <td 
                        class="py-3 px-3 font-mono font-bold text-xs bg-[#2d1417]/90 text-white border-l border-slate-800 cursor-help transition-colors hover:bg-rose-950"
                        title={`It would take ${col.consecutive_losses} consecutive losses to reach a ${col.loss_size_pct}% drawdown.`}
                      >
                        {col.consecutive_losses}
                      </td>
                    )}
                  </For>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="text-center pt-2">
            <p class="text-xs text-slate-500 italic">
              Hover over the desired column for a detailed explanation.
            </p>
          </div>
        </div>
      </Show>

      {/* ------------------------------------------------------------- */}
      {/* 6. DURATION TAB (Fixed floating non-jumping tooltips)         */}
      {/* ------------------------------------------------------------- */}
      <Show when={activeSubTab() === 'duration'}>
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div class="text-center">
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider">Duration (Profit)</h4>
            <p class="text-[11px] text-slate-400">Trade holding time vs net profit payoff asymmetry</p>
          </div>

          {(() => {
            const trades = props.durationTrades || [];
            const maxDuration = Math.max(300, ...trades.map(t => t.duration_seconds));
            const profits = trades.map(t => t.profit);
            const minProfit = profits.length ? Math.min(0, ...profits) : -1.0;
            const maxProfit = profits.length ? Math.max(1, ...profits) : 1.0;
            const profitRange = Math.max(0.1, maxProfit - minProfit);

            return (
              <div class="relative py-2">
                <svg viewBox="0 0 900 320" class="w-full h-80 overflow-visible">
                  {/* Y-axis grid and zero line */}
                  <For each={[0, 0.25, 0.5, 0.75, 1.0]}>
                    {(ratio) => {
                      const y = 260 - (ratio * 220);
                      const pVal = minProfit + (ratio * profitRange);
                      return (
                        <g>
                          <line x1="50" y1={y} x2="870" y2={y} stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                          <text x="40" y={y + 4} text-anchor="end" fill="#64748b" font-size="10" font-family="monospace">
                            {pVal >= 0 ? '$' : '-$'}{Math.abs(pVal).toFixed(2)}
                          </text>
                        </g>
                      );
                    }}
                  </For>

                  {/* Horizontal 0 Profit Line */}
                  {(() => {
                    const zeroRatio = (0 - minProfit) / profitRange;
                    const zeroY = 260 - (zeroRatio * 220);
                    return (
                      <line x1="50" y1={zeroY} x2="870" y2={zeroY} stroke="#475569" stroke-width="1.5" />
                    );
                  })()}

                  {/* X-axis ticks (duration) */}
                  <For each={[0.25, 0.5, 0.75, 1.0]}>
                    {(ratio) => {
                      const x = 50 + (ratio * 820);
                      const sec = Math.round(ratio * maxDuration);
                      const label = sec < 3600 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 3600)}h`;
                      return (
                        <g>
                          <line x1={x} y1="40" x2={x} y2="260" stroke="#1e293b" stroke-width="1" stroke-dasharray="3 3" />
                          <text x={x} y="280" text-anchor="middle" fill="#64748b" font-size="10" font-family="monospace">
                            {label}
                          </text>
                        </g>
                      );
                    }}
                  </For>

                  {/* Scatter Points with smooth mouseenter / mouseleave */}
                  <For each={trades}>
                    {(t) => {
                      const x = 50 + ((t.duration_seconds / maxDuration) * 820);
                      const profitRatio = (t.profit - minProfit) / profitRange;
                      const y = 260 - (profitRatio * 220);
                      const isHovered = () => hoveredDurationTrade()?.ticket === t.ticket;
                      const size = () => (isHovered() ? 8.5 : 6.0);

                      return (
                        <g 
                          class="cursor-pointer"
                          onMouseEnter={(e) => handleDurationPointEnter(e, t)}
                          onMouseLeave={handleDurationPointLeave}
                        >
                          {/* Invisible hit-area circle to prevent mouse flicker */}
                          <circle cx={x} cy={y} r="14" fill="transparent" />

                          <Show when={t.is_winner} fallback={
                            /* Losing Trade: Red Circle */
                            <circle
                              cx={x}
                              cy={y}
                              r={isHovered() ? 7.5 : 5.5}
                              fill="#f43f5e"
                              fill-opacity={isHovered() ? 1.0 : 0.85}
                              stroke={isHovered() ? '#ffffff' : '#881337'}
                              stroke-width={isHovered() ? 2.5 : 1.5}
                              class="transition-colors duration-150"
                            />
                          }>
                            {/* Winning Trade: Green Diamond */}
                            <polygon
                              points={`${x},${y - size()} ${x + size()},${y} ${x},${y + size()} ${x - size()},${y}`}
                              fill="#10b981"
                              fill-opacity={isHovered() ? 1.0 : 0.85}
                              stroke={isHovered() ? '#ffffff' : '#064e3b'}
                              stroke-width={isHovered() ? 2.5 : 1.5}
                              class="transition-colors duration-150"
                            />
                          </Show>
                        </g>
                      );
                    }}
                  </For>
                </svg>

                {/* Legend */}
                <div class="flex items-center justify-center gap-8 pt-3 border-t border-slate-800/80 text-xs font-semibold">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rotate-45 bg-emerald-500 inline-block shadow-sm shadow-emerald-500/30" />
                    <span class="text-slate-300">Winners</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-sm shadow-rose-500/30" />
                    <span class="text-slate-300">Losers</span>
                  </div>
                </div>

                <div class="text-center mt-3">
                  <p class="text-[11px] text-slate-500">
                    Data includes last {trades.length} transactions based on the analysed history.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </Show>

      {/* Floating Hover Tooltip for Duration Scatter Plot (Zero Jumping) */}
      <Show when={hoveredDurationTrade()}>
        {(t) => (
          <div
            style={{
              position: 'fixed',
              left: `${durationMousePos().x}px`,
              top: `${durationMousePos().y}px`,
              transform: durationMousePos().placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              'pointer-events': 'none',
              'z-index': 9999,
            }}
            class="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl text-xs space-y-1.5 w-64 backdrop-blur-md pointer-events-none select-none transition-transform duration-75 ease-out animate-in fade-in"
          >
            <div class="flex items-center justify-between border-b border-slate-800 pb-1.5 font-mono">
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-white text-xs">{t().symbol}</span>
                <span class="text-slate-500 text-[10px]">#{t().ticket}</span>
              </div>
              <span class={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                t().type === 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {t().type_str}
              </span>
            </div>
            <div class="flex justify-between font-mono">
              <span class="text-slate-400">Duration:</span>
              <span class="font-bold text-white">{t().duration_str}</span>
            </div>
            <div class="flex justify-between font-mono">
              <span class="text-slate-400">Net Profit:</span>
              <span class={`font-bold ${t().profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {t().profit >= 0 ? '+$' : '-$'}{Math.abs(t().profit).toFixed(2)} ({t().r_multiple >= 0 ? '+' : ''}{t().r_multiple.toFixed(2)}R)
              </span>
            </div>
            <div class="flex justify-between font-mono">
              <span class="text-slate-400">Pips:</span>
              <span class={`font-bold ${t().pips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {t().pips >= 0 ? '+' : ''}{t().pips.toFixed(1)} pips
              </span>
            </div>
          </div>
        )}
      </Show>

    </div>
  );
};
