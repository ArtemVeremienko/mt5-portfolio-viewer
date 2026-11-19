import { fetchJson } from './client';
import type {
  AccountInfo,
  BenchmarkRequest,
  BenchmarkResponse,
  OpenPosition,
  PortfolioData,
  TradeScope,
} from '../types';

export interface AccountsResponse {
  accounts: AccountInfo[];
  active_login: number | null;
  mt5_connected: boolean;
}

export interface PortfolioQueryParams {
  allAccounts?: boolean;
  timeframe?: string;
  symbol?: string;
  direction?: string;
  comment?: string;
  magic?: number | null;
  scope?: TradeScope;
  riskPct?: number;
}

export function getAccounts(): Promise<AccountsResponse> {
  return fetchJson<AccountsResponse>('/api/accounts');
}

export function switchAccount(login: number): Promise<{ status: string; active_login: number }> {
  return fetchJson(`/api/accounts/switch?login=${login}`, { method: 'POST' });
}

export function syncAccount(): Promise<{ status: string; synced_login: number | null }> {
  return fetchJson('/api/sync', { method: 'POST' });
}

export function getPortfolio(params: PortfolioQueryParams): Promise<PortfolioData> {
  const qs = new URLSearchParams();
  if (params.allAccounts) qs.set('all_accounts', 'true');
  if (params.timeframe && params.timeframe !== 'all') qs.set('timeframe', params.timeframe);
  if (params.symbol) qs.set('symbol', params.symbol);
  if (params.direction) qs.set('direction', params.direction);
  if (params.comment) qs.set('comment', params.comment);
  if (params.magic !== null && params.magic !== undefined) qs.set('magic', String(params.magic));
  if (params.scope) qs.set('scope', params.scope);
  if (params.riskPct !== undefined) qs.set('risk_pct', String(params.riskPct));
  return fetchJson<PortfolioData>(`/api/portfolio?${qs.toString()}`);
}

export function getOpenTrades(): Promise<{ positions: OpenPosition[] }> {
  return fetchJson<{ positions: OpenPosition[] }>('/api/trades/open');
}

export function runStrategyBenchmark(params: BenchmarkRequest): Promise<BenchmarkResponse> {
  return fetchJson<BenchmarkResponse>('/api/portfolio/benchmark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
