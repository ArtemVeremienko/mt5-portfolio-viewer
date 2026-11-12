import { Component, createSignal, For, Show } from 'solid-js';
import { TradeDeal, OpenPosition, MetricMode, TradeScope } from '../types';
import { ListFilter, Search, ArrowUpRight, ArrowDownRight, History } from 'lucide-solid';

interface TradesTableProps {
  openTrades: OpenPosition[];
  closedTrades: TradeDeal[];
  mode: MetricMode;
  tradeScope?: TradeScope;
  availableTrades?: number;
  onSelectTradeScope?: (scope: TradeScope) => void;
}

export const TradesTable: Component<TradesTableProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'open' | 'history'>('open');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const pageSize = 20;

  const filteredClosed = () => {
    const q = searchQuery().trim().toUpperCase();
    if (!q) return props.closedTrades;
    return props.closedTrades.filter(
      (t) =>
        t.symbol.toUpperCase().includes(q) ||
        String(t.ticket).includes(q) ||
        t.comment.toUpperCase().includes(q)
    );
  };

  const paginatedClosed = () => {
    const list = filteredClosed();
    const start = (page() - 1) * pageSize;
    return list.slice(start, start + pageSize);
  };

  const totalPages = () => Math.max(1, Math.ceil(filteredClosed().length / pageSize));

  const formatTimestamp = (ts: number) => {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    return d.toISOString().replace('T', ' ').substring(0, 19);
  };

  return (
    <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-4">
      
      {/* Tab Switcher & Search Bar */}
      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div class="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab() === 'open'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('open')}
          >
            <span>Open Positions</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-950 text-blue-200 border border-blue-400/30">
              {props.openTrades.length}
            </span>
          </button>

          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab() === 'history'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <span>Closed History</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {props.closedTrades.length}
            </span>
          </button>
        </div>

        {/* Right Controls: Scope Toggle + Search Input */}
        <div class="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
          <Show when={props.onSelectTradeScope}>
            <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shadow-inner">
              <button
                class={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  props.tradeScope === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                onClick={() => props.onSelectTradeScope?.('all')}
                title="Analyze all historical trades"
              >
                All ({props.availableTrades || props.closedTrades.length})
              </button>
              <button
                class={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  props.tradeScope === 'last100'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-purple-300 hover:text-white'
                }`}
                onClick={() => props.onSelectTradeScope?.('last100')}
                title="Isolate performance strictly to the last 100 trades"
              >
                <History size={12} />
                <span>Last 100</span>
              </button>
            </div>
          </Show>

          {/* Filter input */}
          <div class="relative w-full sm:w-56">
            <Search size={14} class="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search symbol, ticket..."
              value={searchQuery()}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value);
                setPage(1);
              }}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Tables */}
      <div class="overflow-x-auto">
        <Show when={activeTab() === 'open'} fallback={
          <div>
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="text-[11px] text-slate-400 border-b border-slate-800">
                  <th class="py-2.5 px-2">Ticket</th>
                  <th class="py-2.5 px-2">Close Time</th>
                  <th class="py-2.5 px-2">Type</th>
                  <th class="py-2.5 px-2">Symbol</th>
                  <th class="py-2.5 px-2">Lots</th>
                  <th class="py-2.5 px-2">Open</th>
                  <th class="py-2.5 px-2">Close</th>
                  <th class="py-2.5 px-2">SL</th>
                  <th class="py-2.5 px-2">Profit ($)</th>
                  <th class="py-2.5 px-2 text-right">R-Multiple</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                <For each={paginatedClosed()}>
                  {(t) => (
                    <tr class="hover:bg-slate-800/30 transition-colors">
                      <td class="py-2 px-2 text-slate-400 font-mono">#{t.ticket}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono text-[11px]">{formatTimestamp(t.time)}</td>
                      <td class="py-2 px-2 font-semibold">
                        <span class={`px-1.5 py-0.5 rounded text-[10px] ${
                          t.type === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {t.type === 0 ? 'BUY' : 'SELL'}
                        </span>
                      </td>
                      <td class="py-2 px-2 font-bold text-white font-mono">{t.symbol}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono">{t.volume.toFixed(2)}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono">{t.open_price}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono">{t.price}</td>
                      <td class="py-2 px-2 text-slate-400 font-mono">{t.sl > 0 ? t.sl : '—'}</td>
                      <td class="py-2 px-2 font-bold">
                        <span class={t.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {t.profit >= 0 ? '+$' : '-$'}{Math.abs(t.profit).toFixed(2)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-right font-bold">
                        <span class={`px-2 py-0.5 rounded text-xs font-mono ${
                          t.r_multiple > 0
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            : (t.r_multiple < 0 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'text-slate-400')
                        }`}>
                          {t.r_multiple > 0 ? `+${t.r_multiple.toFixed(2)}R` : `${t.r_multiple.toFixed(2)}R`}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div class="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
              <span>Showing {((page() - 1) * pageSize) + 1} to {Math.min(page() * pageSize, filteredClosed().length)} of {filteredClosed().length} deals</span>
              <div class="flex items-center gap-1">
                <button
                  disabled={page() <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  Prev
                </button>
                <span class="px-2 font-mono text-slate-300">Page {page()} of {totalPages()}</span>
                <button
                  disabled={page() >= totalPages()}
                  onClick={() => setPage(p => Math.min(totalPages(), p + 1))}
                  class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        }>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-[11px] text-slate-400 border-b border-slate-800">
                <th class="py-2.5 px-2">Ticket</th>
                <th class="py-2.5 px-2">Symbol</th>
                <th class="py-2.5 px-2">Type</th>
                <th class="py-2.5 px-2">Lots</th>
                <th class="py-2.5 px-2">Open Price</th>
                <th class="py-2.5 px-2">Current Price</th>
                <th class="py-2.5 px-2">SL</th>
                <th class="py-2.5 px-2">TP</th>
                <th class="py-2.5 px-2 text-right">Floating PnL</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              <Show when={props.openTrades.length > 0} fallback={
                <tr>
                  <td colspan="9" class="py-8 text-center text-slate-500">
                    No active open trades at this moment.
                  </td>
                </tr>
              }>
                <For each={props.openTrades}>
                  {(pos) => (
                    <tr class="hover:bg-slate-800/30 transition-colors">
                      <td class="py-2.5 px-2 text-slate-400 font-mono">#{pos.ticket}</td>
                      <td class="py-2.5 px-2 font-bold text-white font-mono">{pos.symbol}</td>
                      <td class="py-2.5 px-2 font-semibold">
                        <span class={`px-1.5 py-0.5 rounded text-[10px] ${
                          pos.type === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {pos.type_str}
                        </span>
                      </td>
                      <td class="py-2.5 px-2 text-slate-300 font-mono">{pos.volume.toFixed(2)}</td>
                      <td class="py-2.5 px-2 text-slate-300 font-mono">{pos.open_price}</td>
                      <td class="py-2.5 px-2 text-white font-mono font-semibold">{pos.current_price}</td>
                      <td class="py-2.5 px-2 text-slate-400 font-mono">{pos.sl > 0 ? pos.sl : '—'}</td>
                      <td class="py-2.5 px-2 text-slate-400 font-mono">{pos.tp > 0 ? pos.tp : '—'}</td>
                      <td class="py-2.5 px-2 text-right font-bold">
                        <span class={`px-2 py-0.5 rounded text-xs ${
                          pos.profit >= 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}>
                          {pos.profit >= 0 ? '+$' : '-$'}{Math.abs(pos.profit).toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </Show>
      </div>

    </div>
  );
};
