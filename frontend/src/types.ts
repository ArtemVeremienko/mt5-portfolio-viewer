export type MetricMode = 'currency' | 'pct' | 'r';
export type TradeScope = 'all' | 'last100';

export interface AccountInfo {
  login: number;
  broker: string;
  name: string;
  server?: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin?: number;
  free_margin?: number;
  margin_level?: number;
  is_demo?: number;
  is_connected?: boolean;
}

export interface SQNRating {
  category: string;
  badge: string;
}

export interface PortfolioStats {
  gain_pct: number;
  abs_gain_pct: number;
  daily_gain_pct: number;
  monthly_gain_pct: number;
  max_drawdown_pct: number;
  current_drawdown_pct?: number;
  max_drawdown_amount: number;
  max_drawdown_r: number;
  balance: number;
  equity: number;
  highest_balance: number;
  total_profit: number;
  total_swap: number;
  total_commission: number;
  deposits: number;
  withdrawals: number;
  total_trades: number;
  won_trades: number;
  lost_trades: number;
  breakeven_trades?: number;
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
  sortino_ratio?: number;
  calmar_ratio?: number;
  recovery_factor?: number;
  half_kelly_pct?: number;
  max_consecutive_wins?: number;
  max_consecutive_losses?: number;
  max_dd_duration_days?: number;
  sl_verified_count?: number;
  sl_estimated_count?: number;
  today_profit?: number;
  week_profit?: number;
  month_profit?: number;
  today_r?: number;
  week_r?: number;
  month_r?: number;
  expectancy: number;
  avg_win: number;
  avg_loss: number;
  best_trade: number;
  worst_trade: number;
  long_trades: number;
  long_won: number;
  long_win_rate: number;
  short_trades: number;
  short_won: number;
  short_win_rate: number;
  // Van Tharp
  total_r: number;
  sqn: number;
  sqn_rating: SQNRating;
  r_expectancy: number;
  r_std_dev: number;
  avg_win_r: number;
  avg_loss_r: number;
  best_trade_r: number;
  worst_trade_r: number;
  // Advanced Statistics
  profitability_won_pct?: number;
  profitability_lost_pct?: number;
  total_pips?: number;
  avg_win_pips?: number;
  avg_loss_pips?: number;
  total_lots?: number;
  best_trade_date?: string;
  worst_trade_date?: string;
  best_trade_pips?: number;
  best_trade_pips_date?: string;
  worst_trade_pips?: number;
  worst_trade_pips_date?: string;
  avg_trade_length_seconds?: number;
  avg_trade_length_str?: string;
  profit_std_dev?: number;
  z_score?: number;
  z_score_p_value?: number;
  expectancy_pips?: number;
  ahpr_pct?: number;
  ghpr_pct?: number;
  // Sample Size & Scope
  is_sample_developing?: boolean;
  sample_trades?: number;
  min_sample_target?: number;
  benchmark_target?: number;
  trade_scope?: string;
  available_closed_trades?: number;
}

export interface CurvePoint {
  timestamp: number;
  balance: number;
  equity: number;
  profit: number;
  growth_pct: number;
  equity_growth_pct?: number;
  drawdown_pct: number;
  cumulative_r: number;
  r_drawdown: number;
  change_pct?: number;
  change_amount?: number;
  change_r?: number;
}

export interface MonthInfo {
  profit: number;
  r: number;
  pct: number;
  trades: number;
}

export interface MonthlyRow {
  year: number;
  months: Record<number, MonthInfo | null>;
  total_profit: number;
  total_r: number;
  total_pct: number;
}

export interface SymbolStat {
  symbol: string;
  trades: number;
  profit: number;
  r: number;
  win_rate: number;
}

export interface HourlyStat {
  hour: number;
  trades: number;
  won: number;
  lost: number;
  profit: number;
  r: number;
}

export interface DayOfWeekStat {
  day: string;
  trades: number;
  won: number;
  lost: number;
  profit: number;
  r: number;
}

export interface CalendarDeal {
  ticket: number;
  symbol: string;
  type: number;
  type_str: string;
  volume: number;
  open_price: number;
  close_price: number;
  open_time: number;
  close_time: number;
  duration_seconds: number;
  duration_str: string;
  profit: number;
  pips: number;
  commission: number;
  r_multiple: number;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  profit: number;
  r: number;
  trades: number;
  won: number;
  lost: number;
  win_rate: number;
  deals: CalendarDeal[];
}

