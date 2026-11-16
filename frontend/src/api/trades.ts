import { fetchJson } from './client';

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeCandlesResponse {
  ticket: number;
  cached: boolean;
  mt5_connected?: boolean;
  h1: CandleBar[];
  m5: CandleBar[];
  m1: CandleBar[];
}

export interface SaveTradeNotePayload {
  ticket: number;
  account_id: number;
  note: string;
  setup_tag: string;
  mistake_tag: string;
  exit_tag: string;
  entry_grade: string;
  execution_grade: string;
  management_grade: string;
}

export function getTradeCandles(
  ticket: number,
  refresh = false,
  signal?: AbortSignal
): Promise<TradeCandlesResponse> {
  const suffix = refresh ? '?refresh=true' : '';
  return fetchJson<TradeCandlesResponse>(`/api/trades/${ticket}/candles${suffix}`, { signal });
}

export function saveTradeNote(payload: SaveTradeNotePayload): Promise<{ status: string }> {
  return fetchJson<{ status: string }>('/api/trades/note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
