import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js';
import { 
  MetricMode, 
  TradeScope,
  AccountInfo, 
  PortfolioData, 
  OpenPosition 
} from './types';
import { Header } from './components/Header';
import { SidebarStats } from './components/SidebarStats';
import { PerformanceChart } from './components/PerformanceChart';
import { MonthlyHeatmap } from './components/MonthlyHeatmap';
import { VanTharpPanel } from './components/VanTharpPanel';
import { TradingStats } from './components/TradingStats';
import { TradesTable } from './components/TradesTable';
import { ExcursionPanel } from './components/ExcursionPanel';
import { CalendarView } from './components/CalendarView';
import { AdvancedStats } from './components/AdvancedStats';
import { MonthlyAnalytics } from './components/MonthlyAnalytics';
import { getStorageItem, setStorageItem } from './utils/storage';
import { 
  LineChart, 
  Award, 
  Layers, 
  PieChart,
  Activity,
  Calendar as CalendarIcon,
  BarChart3,
  CalendarDays
} from 'lucide-solid';

export const App: Component = () => {
  const [metricMode, setMetricMode] = createSignal<MetricMode>('currency');
  const [tradeScope, setTradeScope] = createSignal<TradeScope>('all');
  const [accounts, setAccounts] = createSignal<AccountInfo[]>([]);
  const [activeLogin, setActiveLogin] = createSignal<number | null>(null);
  const [portfolioData, setPortfolioData] = createSignal<PortfolioData | null>(null);
  const [openTrades, setOpenTrades] = createSignal<OpenPosition[]>([]);
  const [isMt5Connected, setIsMt5Connected] = createSignal<boolean>(false);
  const [isWsConnected, setIsWsConnected] = createSignal<boolean>(false);
  const [isSyncing, setIsSyncing] = createSignal<boolean>(false);
  const [mainTab, setMainTab] = createSignal<'overview' | 'vantharp' | 'excursions' | 'calendar' | 'advanced' | 'trades'>('overview');
  const [calendarSubTab, setCalendarSubTab] = createSignal<'monthly' | 'daily'>('monthly');

  // Custom Analysis Global Filters
  const [filterStartDate, setFilterStartDate] = createSignal<string>('');
  const [filterEndDate, setFilterEndDate] = createSignal<string>('');
  const [filterSymbol, setFilterSymbol] = createSignal<string>('');
  const [filterDirection, setFilterDirection] = createSignal<string>('');
  const [filterComment, setFilterComment] = createSignal<string>('');
  const [filterMagic, setFilterMagic] = createSignal<string>('');
  const [allAccountsMode, setAllAccountsMode] = createSignal<boolean>(false);
  const [isLoading, setIsLoading] = createSignal<boolean>(true);
  const [fetchError, setFetchError] = createSignal<string | null>(null);

  // Configurable Prop Risk Guard limits (persisted in localStorage)
  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const [propDailyLimit, setPropDailyLimit] = createSignal<number>(
    getStorageItem('propDailyLimit', -5, (v): v is number => isFiniteNumber(v) && v <= 0)
  );
  const [propMaxDdLimit, setPropMaxDdLimit] = createSignal<number>(
    getStorageItem('propMaxDdLimit', 10, (v): v is number => isFiniteNumber(v) && v > 0)
  );
  const [showPropConfig, setShowPropConfig] = createSignal<boolean>(false);

  let ws: WebSocket | null = null;
  let wsReconnectTimer: any = null;

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setActiveLogin(data.active_login);
        setIsMt5Connected(data.is_mt5_connected);
      }
    } catch (e) {
      console.error('Failed to fetch accounts:', e);
    }
  };

  const fetchPortfolio = async (overrideScope?: TradeScope) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      const scopeVal = overrideScope || tradeScope();
      if (scopeVal === 'last100') params.set('scope', 'last100');
      if (filterStartDate()) {
        const ts = Math.floor(new Date(filterStartDate() + 'T00:00:00Z').getTime() / 1000);
        if (!isNaN(ts)) params.set('start_time', String(ts));
      }
      if (filterEndDate()) {
        const ts = Math.floor(new Date(filterEndDate() + 'T23:59:59Z').getTime() / 1000);
        if (!isNaN(ts)) params.set('end_time', String(ts));
      }
      if (filterSymbol()) params.set('symbol', filterSymbol());
      if (filterDirection()) params.set('direction', filterDirection());
      if (filterComment()) params.set('comment', filterComment());
      if (filterMagic()) params.set('magic', filterMagic());
      if (allAccountsMode()) params.set('all_accounts', 'true');

      const qs = params.toString();
      const res = await fetch(`/api/portfolio${qs ? '?' + qs : ''}`);
      if (res.ok) {
        const data: PortfolioData = await res.json();
        setPortfolioData(data);
      } else {
        setFetchError(`Failed to load portfolio data (HTTP ${res.status})`);
      }
    } catch (e) {
      console.error('Failed to fetch portfolio data:', e);
      setFetchError('Unable to reach backend server. Check that the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasActiveFilters = () =>
    Boolean(filterStartDate() || filterEndDate() || filterSymbol() || filterDirection() || filterComment() || filterMagic() || allAccountsMode() || tradeScope() === 'last100');

  const clearAllFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterSymbol('');
    setFilterDirection('');
    setFilterComment('');
    setFilterMagic('');
    setAllAccountsMode(false);
    setTradeScope('all');
    fetchPortfolio('all');
  };

  const fetchOpenTrades = async () => {
    try {
      const res = await fetch('/api/trades/open');
      if (res.ok) {
        const data = await res.json();
        setOpenTrades(data.positions || []);
        setIsMt5Connected(data.is_mt5_connected);
      }
    } catch (e) {
      console.error('Failed to fetch open trades:', e);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchAccounts();
      await fetchPortfolio();
      await fetchOpenTrades();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectAccount = async (login: number) => {
    try {
      await fetch(`/api/accounts/switch?login=${login}`, { method: 'POST' });
      setActiveLogin(login);
      await fetchPortfolio();
      await fetchOpenTrades();
    } catch (e) {
      console.error('Switch account failed:', e);
    }
  };

  const setupWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'live_update') {
            if (msg.account) {
              setIsMt5Connected(msg.account.is_connected);
              const currentLogin = activeLogin();
              // Only apply live terminal ticks to the currently matching account
              if (currentLogin !== null && msg.account.login !== currentLogin) {
                return;
              }
              if (msg.open_positions) {
                setOpenTrades(msg.open_positions);
              }
              // Update live equity and balance seamlessly
              setPortfolioData((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  account: {
                    ...prev.account,
                    balance: msg.account.balance,
                    equity: msg.account.equity,
                    margin: msg.account.margin,
                    free_margin: msg.account.free_margin,
                  },
                  stats: {
                    ...prev.stats,
                    balance: msg.account.balance,
                    equity: msg.account.equity,
                  }
                };
              });
            }
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onclose = () => {
        setIsWsConnected(false);
        wsReconnectTimer = setTimeout(setupWebSocket, 3000);
      };

      ws.onerror = () => {
        setIsWsConnected(false);
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      wsReconnectTimer = setTimeout(setupWebSocket, 5000);
    }
  };

  onMount(async () => {
    await fetchAccounts();
    await fetchPortfolio();
    await fetchOpenTrades();
    setupWebSocket();
  });

  onCleanup(() => {
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    if (ws) ws.close();
  });

  const activeAccount = () => {
    const list = accounts();
    const l = activeLogin();
    return list.find(a => a.login === l) || portfolioData()?.account || null;
  };

  return (
    <div class="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        accounts={accounts()}
        activeAccount={activeAccount()}
        activeLogin={activeLogin()}
        isMt5Connected={isMt5Connected()}
        isWsConnected={isWsConnected()}
        mode={metricMode()}
        isSyncing={isSyncing()}
        onSelectAccount={handleSelectAccount}
        onSelectMode={(m) => {
          setMetricMode(m);
        }}
        onSync={handleSync}
      />

      {/* Main Container */}
      <main class="max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Fixed Sidebar Stats */}
        <div class="flex-shrink-0">
          <SidebarStats
            stats={portfolioData()?.stats || null}
            account={activeAccount()}
            mode={metricMode()}
          />
        </div>

        {/* Right Column: Dashboard Navigation & Content */}
        <div class="flex-1 flex flex-col gap-5 min-w-0">
          
          {/* Main Navigation Tabs */}
          <div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-lg backdrop-blur-sm overflow-x-auto">
            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'overview'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              onClick={() => setMainTab('overview')}
            >
              <LineChart size={15} />
              <span>Performance</span>
            </button>

            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'vantharp'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-purple-400 hover:text-purple-200 hover:bg-purple-950/30'
              }`}
              onClick={() => setMainTab('vantharp')}
            >
              <Award size={15} />
              <span>Van Tharp SQN</span>
            </button>

            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'excursions'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/30'
              }`}
              onClick={() => setMainTab('excursions')}
            >
              <Activity size={15} />
              <span>MAE / MFE</span>
            </button>

            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'calendar'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/30'
              }`}
              onClick={() => setMainTab('calendar')}
            >
              <CalendarDays size={15} />
              <span>Calendar & Periods</span>
            </button>

            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'advanced'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-blue-400 hover:text-blue-200 hover:bg-blue-950/30'
              }`}
              onClick={() => setMainTab('advanced')}
            >
              <BarChart3 size={15} />
              <span>Advanced Stats</span>
            </button>

            <button
              class={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'trades'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              onClick={() => setMainTab('trades')}
            >
              <Layers size={15} />
              <span>Trades ({portfolioData()?.stats.total_trades || 0})</span>
            </button>
          </div>

          {/* Error / Loading Banner */}
          <Show when={fetchError()}>
            <div class="flex items-center justify-between gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-4 py-2.5 text-xs">
              <span>{fetchError()}</span>
              <button
                onClick={() => fetchPortfolio()}
                class="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          </Show>

          <Show when={isLoading() && !portfolioData()}>
            <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 animate-pulse space-y-3">
              <div class="h-4 w-48 bg-slate-800 rounded"></div>
              <div class="h-48 w-full bg-slate-800/60 rounded-xl"></div>
            </div>
          </Show>

          {/* Custom Analysis Global Filter Bar */}
          <div class="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800/90 rounded-2xl px-3.5 py-2.5 text-xs">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Filters:</span>
            <input
              id="filter-start-date"
              name="start_date"
              type="date"
              value={filterStartDate()}
              onChange={(e) => { setFilterStartDate(e.currentTarget.value); fetchPortfolio(); }}
              title="Start Date (UTC)"
              class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <span class="text-slate-600">→</span>
            <input
              id="filter-end-date"
              name="end_date"
              type="date"
              value={filterEndDate()}
              onChange={(e) => { setFilterEndDate(e.currentTarget.value); fetchPortfolio(); }}
              title="End Date (UTC)"
              class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            />

            <select
              id="filter-symbol"
              name="symbol"
              value={filterSymbol()}
              onChange={(e) => { setFilterSymbol(e.currentTarget.value); fetchPortfolio(); }}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Symbols</option>
              {(portfolioData()?.available_symbols || []).map(sym => (
                <option value={sym}>{sym}</option>
              ))}
            </select>

            <select
              id="filter-direction"
              name="direction"
              value={filterDirection()}
              onChange={(e) => { setFilterDirection(e.currentTarget.value); fetchPortfolio(); }}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Directions</option>
              <option value="BUY">BUY Only</option>
              <option value="SELL">SELL Only</option>
            </select>

            <select
              id="filter-comment"
              name="comment"
              value={filterComment()}
              onChange={(e) => { setFilterComment(e.currentTarget.value); fetchPortfolio(); }}
              class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[140px] focus:outline-none focus:border-blue-500"
            >
              <option value="">All Strategies / EA</option>
              {(portfolioData()?.available_comments || []).map(c => (
                <option value={c}>{c}</option>
              ))}
            </select>

            <Show when={(portfolioData()?.available_magics || []).length > 0}>
              <select
                id="filter-magic"
                name="magic"
                value={filterMagic()}
                onChange={(e) => { setFilterMagic(e.currentTarget.value); fetchPortfolio(); }}
                class="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 max-w-[130px] focus:outline-none focus:border-blue-500"
              >
                <option value="">All Magic #</option>
                {(portfolioData()?.available_magics || []).map(m => (
                  <option value={String(m)}>Magic #{m}</option>
                ))}
              </select>
            </Show>

            <Show when={accounts().length > 1}>
              <button
                onClick={() => { setAllAccountsMode(!allAccountsMode()); fetchPortfolio(); }}
                class={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  allAccountsMode()
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Combine all synced accounts into one portfolio"
              >
                All Accounts ({accounts().length})
              </button>
            </Show>

            <Show when={tradeScope() === 'last100'}>
              <span class="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                Scope: Last 100
              </span>
            </Show>

            <Show when={hasActiveFilters()}>
              <button
                onClick={clearAllFilters}
                class="ml-auto px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-colors"
              >
                Reset
              </button>
            </Show>
          </div>

          {/* Tab 1: Overview & Interactive Curves */}
          <Show when={mainTab() === 'overview'}>
            {/* At-a-Glance Trader Strip */}
            {(() => {
              const st = portfolioData()?.stats;
              const bal = st?.balance || 0;
              const eq = st?.equity || bal;
              const fl = eq - bal;
              const todayP = st?.today_profit ?? 0;
              const weekP = st?.week_profit ?? 0;
              const monthP = st?.month_profit ?? 0;
              const equityDailyPct = bal > 0 ? ((todayP + fl) / bal) * 100 : 0;
              const activeDdPct = st?.current_drawdown_pct ?? 0;
              const dailyLim = propDailyLimit();
              const maxDdLim = propMaxDdLimit();
              return (
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
                    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Today (UTC)</div>
                    <div class={`text-sm font-bold font-mono mt-0.5 ${todayP >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {todayP >= 0 ? '+$' : '-$'}{Math.abs(todayP).toFixed(2)}
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono">{(st?.today_r ?? 0) >= 0 ? '+' : ''}{(st?.today_r ?? 0).toFixed(2)}R • {equityDailyPct >= 0 ? '+' : ''}{equityDailyPct.toFixed(2)}%</div>
                  </div>
                  <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
                    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">This Week</div>
                    <div class={`text-sm font-bold font-mono mt-0.5 ${weekP >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {weekP >= 0 ? '+$' : '-$'}{Math.abs(weekP).toFixed(2)}
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono">{(st?.week_r ?? 0) >= 0 ? '+' : ''}{(st?.week_r ?? 0).toFixed(2)}R</div>
                  </div>
                  <div class="bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5">
                    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">This Month</div>
                    <div class={`text-sm font-bold font-mono mt-0.5 ${monthP >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {monthP >= 0 ? '+$' : '-$'}{Math.abs(monthP).toFixed(2)}
                    </div>
                    <div class="text-[10px] text-slate-500 font-mono">{(st?.month_r ?? 0) >= 0 ? '+' : ''}{(st?.month_r ?? 0).toFixed(2)}R</div>
                  </div>
                  <button
                    onClick={() => setMainTab('trades')}
                    class="text-left bg-slate-900/90 border border-slate-800 hover:border-blue-500/40 rounded-xl px-3.5 py-2.5 transition-colors"
                  >
                    <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Floating P&L</div>
                    <div class={`text-sm font-bold font-mono mt-0.5 ${fl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fl >= 0 ? '+$' : '-$'}{Math.abs(fl).toFixed(2)}
                    </div>
                    <div class="text-[10px] text-blue-400 font-medium">{openTrades().length} Open Position{openTrades().length === 1 ? '' : 's'} →</div>
                  </button>
                  <div class="relative bg-slate-900/90 border border-slate-800 rounded-xl px-3.5 py-2.5 col-span-2 sm:col-span-1">
                    <div class="flex items-center justify-between">
                      <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Prop Risk Guard</div>
                      <button
                        onClick={() => setShowPropConfig(!showPropConfig())}
                        class="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700"
                        title="Configure Prop Firm DD limits"
                      >
                        Edit
                      </button>
                    </div>
                    <div class="text-xs font-bold text-slate-200 font-mono mt-1" title="Includes closed today P&L + live floating P&L">
                      Daily Eq: <span class={equityDailyPct <= dailyLim * 0.8 ? 'text-rose-400' : 'text-emerald-400'}>{equityDailyPct.toFixed(2)}%</span> <span class="text-slate-500">/ {dailyLim}%</span>
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono" title={`Historical Max DD: ${(st?.max_drawdown_pct ?? 0).toFixed(2)}%`}>
                      Active DD: <span class={activeDdPct >= maxDdLim * 0.8 ? 'text-rose-400' : 'text-amber-300'}>{activeDdPct.toFixed(2)}%</span> / {maxDdLim}%
                    </div>
                    <Show when={showPropConfig()}>
                      <div class="absolute right-0 top-full mt-1.5 z-40 w-56 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-2 text-xs">
                        <div class="font-bold text-white text-[11px]">Prop Firm Limits</div>
                        <label class="flex items-center justify-between text-slate-300 text-[11px]">
                          <span>Daily Loss %</span>
                          <input
                            id="prop-daily-limit"
                            name="prop_daily_limit"
                            type="number"
                            step="0.5"
                            max="0"
                            value={dailyLim}
                            onChange={(e) => {
                              const v = Number(e.currentTarget.value);
                              if (!isNaN(v) && v <= 0) {
                                setPropDailyLimit(v);
                                setStorageItem('propDailyLimit', v);
                              }
                            }}
                            class="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white"
                          />
                        </label>
                        <label class="flex items-center justify-between text-slate-300 text-[11px]">
                          <span>Max DD %</span>
                          <input
                            id="prop-max-dd-limit"
                            name="prop_max_dd_limit"
                            type="number"
                            step="0.5"
                            min="1"
                            value={maxDdLim}
                            onChange={(e) => {
                              const v = Number(e.currentTarget.value);
                              if (!isNaN(v) && v > 0) {
                                setPropMaxDdLimit(v);
                                setStorageItem('propMaxDdLimit', v);
                              }
                            }}
                            class="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-white"
                          />
                        </label>
                      </div>
                    </Show>
                  </div>
                </div>
              );
            })()}
            <PerformanceChart
              curves={portfolioData()?.curves || []}
              mode={metricMode()}
            />
            <MonthlyHeatmap
              matrix={portfolioData()?.monthly_matrix || []}
              mode={metricMode()}
            />
            <TradingStats
              stats={portfolioData()?.stats || null}
              symbols={portfolioData()?.symbol_stats || []}
              hourly={portfolioData()?.hourly_stats || []}
              days={portfolioData()?.day_of_week_stats || []}
              mode={metricMode()}
            />
          </Show>

          {/* Tab 2: Van Tharp R-Multiple & SQN */}
          <Show when={mainTab() === 'vantharp'}>
            <VanTharpPanel
              stats={portfolioData()?.stats || null}
              rDistribution={portfolioData()?.r_distribution || []}
            />
            <PerformanceChart
              curves={portfolioData()?.curves || []}
              mode="r"
            />
            <MonthlyHeatmap
              matrix={portfolioData()?.monthly_matrix || []}
              mode="r"
            />
          </Show>

          {/* Tab: Excursions (MAE / MFE) */}
          <Show when={mainTab() === 'excursions'}>
            <ExcursionPanel
              excursionStats={portfolioData()?.excursion_stats || null}
              mode={metricMode()}
            />
          </Show>

          {/* Tab: Calendar & Periods (Unified Monthly Analytics + Daily Calendar) */}
          <Show when={mainTab() === 'calendar'}>
            <div class="space-y-4">
              {/* Periodic Sub-tab Switcher Bar */}
              <div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-md backdrop-blur-sm">
                <button
                  onClick={() => setCalendarSubTab('monthly')}
                  class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    calendarSubTab() === 'monthly'
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <CalendarDays size={15} />
                  <span>Monthly Analytics</span>
                </button>

                <button
                  onClick={() => setCalendarSubTab('daily')}
                  class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    calendarSubTab() === 'daily'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <CalendarIcon size={15} />
                  <span>Daily Calendar</span>
                </button>
              </div>

              {/* Sub-view 1: Monthly Analytics (4-Quadrant) */}
              <Show when={calendarSubTab() === 'monthly'}>
                <MonthlyAnalytics
                  monthlyAnalytics={portfolioData()?.monthly_analytics || []}
                  mode={metricMode()}
                />
              </Show>

              {/* Sub-view 2: Daily Calendar */}
              <Show when={calendarSubTab() === 'daily'}>
                <CalendarView
                  days={portfolioData()?.calendar_days || []}
                  mode={metricMode()}
                />
              </Show>
            </div>
          </Show>

          {/* Tab: Advanced Statistics */}
          <Show when={mainTab() === 'advanced'}>
            <AdvancedStats
              stats={portfolioData()?.stats || null}
              currencySummary={portfolioData()?.currency_summary || []}
              hourly={portfolioData()?.hourly_stats || []}
              days={portfolioData()?.day_of_week_stats || []}
              riskOfRuin={portfolioData()?.risk_of_ruin || []}
              durationTrades={portfolioData()?.duration_trades || []}
              mode={metricMode()}
            />
          </Show>

          {/* Tab: Trades & History */}
          <Show when={mainTab() === 'trades'}>
            <TradesTable
              openTrades={openTrades()}
              closedTrades={portfolioData()?.closed_trades || []}
              cashflows={portfolioData()?.cashflows || []}
              mode={metricMode()}
              tradeScope={tradeScope()}
              availableTrades={portfolioData()?.stats?.available_closed_trades || portfolioData()?.stats?.total_trades || 0}
              onSelectTradeScope={(scope) => {
                setTradeScope(scope);
                fetchPortfolio(scope);
              }}
              onNoteSaved={() => fetchPortfolio()}
            />
          </Show>

        </div>

      </main>
    </div>
  );
};

export default App;