export interface CurrencySummaryItem {
  symbol: string;
  long_trades: number;
  long_pips: number;
  long_profit: number;
  short_trades: number;
  short_pips: number;
  short_profit: number;
  total_trades: number;
  total_pips: number;
  total_profit: number;
  won_count: number;
  lost_count: number;
  won_pct: number;
  lost_pct: number;
}

export interface DurationTrade {
  ticket: number;
  symbol: string;
  type: number;
  type_str: string;
  open_time: number;
  close_time: number;
  duration_seconds: number;
  duration_str: string;
  profit: number;
  pips: number;
  r_multiple: number;
  is_winner: boolean;
}

export interface RiskOfRuinItem {
  loss_size_pct: number;
  probability: string;
  consecutive_losses: number;
}

export interface MonthlyCurrency {
  symbol: string;
  trades: number;
  popularity_pct: number;
  reward_risk_ratio: number;
  is_all_wins: boolean;
  avg_long_duration_sec: number;
  avg_long_duration_str: string;
  avg_short_duration_sec: number;
  avg_short_duration_str: string;
  avg_total_duration_sec: number;
  avg_total_duration_str: string;
  long_trades: number;
  short_trades: number;
  profit: number;
  pips: number;
  lots: number;
}

export interface MonthlyAnalyticsItem {
  year: number;
  month: number;
  month_name: string;
  short_name: string;
  change_pct: number;
  profit: number;
  lots: number;
  pips: number;
  trades: number;
  won: number;
  lost: number;
  currencies: MonthlyCurrency[];
}

export interface RDistributionBucket {
  bucket: string;
  count: number;
  pct: number;
}

export interface TradeDeal {
  ticket: number;
  order_id: number;
  account_id: number;
  time: number;
  open_time?: number;
  type: number; // 0=BUY, 1=SELL
  symbol: string;
  volume: number;
  price: number;
  open_price: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  comment: string;
  magic?: number;
  pips?: number;
  risk_r: number;
  r_multiple: number;
  net_profit?: number;
  mae_amount?: number;
  mfe_amount?: number;
  mae_pips?: number;
  mfe_pips?: number;
  mae_r?: number;
  mfe_r?: number;
  risk_source?: 'sl' | 'balance_pct';
  sl_diff_pts?: number;
  note?: string;
  setup_tag?: string;
  mistake_tag?: string;
}

export interface ExcursionTrade {
  ticket: number;
  symbol: string;
  time: number;
  type: number;
  volume: number;
  net_profit: number;
  r_multiple: number;
  mae_pips: number;
  mfe_pips: number;
  mae_amount: number;
  mfe_amount: number;
  mae_r: number;
  mfe_r: number;
}

export interface ExcursionStats {
  optimal_sl_pips: number;
  optimal_sl_amount: number;
  optimal_sl_r: number;
  mfe_capture_efficiency_pct: number;
  avg_mae_pips: number;
  avg_mae_amount: number;
  avg_mae_r: number;
  avg_mfe_pips: number;
  avg_mfe_amount: number;
  avg_mfe_r: number;
  trades: ExcursionTrade[];
}

export interface OpenPosition {
  ticket: number;
  time: number;
  type: number;
  type_str: string;
  symbol: string;
  volume: number;
  open_price: number;
  current_price: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  magic?: number;
  pips?: number;
}

export interface CashflowItem {
  ticket: number;
  time: number;
  amount: number;
  type: 'Deposit' | 'Withdrawal';
  comment: string;
  magic?: number;
  pips?: number;
  balance_after: number;
}

export interface PortfolioData {
  account: AccountInfo;
  stats: PortfolioStats;
  curves: CurvePoint[];
  monthly_matrix: MonthlyRow[];
  monthly_analytics?: MonthlyAnalyticsItem[];
  symbol_stats: SymbolStat[];
  hourly_stats: HourlyStat[];
  day_of_week_stats: DayOfWeekStat[];
  calendar_days?: CalendarDay[];
  currency_summary?: CurrencySummaryItem[];
  duration_trades?: DurationTrade[];
  risk_of_ruin?: RiskOfRuinItem[];
  r_distribution: RDistributionBucket[];
  excursion_stats: ExcursionStats;
  cashflows?: CashflowItem[];
  available_symbols?: string[];
  available_comments?: string[];
  available_magics?: number[];
  closed_trades: TradeDeal[];
}
