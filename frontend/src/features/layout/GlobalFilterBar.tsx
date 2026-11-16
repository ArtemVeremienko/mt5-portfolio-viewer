import { type Component, For, Show } from 'solid-js';
import type { TradeScope } from '../../types';

export interface GlobalFilterBarProps {
  visible: boolean;
  startDate: string;
  endDate: string;
  symbol: string;
  direction: string;
  comment: string;
  magic: string;
  allAccountsMode: boolean;
  accountsCount: number;
  tradeScope: TradeScope;
  availableSymbols: string[];
  availableComments: string[];
  availableMagics: number[];
  hasActiveFilters: boolean;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onSymbolChange: (val: string) => void;
  onDirectionChange: (val: string) => void;
  onCommentChange: (val: string) => void;
  onMagicChange: (val: string) => void;
  onToggleAllAccounts: () => void;
  onReset: () => void;
}

export const GlobalFilterBar: Component<GlobalFilterBarProps> = (props) => {
  return (
    <Show when={props.visible}>
      <div class="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800/90 rounded-2xl px-3.5 py-2.5 text-xs">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
          Filters:
        </span>
        <input
          id="filter-start-date"
          name="start_date"
          type="date"
          value={props.startDate}
          onChange={(e) => props.onStartDateChange(e.currentTarget.value)}
          title="Start Date (UTC)"
          class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
        />
        <span class="text-slate-600">→</span>
        <input
          id="filter-end-date"
          name="end_date"
          type="date"
          value={props.endDate}
          onChange={(e) => props.onEndDateChange(e.currentTarget.value)}
          title="End Date (UTC)"
          class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
        />

        <select
          id="filter-symbol"
          name="symbol"
          value={props.symbol}
          onChange={(e) => props.onSymbolChange(e.currentTarget.value)}
          class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Symbols</option>
          <For each={props.availableSymbols}>
            {(sym) => <option value={sym}>{sym}</option>}
          </For>
        </select>

        <select
          id="filter-direction"
          name="direction"
          value={props.direction}
          onChange={(e) => props.onDirectionChange(e.currentTarget.value)}
          class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Directions</option>
          <option value="BUY">BUY Only</option>
          <option value="SELL">SELL Only</option>
        </select>

        <select
          id="filter-comment"
          name="comment"
          value={props.comment}
          onChange={(e) => props.onCommentChange(e.currentTarget.value)}
          class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[140px] focus:outline-none focus:border-blue-500"
        >
          <option value="">All Strategies / EA</option>
          <For each={props.availableComments}>
            {(c) => <option value={c}>{c}</option>}
          </For>
        </select>

        <Show when={props.availableMagics.length > 0}>
          <select
            id="filter-magic"
            name="magic"
            value={props.magic}
            onChange={(e) => props.onMagicChange(e.currentTarget.value)}
            class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[130px] focus:outline-none focus:border-blue-500"
          >
            <option value="">All Magic #</option>
            <For each={props.availableMagics}>
              {(m) => <option value={String(m)}>Magic #{m}</option>}
            </For>
          </select>
        </Show>

        <Show when={props.accountsCount > 1}>
          <button
            onClick={() => props.onToggleAllAccounts()}
            class={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              props.allAccountsMode
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Combine all synced accounts into one portfolio"
          >
            All Accounts ({props.accountsCount})
          </button>
        </Show>

        <Show when={props.tradeScope === 'last100'}>
          <span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
            Scope: Last 100
          </span>
        </Show>

        <Show when={props.hasActiveFilters}>
          <button
            onClick={() => props.onReset()}
            class="ml-auto px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-colors"
          >
            Reset
          </button>
        </Show>
      </div>
    </Show>
  );
};
