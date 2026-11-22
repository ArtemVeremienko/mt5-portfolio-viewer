import { type Component, createSignal, onMount, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type {
  MetricMode,
  TradeScope,
  AccountInfo,
  PortfolioData,
  OpenPosition,
} from './types';
import {
  getAccounts,
  getOpenTrades,
  getPortfolio,
  switchAccount,
  syncAccount,
} from './api/portfolio';
import { useWebSocket } from './primitives/useWebSocket';
import { Header } from './components/Header';
import { SidebarStats } from './components/SidebarStats';
import { PerformanceChart } from './components/PerformanceChart';
import { MonthlyHeatmap } from './components/MonthlyHeatmap';
import { TradingStats } from './components/TradingStats';
import { TradesTable } from './components/TradesTable';
import { ExcursionPanel } from './components/ExcursionPanel';
import { BenchmarkPanel } from './components/BenchmarkPanel';
import { CalendarView } from './components/CalendarView';
import { AdvancedStats } from './components/AdvancedStats';
import { MonthlyAnalytics } from './components/MonthlyAnalytics';
import { GlobalFilterBar } from './features/layout/GlobalFilterBar';
import { OverviewStrip } from './features/layout/OverviewStrip';
import {
  LineChart,
  Layers,
  Activity,
  Calendar as CalendarIcon,
  BarChart3,
  CalendarDays,
  Dices,
  Filter,
} from 'lucide-solid';

interface LiveWsMessage {
  type: string;
  mt5_connected?: boolean;
  account?: {
    login: number;
    balance: number;
    equity: number;
    margin: number;
    free_margin: number;
  };
  open_positions?: OpenPosition[];
}

export const App: Component = () => {
  const [metricMode, setMetricMode] = createSignal<MetricMode>('currency');
  const [tradeScope, setTradeScope] = createSignal<TradeScope>('all');
  const [accounts, setAccounts] = createSignal<AccountInfo[]>([]);
  const [activeLogin, setActiveLogin] = createSignal<number | null>(null);
  const [portfolioStore, setPortfolioStore] = createStore<{ data: PortfolioData | null }>({
    data: null,
  });
  const [openTrades, setOpenTrades] = createSignal<OpenPosition[]>([]);
  const [isMt5Connected, setIsMt5Connected] = createSignal<boolean>(false);
  const [isWsConnected, setIsWsConnected] = createSignal<boolean>(false);
  const [isSyncing, setIsSyncing] = createSignal<boolean>(false);
  const [mainTab, setMainTab] = createSignal<
    'overview' | 'advanced' | 'excursions' | 'benchmark' | 'calendar' | 'trades'
  >('overview');
  const [calendarSubTab, setCalendarSubTab] = createSignal<'daily' | 'monthly'>('daily');
  const [showFilters, setShowFilters] = createSignal<boolean>(false);

  const [filterStartDate, setFilterStartDate] = createSignal<string>('');
  const [filterEndDate, setFilterEndDate] = createSignal<string>('');
  const [filterSymbol, setFilterSymbol] = createSignal<string>('');
  const [filterDirection, setFilterDirection] = createSignal<string>('');
  const [filterComment, setFilterComment] = createSignal<string>('');
  const [filterMagic, setFilterMagic] = createSignal<string>('');
  const [filterSetupTag, setFilterSetupTag] = createSignal<string>('');
  const [excludeMistakes, setExcludeMistakes] = createSignal<boolean>(false);
  const [revengeWindowMin, setRevengeWindowMin] = createSignal<number>(30);
  const [allAccountsMode, setAllAccountsMode] = createSignal<boolean>(false);
  const [isLoading, setIsLoading] = createSignal<boolean>(true);
  const [fetchError, setFetchError] = createSignal<string | null>(null);

  const portfolioData = () => portfolioStore.data;

  const fetchAccounts = async () => {
    try {
      const data = await getAccounts();
      setAccounts(data.accounts || []);
      setActiveLogin(data.active_login);
      setIsMt5Connected(Boolean(data.mt5_connected));
    } catch (e) {
      console.error('Failed to fetch accounts:', e);
    }
  };

  const fetchPortfolio = async (overrideScope?: TradeScope) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const magicStr = filterMagic();
      const data = await getPortfolio({
        allAccounts: allAccountsMode(),
        symbol: filterSymbol() || undefined,
        direction: filterDirection() || undefined,
        comment: filterComment() || undefined,
        magic: magicStr ? Number(magicStr) : undefined,
        scope: overrideScope || tradeScope(),
        setupTag: filterSetupTag() || undefined,
        excludeMistakes: excludeMistakes(),
        revengeWindowMin: revengeWindowMin(),
      });
      setPortfolioStore('data', reconcile(data));
    } catch (e) {
      console.error('Failed to fetch portfolio data:', e);
      setFetchError('Unable to reach backend server. Check that the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const hasActiveFilters = () =>
    Boolean(
      filterStartDate() ||
        filterEndDate() ||
        filterSymbol() ||
        filterDirection() ||
        filterComment() ||
        filterMagic() ||
        filterSetupTag() ||
        excludeMistakes() ||
        allAccountsMode() ||
        tradeScope() === 'last100'
    );

  const clearAllFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterSymbol('');
    setFilterDirection('');
    setFilterComment('');
    setFilterMagic('');
    setFilterSetupTag('');
    setExcludeMistakes(false);
    setAllAccountsMode(false);
    setTradeScope('all');
    fetchPortfolio('all');
  };

  const fetchOpenTrades = async () => {
    try {
      const data = await getOpenTrades();
      setOpenTrades(data.positions || []);
    } catch (e) {
      console.error('Failed to fetch open trades:', e);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncAccount();
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
      await switchAccount(login);
      setActiveLogin(login);
      await fetchPortfolio();
      await fetchOpenTrades();
    } catch (e) {
      console.error('Switch account failed:', e);
    }
  };

  useWebSocket<LiveWsMessage>('/ws/live', (msg) => {
    setIsWsConnected(true);
    if (msg.type === 'live_update' && msg.account) {
      if (msg.mt5_connected !== undefined) {
        setIsMt5Connected(msg.mt5_connected);
      }
      const currentLogin = activeLogin();
      if (currentLogin !== null && msg.account.login !== currentLogin) {
        return;
      }
      if (msg.open_positions) {
        setOpenTrades(msg.open_positions);
      }
      if (portfolioStore.data) {
        setPortfolioStore('data', 'account', {
          balance: msg.account.balance,
          equity: msg.account.equity,
          margin: msg.account.margin,
          free_margin: msg.account.free_margin,
        });
        setPortfolioStore('data', 'stats', {
          balance: msg.account.balance,
          equity: msg.account.equity,
        });
      }
    }
  });

  onMount(async () => {
    await fetchAccounts();
    await fetchPortfolio();
    await fetchOpenTrades();
  });

  const activeAccount = () => {
    const list = accounts();
    const l = activeLogin();
    return list.find((a) => a.login === l) || portfolioData()?.account || null;
  };

  return (
    <div class="min-h-screen bg-[var(--surface-app)] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      <Header
        accounts={accounts()}
        activeAccount={activeAccount()}
        activeLogin={activeLogin()}
        stats={portfolioData()?.stats || null}
        isMt5Connected={isMt5Connected()}
        isWsConnected={isWsConnected()}
        mode={metricMode()}
        isSyncing={isSyncing()}
        onSelectAccount={handleSelectAccount}
        onSelectMode={(m) => setMetricMode(m)}
        onSync={handleSync}
      />

      <main class="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col gap-5 min-w-0">
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
              mainTab() === 'benchmark'
                ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md shadow-amber-600/30'
                : 'text-amber-400 hover:text-amber-200 hover:bg-amber-950/30'
            }`}
            onClick={() => setMainTab('benchmark')}
          >
            <Dices size={15} />
            <span>Benchmark</span>
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
              mainTab() === 'trades'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            onClick={() => setMainTab('trades')}
          >
            <Layers size={15} />
            <span>Trades ({portfolioData()?.stats.total_trades || 0})</span>
          </button>

          <div class="ml-auto flex items-center gap-1 pl-2 border-l border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters())}
              title={showFilters() || hasActiveFilters() ? 'Hide Filters' : 'Show Filters'}
              aria-label={showFilters() || hasActiveFilters() ? 'Hide Filters' : 'Show Filters'}
              class={`relative p-2 rounded-xl text-xs transition-all ${
                showFilters() || hasActiveFilters()
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Filter size={15} />
              <Show when={hasActiveFilters()}>
                <span class="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-400" />
              </Show>
            </button>
          </div>
        </div>

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
            <div class="h-4 w-48 bg-slate-800 rounded" />
            <div class="h-48 w-full bg-slate-800/60 rounded-xl" />
          </div>
        </Show>

        <GlobalFilterBar
          visible={showFilters() || hasActiveFilters()}
          startDate={filterStartDate()}
          endDate={filterEndDate()}
          symbol={filterSymbol()}
          direction={filterDirection()}
          comment={filterComment()}
          magic={filterMagic()}
          setupTag={filterSetupTag()}
          excludeMistakes={excludeMistakes()}
          allAccountsMode={allAccountsMode()}
          accountsCount={accounts().length}
          tradeScope={tradeScope()}
          availableSymbols={portfolioData()?.available_symbols || []}
          availableComments={portfolioData()?.available_comments || []}
          availableMagics={portfolioData()?.available_magics || []}
          availableSetupTags={portfolioData()?.available_setup_tags || []}
          hasActiveFilters={hasActiveFilters()}
          onStartDateChange={(val) => { setFilterStartDate(val); fetchPortfolio(); }}
          onEndDateChange={(val) => { setFilterEndDate(val); fetchPortfolio(); }}
          onSymbolChange={(val) => { setFilterSymbol(val); fetchPortfolio(); }}
          onDirectionChange={(val) => { setFilterDirection(val); fetchPortfolio(); }}
          onCommentChange={(val) => { setFilterComment(val); fetchPortfolio(); }}
          onMagicChange={(val) => { setFilterMagic(val); fetchPortfolio(); }}
          onSetupTagChange={(val) => { setFilterSetupTag(val); fetchPortfolio(); }}
          onToggleExcludeMistakes={() => { setExcludeMistakes(!excludeMistakes()); fetchPortfolio(); }}
          onToggleAllAccounts={() => { setAllAccountsMode(!allAccountsMode()); fetchPortfolio(); }}
          onReset={clearAllFilters}
        />

        <Show when={mainTab() === 'overview'}>
          <OverviewStrip
            stats={portfolioData()?.stats}
            openCount={openTrades().length}
            onOpenTradesClick={() => setMainTab('trades')}
          />
          <div class="flex flex-col lg:flex-row gap-5 items-stretch">
            <div class="flex-shrink-0 w-full lg:w-auto">
              <SidebarStats
                stats={portfolioData()?.stats || null}
                account={activeAccount()}
                mode={metricMode()}
              />
            </div>
            <div class="flex-1 min-w-0 w-full flex flex-col">
              <PerformanceChart curves={portfolioData()?.curves || []} mode={metricMode()} />
            </div>
          </div>
          <MonthlyHeatmap matrix={portfolioData()?.monthly_matrix || []} mode={metricMode()} />
          <TradingStats
            stats={portfolioData()?.stats || null}
            symbols={portfolioData()?.symbol_stats || []}
            hourly={portfolioData()?.hourly_stats || []}
            days={portfolioData()?.day_of_week_stats || []}
            mode={metricMode()}
          />
        </Show>

        <Show when={mainTab() === 'excursions'}>
          <ExcursionPanel
            excursionStats={portfolioData()?.excursion_stats || null}
            mode={metricMode()}
          />
        </Show>

        <Show when={mainTab() === 'benchmark'}>
          <BenchmarkPanel
            excursionStats={portfolioData()?.excursion_stats || null}
            auditStats={portfolioData()?.audit_stats || null}
            allAccounts={allAccountsMode()}
            symbol={filterSymbol()}
            direction={filterDirection()}
            comment={filterComment()}
            magic={filterMagic()}
            setupTag={filterSetupTag()}
            excludeMistakes={excludeMistakes()}
            revengeWindowMin={revengeWindowMin()}
            onRevengeWindowChange={(min) => { setRevengeWindowMin(min); fetchPortfolio(); }}
            scope={tradeScope()}
          />
        </Show>

        <Show when={mainTab() === 'calendar'}>
          <div class="space-y-4">
            <div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-2xl shadow-md backdrop-blur-sm">
              <button
                onClick={() => setCalendarSubTab('daily')}
                class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  calendarSubTab() === 'daily'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <CalendarIcon size={15} />
                <span>Daily Calendar</span>
              </button>

              <button
                onClick={() => setCalendarSubTab('monthly')}
                class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  calendarSubTab() === 'monthly'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <CalendarDays size={15} />
                <span>Monthly Analytics</span>
              </button>
            </div>

            <Show when={calendarSubTab() === 'daily'}>
              <CalendarView
                days={portfolioData()?.calendar_days || []}
                closedTrades={portfolioData()?.closed_trades || []}
                mode={metricMode()}
                onFilterByDate={(dateStr) => {
                  setFilterStartDate(dateStr);
                  setFilterEndDate(dateStr);
                  fetchPortfolio();
                  setMainTab('trades');
                }}
              />
            </Show>

            <Show when={calendarSubTab() === 'monthly'}>
              <MonthlyAnalytics
                monthlyAnalytics={portfolioData()?.monthly_analytics || []}
                mode={metricMode()}
              />
            </Show>
          </div>
        </Show>

        <Show when={mainTab() === 'advanced'}>
          <AdvancedStats
            stats={portfolioData()?.stats || null}
            rDistribution={portfolioData()?.r_distribution || []}
            currencySummary={portfolioData()?.currency_summary || []}
            hourly={portfolioData()?.hourly_stats || []}
            days={portfolioData()?.day_of_week_stats || []}
            riskOfRuin={portfolioData()?.risk_of_ruin || []}
            durationTrades={portfolioData()?.duration_trades || []}
            mode={metricMode()}
          />
        </Show>

        <Show when={mainTab() === 'trades'}>
          <TradesTable
            openTrades={openTrades()}
            closedTrades={portfolioData()?.closed_trades || []}
            cashflows={portfolioData()?.cashflows || []}
            mode={metricMode()}
            tradeScope={tradeScope()}
            availableTrades={
              portfolioData()?.stats?.available_closed_trades ||
              portfolioData()?.stats?.total_trades ||
              0
            }
            onSelectTradeScope={(scope) => {
              setTradeScope(scope);
              fetchPortfolio(scope);
            }}
            onNoteSaved={() => fetchPortfolio()}
          />
        </Show>
      </main>
    </div>
  );
};

export default App;
