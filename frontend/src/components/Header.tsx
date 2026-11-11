import { Component, For, Show } from 'solid-js';
import { MetricMode, AccountInfo } from '../types';
import { 
  RefreshCw, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  DollarSign, 
  Percent, 
  TrendingUp 
} from 'lucide-solid';

interface HeaderProps {
  accounts: AccountInfo[];
  activeAccount: AccountInfo | null;
  activeLogin: number | null;
  isMt5Connected: boolean;
  isWsConnected: boolean;
  mode: MetricMode;
  isSyncing: boolean;
  onSelectAccount: (login: number) => void;
  onSelectMode: (mode: MetricMode) => void;
  onSync: () => void;
}

export const Header: Component<HeaderProps> = (props) => {
  return (
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 sticky top-0 z-50">
      <div class="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Account Selector */}
        <div class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <div class="flex items-center gap-2.5">
            <div class="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold text-lg">
              fx
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-base font-bold text-white tracking-tight">MT5 Portfolio Viewer</h1>
                <span class="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Myfxbook Analog
                </span>
              </div>
              <p class="text-xs text-slate-400">MetaTrader 5 Automated Analytics</p>
            </div>
          </div>

          {/* Account Dropdown Switcher */}
          <div class="flex items-center gap-2">
            <select
              class="bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
              value={props.activeLogin || ''}
              onChange={(e) => props.onSelectAccount(Number(e.currentTarget.value))}
            >
              <For each={props.accounts}>
                {(acc) => (
                  <option value={acc.login}>
                    #{acc.login} — {acc.broker} ({acc.name})
                  </option>
                )}
              </For>
            </select>
          </div>
        </div>

        {/* Center: Metric Mode Switcher */}
        <div class="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              props.mode === 'currency'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            onClick={() => props.onSelectMode('currency')}
          >
            <DollarSign size={14} />
            <span>Profit ($)</span>
          </button>
          
          <button
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              props.mode === 'pct'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
            onClick={() => props.onSelectMode('pct')}
          >
            <Percent size={14} />
            <span>Gain (%)</span>
          </button>

          <button
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              props.mode === 'r'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400/30'
                : 'text-purple-300 hover:text-purple-100 hover:bg-slate-900'
            }`}
            onClick={() => props.onSelectMode('r')}
          >
            <TrendingUp size={14} />
            <span>Van Tharp (R)</span>
            <span class="text-[9px] bg-purple-950/80 text-purple-200 px-1 py-0.2 rounded border border-purple-500/30">
              SQN
            </span>
          </button>
        </div>

        {/* Right: MT5 Connection Status & Sync Button */}
        <div class="flex items-center gap-3">
          {/* MT5 Status Badge */}
          <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            <span class="relative flex h-2 w-2">
              <span class={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                props.isWsConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}></span>
              <span class={`relative inline-flex rounded-full h-2 w-2 ${
                props.isWsConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}></span>
            </span>
            <span class="text-slate-300 font-medium text-[11px]">
              {props.isMt5Connected ? 'MT5 Terminal Live' : 'Demo Mode (Sync Ready)'}
            </span>
          </div>

          {/* Sync Button */}
          <button
            onClick={props.onSync}
            disabled={props.isSyncing}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 hover:border-slate-600 transition-all active:scale-95 disabled:opacity-50"
            title="Sync latest deals and positions from MT5"
          >
            <RefreshCw size={13} class={props.isSyncing ? 'animate-spin text-blue-400' : 'text-slate-400'} />
            <span>{props.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

      </div>
    </header>
  );
};
