export type MetricMode = 'currency' | 'pct' | 'r';

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
  win_rate: number;
  profit_factor: number;
  sharpe_ratio: number;
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
}

export interface CurvePoint {
  timestamp: number;
  balance: number;
  equity: number;
  profit: number;
  growth_pct: number;
  drawdown_pct: number;
  cumulative_r: number;
  r_drawdown: number;
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
  profit: number;
  r: number;
}

export interface DayOfWeekStat {
  day: string;
  trades: number;
  profit: number;
  r: number;
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
  risk_r: number;
  r_multiple: number;
  net_profit?: number;
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
}

export interface PortfolioData {
  account: AccountInfo;
  stats: PortfolioStats;
  curves: CurvePoint[];
  monthly_matrix: MonthlyRow[];
  symbol_stats: SymbolStat[];
  hourly_stats: HourlyStat[];
  day_of_week_stats: DayOfWeekStat[];
  r_distribution: RDistributionBucket[];
  closed_trades: TradeDeal[];
}
