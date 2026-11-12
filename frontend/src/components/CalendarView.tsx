import { Component, createSignal, For, Show } from 'solid-js';
import { CalendarDay, CalendarDeal, MetricMode } from '../types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-solid';

interface CalendarViewProps {
  days: CalendarDay[];
  mode: MetricMode;
}

export const CalendarView: Component<CalendarViewProps> = (props) => {
  // Current viewed month & year
  const today = new Date();
  const [currentYear, setCurrentYear] = createSignal<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = createSignal<number>(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = createSignal<CalendarDay | null>(null);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => {
    if (currentMonth() === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth() === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const jumpToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  };

  // Map calendar_days array by date "YYYY-MM-DD"
  const dayMap = () => {
    const map = new Map<string, CalendarDay>();
    for (const d of (props.days || [])) {
      map.set(d.date, d);
    }
    return map;
  };

  // Build 7xN calendar matrix for current viewed month
  const calendarCells = () => {
    const yr = currentYear();
    const mo = currentMonth();
    const map = dayMap();

    // First day of month (0=Sun, 1=Mon, ..., 6=Sat)
    const firstDay = new Date(yr, mo, 1).getDay();
    // Number of days in month
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    // Days in previous month
    const prevMonthDays = new Date(yr, mo, 0).getDate();

    interface CellData {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      dayData?: CalendarDay;
    }

    const cells: CellData[] = [];

    // Previous month filler days
    for (let i = firstDay - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const pMo = mo === 0 ? 11 : mo - 1;
      const pYr = mo === 0 ? yr - 1 : yr;
      const dateStr = `${pYr}-${String(pMo + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: false,
        dayData: map.get(dateStr)
      });
    }

    // Current month days
    const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dateStr === todayDateStr,
        dayData: map.get(dateStr)
      });
    }

    // Next month filler days to complete standard 35 or 42 grid
    const remaining = (7 - (cells.length % 7)) % 7;
    const targetLength = cells.length + remaining < 35 ? 35 : cells.length + remaining;
    const fillerCount = targetLength - cells.length;
    for (let d = 1; d <= fillerCount; d++) {
      const nMo = mo === 11 ? 0 : mo + 1;
      const nYr = mo === 11 ? yr + 1 : yr;
      const dateStr = `${nYr}-${String(nMo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: false,
        dayData: map.get(dateStr)
      });
    }

    return cells;
  };

  const formatProfit = (pnl: number, r: number) => {
    if (props.mode === 'r') {
      return (r >= 0 ? '+' : '') + r.toFixed(2) + 'R';
    }
    return (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div class="space-y-4">
      {/* Calendar Header Card */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h3 class="text-sm font-bold text-white tracking-wide">Trading Calendar</h3>
            <p class="text-xs text-slate-400">Monthly PnL performance, trade count, and win/loss ratio by day</p>
          </div>
        </div>

        {/* Month Navigation Controls */}
        <div class="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-xl shadow-inner">
          <button
            onClick={prevMonth}
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>
          
          <span class="text-xs font-bold text-slate-100 min-w-[130px] text-center tracking-wide font-mono">
            {monthNames[currentMonth()]} {currentYear()}
          </span>

          <button
            onClick={nextMonth}
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>

          <div class="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={jumpToToday}
            class="text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2.5 py-1 rounded-lg transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid Container */}
      <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm overflow-hidden">
        {/* Days of week header */}
        <div class="grid grid-cols-7 gap-2 mb-2">
          <For each={['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}>
            {(dayName) => (
              <div class="text-center text-[11px] font-bold text-slate-400 py-1.5 tracking-wider uppercase">
                {dayName}
              </div>
            )}
          </For>
        </div>

        {/* Month Grid */}
        <div class="grid grid-cols-7 gap-2">
          <For each={calendarCells()}>
            {(cell) => {
              const data = () => cell.dayData;
              const hasTrades = () => Boolean(data() && data()!.trades > 0);
              const isProfit = () => Boolean(data() && data()!.profit >= 0);

              return (
                <div
                  onClick={() => {
                    if (hasTrades()) {
                      setSelectedDay(data() || null);
                    }
                  }}
                  class={`min-h-[105px] sm:min-h-[120px] rounded-xl p-2.5 flex flex-col justify-between border transition-all relative select-none ${
                    !cell.isCurrentMonth
                      ? 'bg-slate-950/40 border-slate-850/40 opacity-40 text-slate-600'
                      : hasTrades()
                        ? isProfit()
                          ? 'bg-[#132c25]/90 border-emerald-500/40 hover:border-emerald-400 hover:shadow-lg hover:shadow-emerald-950/40 cursor-pointer'
                          : 'bg-[#31161a]/90 border-rose-500/40 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-950/40 cursor-pointer'
                        : 'bg-slate-950/60 border-slate-800/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {/* Top: Day Number & Today Marker */}
                  <div class="flex items-center justify-between">
                    <span class={`text-[11px] font-mono font-semibold ${
                      cell.isToday
                        ? 'w-6 h-6 rounded-full border-2 border-white text-white flex items-center justify-center font-bold text-xs bg-blue-600/60 shadow'
                        : cell.isCurrentMonth
                          ? 'text-slate-300'
                          : 'text-slate-600'
                    }`}>
                      {cell.dayNum}
                    </span>

                    <Show when={hasTrades()}>
                      <span class={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                        isProfit() ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {isProfit() ? 'Win' : 'Loss'}
                      </span>
                    </Show>
                  </div>

                  {/* Middle / Bottom: Trading Stats (Matching Screenshot 1) */}
                  <Show when={hasTrades()} fallback={
                    <div class="flex-1 flex items-center justify-center">
                      <span class="text-[10px] text-slate-700 font-mono">--</span>
                    </div>
                  }>
                    <div class="mt-1 space-y-0.5">
                      {/* PnL Amount */}
                      <div class={`text-xs sm:text-sm font-bold font-mono tracking-tight ${
                        isProfit() ? 'text-emerald-300' : 'text-rose-300'
                      }`}>
                        {formatProfit(data()!.profit, data()!.r)}
                      </div>

                      {/* Trade Count */}
                      <div class="text-[10px] text-slate-300 font-medium">
                        {data()!.trades} {data()!.trades === 1 ? 'Trade' : 'Trades'}
                      </div>

                      {/* Win · Loss */}
                      <div class="text-[9px] text-slate-400 font-mono">
                        {data()!.won} Win · {data()!.lost} Loss
                      </div>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Trade Drill-down Modal / Drawer on Day Click */}
      <Show when={selectedDay()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div class="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
              <div class="flex items-center gap-3">
                <div class={`p-2 rounded-xl ${
                  (selectedDay()?.profit || 0) >= 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  <CalendarIcon size={18} />
                </div>
                <div>
                  <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    Trades on {selectedDay()?.date}
                    <span class={`text-xs px-2 py-0.5 rounded-full font-mono ${
                      (selectedDay()?.profit || 0) >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {formatProfit(selectedDay()?.profit || 0, selectedDay()?.r || 0)}
                    </span>
                  </h4>
                  <p class="text-xs text-slate-400">
                    {selectedDay()?.trades} closed {selectedDay()?.trades === 1 ? 'trade' : 'trades'} · {selectedDay()?.won} Won, {selectedDay()?.lost} Lost ({selectedDay()?.win_rate}%)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDay(null)}
                class="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Trades List */}
            <div class="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-800/60">
              <For each={selectedDay()?.deals || []}>
                {(deal) => {
                  const isWon = deal.profit >= 0;
                  return (
                    <div class="pt-2.5 first:pt-0 flex items-center justify-between text-xs hover:bg-slate-850/40 p-2 rounded-xl transition-colors">
                      <div class="flex items-center gap-3">
                        <div class={`p-1.5 rounded-lg ${
                          isWon ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {isWon ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                        </div>
                        <div>
                          <div class="flex items-center gap-2 font-bold text-white font-mono">
                            <span>{deal.symbol}</span>
                            <span class={`text-[10px] px-1.5 py-0.2 rounded uppercase ${
                              deal.type === 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {deal.type_str} {deal.volume}L
                            </span>
                          </div>
                          <div class="text-[11px] text-slate-400 font-mono mt-0.5">
                            Ticket #{deal.ticket} · {deal.duration_str} duration
                          </div>
                        </div>
                      </div>

                      <div class="text-right">
                        <div class={`font-bold font-mono text-sm ${isWon ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {deal.profit >= 0 ? '+$' : '-$'}{Math.abs(deal.profit).toFixed(2)}
                        </div>
                        <div class="text-[10px] text-slate-400 font-mono">
                          {deal.pips >= 0 ? '+' : ''}{deal.pips.toFixed(1)} pips · {deal.r_multiple >= 0 ? '+' : ''}{deal.r_multiple.toFixed(2)}R
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>

            {/* Modal Footer */}
            <div class="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedDay(null)}
                class="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
};
