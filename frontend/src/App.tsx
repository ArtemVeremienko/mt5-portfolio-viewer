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
  const [mainTab, setMainTab] = createSignal<'overview' | 'vantharp' | 'excursions' | 'calendar' | 'monthly' | 'advanced' | 'trades'>('overview');

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
    try {
      const scopeVal = overrideScope || tradeScope();
      const scopeParam = scopeVal === 'last100' ? '?scope=last100' : '';
      const res = await fetch(`/api/portfolio${scopeParam}`);
      if (res.ok) {
        const data: PortfolioData = await res.json();
        setPortfolioData(data);
      }
    } catch (e) {
      console.error('Failed to fetch portfolio data:', e);
    }
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
            if (msg.open_positions) {
              setOpenTrades(msg.open_positions);
            }
            if (msg.account) {
              setIsMt5Connected(msg.account.is_connected);
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
        tradeScope={tradeScope()}
        availableTrades={portfolioData()?.stats?.available_closed_trades || portfolioData()?.stats?.total_trades || 0}
        isSyncing={isSyncing()}
        onSelectAccount={handleSelectAccount}
        onSelectMode={(m) => {
          setMetricMode(m);
          if (m === 'r' && mainTab() === 'overview') {
            setMainTab('vantharp');
          }
        }}
        onSelectTradeScope={(scope) => {
          setTradeScope(scope);
          fetchPortfolio(scope);
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
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'overview'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              onClick={() => setMainTab('overview')}
            >
              <LineChart size={15} />
              <span>Performance Curves</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'vantharp'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-purple-400 hover:text-purple-200 hover:bg-purple-950/30'
              }`}
              onClick={() => setMainTab('vantharp')}
            >
              <Award size={15} />
              <span>Dr. Van Tharp (R & SQN)</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'excursions'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                  : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/30'
              }`}
              onClick={() => setMainTab('excursions')}
            >
              <Activity size={15} />
              <span>Excursions (MAE / MFE)</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'calendar'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/30'
              }`}
              onClick={() => setMainTab('calendar')}
            >
              <CalendarIcon size={15} />
              <span>Calendar View</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'monthly'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-purple-400 hover:text-purple-200 hover:bg-purple-950/30'
              }`}
              onClick={() => setMainTab('monthly')}
            >
              <CalendarDays size={15} />
              <span>Monthly Analytics</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'advanced'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-blue-400 hover:text-blue-200 hover:bg-blue-950/30'
              }`}
              onClick={() => setMainTab('advanced')}
            >
              <BarChart3 size={15} />
              <span>Advanced Statistics</span>
            </button>

            <button
              class={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                mainTab() === 'trades'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              onClick={() => setMainTab('trades')}
            >
              <Layers size={15} />
              <span>Open & History Trades ({portfolioData()?.stats.total_trades || 0})</span>
            </button>
          </div>

          {/* Tab 1: Overview & Interactive Curves */}
          <Show when={mainTab() === 'overview'}>
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

          {/* Tab: Calendar View */}
          <Show when={mainTab() === 'calendar'}>
            <CalendarView
              days={portfolioData()?.calendar_days || []}
              mode={metricMode()}
            />
          </Show>

          {/* Tab: Monthly Analytics */}
          <Show when={mainTab() === 'monthly'}>
            <MonthlyAnalytics
              monthlyAnalytics={portfolioData()?.monthly_analytics || []}
              mode={metricMode()}
            />
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
              mode={metricMode()}
            />
          </Show>

        </div>

      </main>
    </div>
  );
};

export default App;
