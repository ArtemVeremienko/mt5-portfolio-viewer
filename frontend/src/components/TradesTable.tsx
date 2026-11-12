import { Component, createMemo, createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { TradeDeal, OpenPosition, MetricMode, TradeScope, CashflowItem } from '../types';
import { Search, ArrowUpRight, ArrowDownRight, History, Download, NotebookPen, X, ArrowUpDown, Tag } from 'lucide-solid';

interface TradesTableProps {
  openTrades: OpenPosition[];
  closedTrades: TradeDeal[];
  cashflows?: CashflowItem[];
  mode: MetricMode;
  tradeScope?: TradeScope;
  availableTrades?: number;
  onSelectTradeScope?: (scope: TradeScope) => void;
  onNoteSaved?: () => void;
}

export const TradesTable: Component<TradesTableProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'open' | 'history' | 'playbook' | 'cashflows'>(
    props.openTrades.length > 0 ? 'open' : 'history'
  );
  const [searchQuery, setSearchQuery] = createSignal('');
  const [outcomeFilter, setOutcomeFilter] = createSignal<'all' | 'winners' | 'losers' | 'unreviewed'>('all');
  const [tagFilter, setTagFilter] = createSignal<string>('');
  const [sortBy, setSortBy] = createSignal<'time' | 'duration' | 'volume' | 'profit' | 'r_multiple'>('time');
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('desc');
  const [page, setPage] = createSignal(1);
  const [editingTrade, setEditingTrade] = createSignal<TradeDeal | null>(null);
  const [noteText, setNoteText] = createSignal('');
  const [setupTag, setSetupTag] = createSignal('');
  const [mistakeTag, setMistakeTag] = createSignal('');
  const [savingNote, setSavingNote] = createSignal(false);
  const pageSize = 20;

  const openNoteEditor = (t: TradeDeal) => {
    setEditingTrade(t);
    setNoteText(t.note || '');
    setSetupTag(t.setup_tag || '');
    setMistakeTag(t.mistake_tag || '');
  };

  const saveNote = async () => {
    const t = editingTrade();
    if (!t) return;
    setSavingNote(true);
    try {
      const res = await fetch('/api/trades/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket: t.ticket,
          account_id: t.account_id,
          note: noteText(),
          setup_tag: setupTag(),
          mistake_tag: mistakeTag(),
        }),
      });
      if (res.ok) {
        setEditingTrade(null);
        props.onNoteSaved?.();
      }
    } catch (e) {
      console.error('Failed to save note:', e);
    } finally {
      setSavingNote(false);
    }
  };

  const getNetProfit = (t: TradeDeal) =>
    t.net_profit !== undefined ? t.net_profit : (t.profit + (t.swap || 0) + (t.commission || 0));

  const toggleSort = (col: 'time' | 'duration' | 'volume' | 'profit' | 'r_multiple') => {
    if (sortBy() === col) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const filteredClosed = () => {
    const q = searchQuery().trim().toUpperCase();
    const outcome = outcomeFilter();
    const tag = tagFilter().trim().toLowerCase();

    const list = props.closedTrades.filter((t) => {
      if (q) {
        const hit =
          t.symbol.toUpperCase().includes(q) ||
          String(t.ticket).includes(q) ||
          (t.comment || '').toUpperCase().includes(q) ||
          (t.setup_tag || '').toUpperCase().includes(q) ||
          (t.mistake_tag || '').toUpperCase().includes(q);
        if (!hit) return false;
      }
      const net = getNetProfit(t);
      if (outcome === 'winners' && net <= 0) return false;
      if (outcome === 'losers' && net >= 0) return false;
      if (outcome === 'unreviewed' && (t.note || t.setup_tag || t.mistake_tag)) return false;
      if (tag) {
        const sTag = (t.setup_tag || '').trim().toLowerCase();
        const mTag = (t.mistake_tag || '').trim().toLowerCase();
        if (sTag !== tag && mTag !== tag) return false;
      }
      return true;
    });

    const col = sortBy();
    const dir = sortDir() === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let va = 0;
      let vb = 0;
      if (col === 'time') { va = a.time; vb = b.time; }
      else if (col === 'duration') {
        va = (a.time || 0) - (a.open_time || a.time || 0);
        vb = (b.time || 0) - (b.open_time || b.time || 0);
      } else if (col === 'volume') { va = a.volume; vb = b.volume; }
      else if (col === 'profit') { va = getNetProfit(a); vb = getNetProfit(b); }
      else if (col === 'r_multiple') { va = a.r_multiple; vb = b.r_multiple; }
      return (va - vb) * dir;
    });
  };

  const tagAnalytics = createMemo(() => {
    type TagRow = { tag: string; kind: 'setup' | 'mistake'; trades: number; won: number; totalR: number; totalProfit: number };
    const map = new Map<string, TagRow>();
    for (const t of props.closedTrades) {
      const net = getNetProfit(t);
      const sTag = (t.setup_tag || '').trim();
      const mTag = (t.mistake_tag || '').trim();
      if (sTag) {
        const key = `setup:${sTag.toLowerCase()}`;
        const cur = map.get(key) || { tag: sTag, kind: 'setup', trades: 0, won: 0, totalR: 0, totalProfit: 0 };
        cur.trades += 1;
        if (net > 0) cur.won += 1;
        cur.totalR += t.r_multiple || 0;
        cur.totalProfit += net;
        map.set(key, cur);
      }
      if (mTag) {
        const key = `mistake:${mTag.toLowerCase()}`;
        const cur = map.get(key) || { tag: mTag, kind: 'mistake', trades: 0, won: 0, totalR: 0, totalProfit: 0 };
        cur.trades += 1;
        if (net > 0) cur.won += 1;
        cur.totalR += t.r_multiple || 0;
        cur.totalProfit += net;
        map.set(key, cur);
      }
    }
    const all = Array.from(map.values()).sort((a, b) => b.trades - a.trades);
    return {
      setups: all.filter(x => x.kind === 'setup'),
      mistakes: all.filter(x => x.kind === 'mistake'),
    };
  });

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

  const formatDuration = (openTs?: number, closeTs?: number) => {
    if (!openTs || !closeTs || closeTs < openTs) return '—';
    const secs = Math.floor(closeTs - openTs);
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hrs < 24) return `${hrs}h ${mins}m`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h`;
  };

  const exportCsv = () => {
    const rows = filteredClosed();
    const headers = [
      'Ticket', 'OpenTimeUTC', 'CloseTimeUTC', 'Duration', 'Type', 'Symbol',
      'Lots', 'OpenPrice', 'ClosePrice', 'SL', 'TP', 'Pips', 'GrossProfit', 'Swap',
      'Commission', 'NetProfit', 'Risk1R', 'RMultiple', 'MAE_Amt', 'MFE_Amt',
      'SetupTag', 'MistakeTag', 'Note', 'Comment'
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map((t) => [
        t.ticket,
        formatTimestamp(t.open_time || 0),
        formatTimestamp(t.time),
        formatDuration(t.open_time, t.time),
        t.type === 0 ? 'BUY' : 'SELL',
        t.symbol,
        t.volume.toFixed(2),
        t.open_price,
        t.price,
        t.sl > 0 ? t.sl : '',
        t.tp > 0 ? t.tp : '',
        (t.pips || 0).toFixed(1),
        t.profit.toFixed(2),
        (t.swap || 0).toFixed(2),
        (t.commission || 0).toFixed(2),
        getNetProfit(t).toFixed(2),
        (t.risk_r || 0).toFixed(2),
        t.r_multiple.toFixed(2),
        (t.mae_amount || 0).toFixed(2),
        (t.mfe_amount || 0).toFixed(2),
        t.setup_tag || '',
        t.mistake_tag || '',
        t.note || '',
        t.comment || ''
      ].map(escape).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mt5_trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab() === 'playbook'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('playbook')}
          >
            <Tag size={12} />
            <span>Playbook & Mistakes</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {tagAnalytics().setups.length + tagAnalytics().mistakes.length}
            </span>
          </button>

          <button
            class={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab() === 'cashflows'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setActiveTab('cashflows')}
          >
            <span>Cashflows</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
              {props.cashflows?.length || 0}
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
              id="trades-search"
              name="trades_search"
              type="text"
              placeholder="Search symbol, ticket, tag..."
              value={searchQuery()}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value);
                setPage(1);
              }}
              class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <Show when={activeTab() === 'history'}>
            <button
              onClick={exportCsv}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              title="Export filtered closed trades to CSV"
            >
              <Download size={13} class="text-blue-400" />
              <span>CSV</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Tables */}
      <div class="overflow-x-auto">
        <Show when={activeTab() === 'history'}>
          <div class="space-y-2.5">
            {/* Quick Outcome & Tag Filter Pills */}
            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
              {(['all', 'winners', 'losers', 'unreviewed'] as const).map((o) => (
                <button
                  onClick={() => { setOutcomeFilter(o); setPage(1); }}
                  class={`px-2.5 py-1 rounded-lg font-medium border transition-colors capitalize ${
                    outcomeFilter() === o
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  {o}
                </button>
              ))}
              <Show when={tagFilter()}>
                <button
                  onClick={() => { setTagFilter(''); setPage(1); }}
                  class="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1"
                >
                  <span>Tag: {tagFilter()}</span>
                  <X size={11} />
                </button>
              </Show>
            </div>

            <table class="w-full text-left text-xs">
              <thead>
                <tr class="text-[11px] text-slate-400 border-b border-slate-800">
                  <th class="py-2.5 px-2">Ticket</th>
                  <th class="py-2.5 px-2">Open Time</th>
                  <th class="py-2.5 px-2">
                    <button onClick={() => toggleSort('time')} class="inline-flex items-center gap-1 hover:text-white">
                      <span>Close Time</span><ArrowUpDown size={11} class={sortBy() === 'time' ? 'text-blue-400' : 'opacity-50'} />
                    </button>
                  </th>
                  <th class="py-2.5 px-2">
                    <button onClick={() => toggleSort('duration')} class="inline-flex items-center gap-1 hover:text-white">
                      <span>Dur.</span><ArrowUpDown size={11} class={sortBy() === 'duration' ? 'text-blue-400' : 'opacity-50'} />
                    </button>
                  </th>
                  <th class="py-2.5 px-2">Type</th>
                  <th class="py-2.5 px-2">Symbol</th>
                  <th class="py-2.5 px-2">
                    <button onClick={() => toggleSort('volume')} class="inline-flex items-center gap-1 hover:text-white">
                      <span>Lots</span><ArrowUpDown size={11} class={sortBy() === 'volume' ? 'text-blue-400' : 'opacity-50'} />
                    </button>
                  </th>
                  <th class="py-2.5 px-2">Open</th>
                  <th class="py-2.5 px-2">Close</th>
                  <th class="py-2.5 px-2">SL</th>
                  <th class="py-2.5 px-2">Swap</th>
                  <th class="py-2.5 px-2">Comm.</th>
                  <th class="py-2.5 px-2">
                    <button onClick={() => toggleSort('profit')} class="inline-flex items-center gap-1 hover:text-white">
                      <span>Net Profit</span><ArrowUpDown size={11} class={sortBy() === 'profit' ? 'text-blue-400' : 'opacity-50'} />
                    </button>
                  </th>
                  <th class="py-2.5 px-2">Comment</th>
                  <th class="py-2.5 px-2">Journal</th>
                  <th class="py-2.5 px-2 text-right">
                    <button onClick={() => toggleSort('r_multiple')} class="inline-flex items-center gap-1 hover:text-white ml-auto">
                      <span>R-Multiple</span><ArrowUpDown size={11} class={sortBy() === 'r_multiple' ? 'text-purple-400' : 'opacity-50'} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                <Show
                  when={paginatedClosed().length > 0}
                  fallback={
                    <tr>
                      <td colspan="16" class="py-8 text-center text-slate-500 text-xs">
                        No closed trades match your search or filters.
                      </td>
                    </tr>
                  }
                >
                <For each={paginatedClosed()}>
                  {(t) => {
                    const netVal = getNetProfit(t);
                    return (
                    <tr class="hover:bg-slate-800/30 transition-colors">
                      <td class="py-2 px-2 text-slate-400 font-mono">#{t.ticket}</td>
                      <td class="py-2 px-2 text-slate-400 font-mono text-[11px]">{formatTimestamp(t.open_time || 0)}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono text-[11px]">{formatTimestamp(t.time)}</td>
                      <td class="py-2 px-2 text-slate-400 font-mono text-[11px]">{formatDuration(t.open_time, t.time)}</td>
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
                      <td class="py-2 px-2 text-slate-400 font-mono">{(t.swap || 0).toFixed(2)}</td>
                      <td class="py-2 px-2 text-slate-400 font-mono">{(t.commission || 0).toFixed(2)}</td>
                      <td class="py-2 px-2 font-bold">
                        <span class={netVal >= 0 ? 'text-emerald-400' : 'text-rose-400'} title={`Gross: ${t.profit.toFixed(2)}`}>
                          {netVal >= 0 ? '+$' : '-$'}{Math.abs(netVal).toFixed(2)}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-slate-400 text-[11px] max-w-[120px] truncate" title={t.comment}>{t.comment || '—'}</td>
                      <td class="py-2 px-2">
                        <button
                          onClick={() => openNoteEditor(t)}
                          class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
                            t.note || t.setup_tag || t.mistake_tag
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                              : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-white'
                          }`}
                          title={t.note || 'Add journal note or tags'}
                        >
                          <NotebookPen size={11} />
                          <span>{t.setup_tag || (t.note ? 'Note' : 'Log')}</span>
                        </button>
                      </td>
                      <td class="py-2 px-2 text-right font-bold">
                        <span 
                          title={
                            t.risk_source === 'sl'
                              ? `1R = $${(t.risk_r || 0.20).toFixed(2)} (Initial SL: ${t.sl_diff_pts || '—'} pts)`
                              : `1R = $${(t.risk_r || 0.20).toFixed(2)} (1% Account Risk Model)`
                          }
                          class={`px-2 py-0.5 rounded text-xs font-mono cursor-help ${
                            t.r_multiple > 0
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                              : (t.r_multiple < 0 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'text-slate-400')
                          }`}
                        >
                          {t.r_multiple > 0 ? `+${t.r_multiple.toFixed(2)}R` : `${t.r_multiple.toFixed(2)}R`}
                        </span>
                      </td>
                    </tr>
                  );}}
                </For>
                </Show>
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div class="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs text-slate-400">
              <span>
                {filteredClosed().length === 0
                  ? 'Showing 0 of 0 deals'
                  : `Showing ${((page() - 1) * pageSize) + 1} to ${Math.min(page() * pageSize, filteredClosed().length)} of ${filteredClosed().length} deals`}
              </span>
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
        </Show>

        <Show when={activeTab() === 'open'}>
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

        <Show when={activeTab() === 'cashflows'}>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-[11px] text-slate-400 border-b border-slate-800">
                <th class="py-2.5 px-2">Ticket</th>
                <th class="py-2.5 px-2">Time (UTC)</th>
                <th class="py-2.5 px-2">Type</th>
                <th class="py-2.5 px-2">Amount ($)</th>
                <th class="py-2.5 px-2">Balance After</th>
                <th class="py-2.5 px-2">Comment</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60">
              <Show when={(props.cashflows?.length || 0) > 0} fallback={
                <tr>
                  <td colspan="6" class="py-8 text-center text-slate-500">
                    No deposit or withdrawal records found.
                  </td>
                </tr>
              }>
                <For each={props.cashflows || []}>
                  {(cf) => (
                    <tr class="hover:bg-slate-800/30 transition-colors">
                      <td class="py-2 px-2 text-slate-400 font-mono">#{cf.ticket}</td>
                      <td class="py-2 px-2 text-slate-300 font-mono text-[11px]">{formatTimestamp(cf.time)}</td>
                      <td class="py-2 px-2 font-semibold">
                        <span class={`px-1.5 py-0.5 rounded text-[10px] ${
                          cf.amount >= 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {cf.type}
                        </span>
                      </td>
                      <td class={`py-2 px-2 font-bold font-mono ${cf.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {cf.amount >= 0 ? '+$' : '-$'}{Math.abs(cf.amount).toFixed(2)}
                      </td>
                      <td class="py-2 px-2 text-slate-200 font-mono">${cf.balance_after.toFixed(2)}</td>
                      <td class="py-2 px-2 text-slate-400 text-[11px]">{cf.comment || '—'}</td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </Show>
      </div>

      {/* Playbook & Mistakes Tab */}
      <Show when={activeTab() === 'playbook'}>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-emerald-400">Setup Playbook</h4>
            <Show
              when={tagAnalytics().setups.length > 0}
              fallback={<p class="text-xs text-slate-500 py-4 text-center">No setup tags logged yet. Use Journal → Log on closed trades.</p>}
            >
              <div class="space-y-1.5">
                <For each={tagAnalytics().setups}>
                  {(row) => {
                    const wr = (row.won / Math.max(1, row.trades)) * 100;
                    const expR = row.totalR / Math.max(1, row.trades);
                    return (
                      <button
                        onClick={() => { setTagFilter(row.tag); setActiveTab('history'); setPage(1); }}
                        class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs transition-colors"
                      >
                        <div class="text-left">
                          <div class="font-semibold text-white">{row.tag}</div>
                          <div class="text-[10px] text-slate-400 font-mono">{row.trades} trades • WR {wr.toFixed(0)}% • Exp {expR >= 0 ? '+' : ''}{expR.toFixed(2)}R</div>
                        </div>
                        <div class="text-right font-mono">
                          <div class={`font-bold ${row.totalR >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>{row.totalR >= 0 ? '+' : ''}{row.totalR.toFixed(2)}R</div>
                          <div class={`text-[10px] ${row.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.totalProfit >= 0 ? '+$' : '-$'}{Math.abs(row.totalProfit).toFixed(2)}</div>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>

          <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 class="text-xs font-bold uppercase tracking-wider text-rose-400">Mistake & Execution Leaks</h4>
            <Show
              when={tagAnalytics().mistakes.length > 0}
              fallback={<p class="text-xs text-slate-500 py-4 text-center">No mistake tags logged yet.</p>}
            >
              <div class="space-y-1.5">
                <For each={tagAnalytics().mistakes}>
                  {(row) => {
                    const wr = (row.won / Math.max(1, row.trades)) * 100;
                    const expR = row.totalR / Math.max(1, row.trades);
                    return (
                      <button
                        onClick={() => { setTagFilter(row.tag); setActiveTab('history'); setPage(1); }}
                        class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs transition-colors"
                      >
                        <div class="text-left">
                          <div class="font-semibold text-white">{row.tag}</div>
                          <div class="text-[10px] text-slate-400 font-mono">{row.trades} trades • WR {wr.toFixed(0)}% • Exp {expR >= 0 ? '+' : ''}{expR.toFixed(2)}R</div>
                        </div>
                        <div class="text-right font-mono">
                          <div class={`font-bold ${row.totalR >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>{row.totalR >= 0 ? '+' : ''}{row.totalR.toFixed(2)}R</div>
                          <div class={`text-[10px] ${row.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.totalProfit >= 0 ? '+$' : '-$'}{Math.abs(row.totalProfit).toFixed(2)}</div>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>

      {/* Trade Journal Note Modal (Portal ensures true viewport centering) */}
      <Show when={editingTrade()}>
        {(t) => (
          <Portal>
            <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div class="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
              <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h4 class="text-sm font-bold text-white">Trade Journal — #{t().ticket}</h4>
                  <p class="text-[11px] text-slate-400 font-mono">{t().symbol} • {t().type === 0 ? 'BUY' : 'SELL'} • {t().r_multiple >= 0 ? '+' : ''}{t().r_multiple.toFixed(2)}R</p>
                </div>
                <button onClick={() => setEditingTrade(null)} class="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div class="space-y-3 text-xs">
                <div>
                  <label class="block text-slate-400 mb-1">Setup Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. London Breakout, Pullback EMA20"
                    value={setupTag()}
                    onInput={(e) => setSetupTag(e.currentTarget.value)}
                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">Mistake / Execution Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. Moved SL, FOMO, Early Exit, Clean"
                    value={mistakeTag()}
                    onInput={(e) => setMistakeTag(e.currentTarget.value)}
                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">Journal Notes</label>
                  <textarea
                    rows={4}
                    placeholder="Why did I enter? What did I learn?"
                    value={noteText()}
                    onInput={(e) => setNoteText(e.currentTarget.value)}
                    class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setEditingTrade(null)}
                  class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  disabled={savingNote()}
                  class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {savingNote() ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
            </div>
          </Portal>
        )}
      </Show>

    </div>
  );
};
