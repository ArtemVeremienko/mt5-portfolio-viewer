import { type Component, createEffect, createMemo, createSignal, createUniqueId, For, onMount, Show } from 'solid-js';
import type { TradeDeal, OpenPosition, MetricMode, TradeScope, CashflowItem, TradeGrade, ReviewTag, ReviewTagKind, MistakeCategory } from '../types';
import { Search, History, Download, X, ArrowUpDown, Tag, SlidersHorizontal, RotateCcw, CandlestickChart, Pencil, Trash2, Check } from 'lucide-solid';
import { getStorageItem, setStorageItem } from '../utils/storage';
import { TradeChartGrid } from './TradeChartGrid';
import { createTag, deleteTag as deleteTagApi, getTags, updateTag } from '../api/tags';
import { saveTradeNote } from '../api/trades';

type HistoryColumnKey =
  | 'symbol'
  | 'type'
  | 'volume'
  | 'open_time'
  | 'close_time'
  | 'duration'
  | 'open_price'
  | 'close_price'
  | 'sl'
  | 'tp'
  | 'pips'
  | 'swap'
  | 'commission'
  | 'mae'
  | 'mfe'
  | 'ticket'
  | 'net_profit'
  | 'r_multiple'
  | 'comment'
  | 'exit_tag'
  | 'grade'
  | 'journal';

interface HistoryColumnDef {
  key: HistoryColumnKey;
  label: string;
  defaultVisible: boolean;
}

const HISTORY_COLUMNS: HistoryColumnDef[] = [
  { key: 'symbol', label: 'Symbol', defaultVisible: true },
  { key: 'type', label: 'Type', defaultVisible: true },
  { key: 'volume', label: 'Lots', defaultVisible: true },
  { key: 'open_time', label: 'Open Time', defaultVisible: true },
  { key: 'close_time', label: 'Close Time', defaultVisible: false },
  { key: 'duration', label: 'Dur.', defaultVisible: true },
  { key: 'open_price', label: 'Open', defaultVisible: false },
  { key: 'close_price', label: 'Close', defaultVisible: false },
  { key: 'sl', label: 'SL', defaultVisible: false },
  { key: 'tp', label: 'TP', defaultVisible: false },
  { key: 'pips', label: 'Pips', defaultVisible: false },
  { key: 'swap', label: 'Swap', defaultVisible: false },
  { key: 'commission', label: 'Comm.', defaultVisible: false },
  { key: 'mae', label: 'MAE', defaultVisible: false },
  { key: 'mfe', label: 'MFE', defaultVisible: false },
  { key: 'ticket', label: 'Ticket', defaultVisible: false },
  { key: 'net_profit', label: 'Net Profit', defaultVisible: true },
  { key: 'r_multiple', label: 'R-Multiple', defaultVisible: true },
  { key: 'comment', label: 'Comment', defaultVisible: true },
  { key: 'exit_tag', label: 'Exit', defaultVisible: true },
  { key: 'grade', label: 'Grade', defaultVisible: true },
  { key: 'journal', label: 'Journal', defaultVisible: true },
];

function parseTagList(raw?: string): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

const GRADE_OPTIONS: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
const GRADE_SCORE: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

function isRatedGrade(g?: string): g is 'A' | 'B' | 'C' {
  return g === 'A' || g === 'B' || g === 'C';
}

function computeOverallGrade(
  entry?: TradeGrade,
  execution?: TradeGrade,
  management?: TradeGrade
): TradeGrade {
  if (!isRatedGrade(entry) || !isRatedGrade(execution) || !isRatedGrade(management)) {
    return '';
  }
  const avg = (GRADE_SCORE[entry] + GRADE_SCORE[execution] + GRADE_SCORE[management]) / 3;
  if (avg >= 2.5) return 'A';
  if (avg >= 1.5) return 'B';
  return 'C';
}

function gradeBadgeClass(grade: TradeGrade): string {
  if (grade === 'A') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (grade === 'B') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (grade === 'C') return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  return 'bg-slate-800/70 text-slate-400 border-slate-700';
}

function isTradeReviewed(t: TradeDeal): boolean {
  return Boolean(
    t.note ||
      t.setup_tag ||
      t.mistake_tag ||
      t.exit_tag ||
      t.entry_grade ||
      t.execution_grade ||
      t.management_grade
  );
}

const HISTORY_COLUMN_KEYS = new Set<HistoryColumnKey>(HISTORY_COLUMNS.map((c) => c.key));
const DEFAULT_VISIBLE_COLUMNS: HistoryColumnKey[] = HISTORY_COLUMNS
  .filter((c) => c.defaultVisible)
  .map((c) => c.key);
const VISIBLE_COLUMNS_STORAGE_KEY = 'tradesTable.visibleColumns';
const SORT_STORAGE_KEY = 'tradesTable.sort';

type SortCol = 'time' | 'open_time' | 'duration' | 'volume' | 'profit' | 'r_multiple';
type SortDir = 'asc' | 'desc';
interface SortConfig {
  sortBy: SortCol;
  sortDir: SortDir;
}
const VALID_SORT_COLS = new Set<SortCol>(['time', 'open_time', 'duration', 'volume', 'profit', 'r_multiple']);
const DEFAULT_SORT: SortConfig = { sortBy: 'time', sortDir: 'desc' };

function isValidSortConfig(val: unknown): val is SortConfig {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.sortBy === 'string' &&
    VALID_SORT_COLS.has(obj.sortBy as SortCol) &&
    (obj.sortDir === 'asc' || obj.sortDir === 'desc')
  );
}

function isValidColumnList(val: unknown): val is HistoryColumnKey[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    val.every((item): item is HistoryColumnKey =>
      typeof item === 'string' && HISTORY_COLUMN_KEYS.has(item as HistoryColumnKey)
    )
  );
}

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
  const [activeTab, setActiveTab] = createSignal<'open' | 'history' | 'playbook' | 'cashflows'>('history');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [outcomeFilter, setOutcomeFilter] = createSignal<'all' | 'winners' | 'losers' | 'unreviewed'>('all');
  const [gradeFilter, setGradeFilter] = createSignal<'all' | 'A' | 'B' | 'C'>('all');
  const [tagFilter, setTagFilter] = createSignal<string>('');
  const initialSort = getStorageItem(SORT_STORAGE_KEY, DEFAULT_SORT, isValidSortConfig);
  const [sortBy, setSortBy] = createSignal<SortCol>(initialSort.sortBy);
  const [sortDir, setSortDir] = createSignal<SortDir>(initialSort.sortDir);
  const [page, setPage] = createSignal(1);
  const [editingTrade, setEditingTrade] = createSignal<TradeDeal | null>(null);
  const [noteText, setNoteText] = createSignal('');
  const [setupTag, setSetupTag] = createSignal('');
  const [exitTag, setExitTag] = createSignal('');
  const [mistakeTags, setMistakeTags] = createSignal<string[]>([]);
  const [customMistakeInput, setCustomMistakeInput] = createSignal('');
  const [customMistakeCategory, setCustomMistakeCategory] = createSignal<MistakeCategory>('entry');
  const [reviewTags, setReviewTags] = createSignal<ReviewTag[]>([]);
  const [manageTagsMode, setManageTagsMode] = createSignal(false);
  const [editingTagId, setEditingTagId] = createSignal<number | null>(null);
  const [editTagName, setEditTagName] = createSignal('');
  const [editTagCategory, setEditTagCategory] = createSignal<MistakeCategory>('entry');
  const [savingTagEdit, setSavingTagEdit] = createSignal(false);
  const [entryGrade, setEntryGrade] = createSignal<TradeGrade>('');
  const [executionGrade, setExecutionGrade] = createSignal<TradeGrade>('');
  const [managementGrade, setManagementGrade] = createSignal<TradeGrade>('');
  const [initialSlInput, setInitialSlInput] = createSignal('');
  const [savingNote, setSavingNote] = createSignal(false);
  const [visibleColumns, setVisibleColumns] = createSignal<HistoryColumnKey[]>(
    getStorageItem(VISIBLE_COLUMNS_STORAGE_KEY, DEFAULT_VISIBLE_COLUMNS, isValidColumnList)
  );
  const [showColumnsMenu, setShowColumnsMenu] = createSignal(false);
  const columnsPopoverId = createUniqueId();
  const tradeDialogTitleId = createUniqueId();
  let tradeDialogRef: HTMLDialogElement | undefined;
  const pageSize = 20;

  createEffect(() => {
    if (editingTrade() && tradeDialogRef && !tradeDialogRef.open) {
      tradeDialogRef.showModal();
    }
  });

  createEffect(() => {
    if (activeTab() !== 'history') {
      setShowColumnsMenu(false);
    }
  });

  const isColVisible = (key: HistoryColumnKey) => visibleColumns().includes(key);

  const toggleColumn = (key: HistoryColumnKey) => {
    const current = visibleColumns();
    let next: HistoryColumnKey[];
    if (current.includes(key)) {
      if (current.length <= 1) return; // Keep at least one column visible
      next = current.filter((k) => k !== key);
    } else {
      const set = new Set([...current, key]);
      next = HISTORY_COLUMNS.map((c) => c.key).filter((k) => set.has(k));
    }
    setVisibleColumns(next);
    setStorageItem(VISIBLE_COLUMNS_STORAGE_KEY, next);
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    setStorageItem(VISIBLE_COLUMNS_STORAGE_KEY, DEFAULT_VISIBLE_COLUMNS);
  };

  const fetchReviewTags = async () => {
    try {
      const data = await getTags();
      setReviewTags(data.tags || []);
    } catch (e) {
      console.error('Failed to load review tags:', e);
    }
  };

  onMount(() => {
    if (props.openTrades.length > 0) {
      setActiveTab('open');
    }
    fetchReviewTags();
  });

  const setupLibraryTags = createMemo(() =>
    reviewTags()
      .filter((t) => t.kind === 'setup')
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  const exitLibraryTags = createMemo(() =>
    reviewTags().filter((t) => t.kind === 'exit')
  );

  const entryMistakeTags = createMemo(() =>
    reviewTags().filter((t) => t.kind === 'mistake' && t.category !== 'exit_mgmt')
  );

  const exitMistakeTags = createMemo(() =>
    reviewTags().filter((t) => t.kind === 'mistake' && t.category === 'exit_mgmt')
  );

  const findLibraryTag = (kind: ReviewTagKind, name: string): ReviewTag | undefined => {
    const key = name.trim().toLowerCase();
    return reviewTags().find((t) => t.kind === kind && t.name.toLowerCase() === key);
  };

  const toggleMistakeTag = (tag: string) => {
    const key = tag.trim().toLowerCase();
    if (!key) return;
    setMistakeTags((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === key);
      return exists ? prev.filter((t) => t.toLowerCase() !== key) : [...prev, tag.trim()];
    });
  };

  const addCustomMistakeTag = async () => {
    const raw = customMistakeInput().trim();
    if (!raw) return;
    const cat = customMistakeCategory();
    for (const part of parseTagList(raw)) {
      const key = part.toLowerCase();
      setMistakeTags((prev) => (prev.some((t) => t.toLowerCase() === key) ? prev : [...prev, part]));
      try {
        await createTag({ kind: 'mistake', name: part, category: cat });
      } catch (e) {
        console.error('Failed to create custom mistake tag:', e);
      }
    }
    setCustomMistakeInput('');
    await fetchReviewTags();
  };

  const startEditingTag = (tag: ReviewTag) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagCategory(tag.category === 'exit_mgmt' ? 'exit_mgmt' : 'entry');
  };

  const cancelEditingTag = () => {
    setEditingTagId(null);
    setEditTagName('');
  };

  const saveTagEdit = async (tag: ReviewTag) => {
    const nextName = editTagName().trim();
    if (!nextName) return;
    setSavingTagEdit(true);
    try {
      const data = await updateTag(tag.id, {
        name: nextName,
        category: tag.kind === 'mistake' ? editTagCategory() : undefined,
      });
      const updatedName: string = data.tag?.name || nextName;
      const oldLower = tag.name.toLowerCase();
      // Sync currently open journal modal state if applicable
      if (tag.kind === 'setup' && setupTag().trim().toLowerCase() === oldLower) {
        setSetupTag(updatedName);
      } else if (tag.kind === 'exit' && exitTag().trim().toLowerCase() === oldLower) {
        setExitTag(updatedName);
      } else if (tag.kind === 'mistake') {
        setMistakeTags((prev) => {
          const seen = new Set<string>();
          const next: string[] = [];
          for (const m of prev) {
            const val = m.toLowerCase() === oldLower ? updatedName : m;
            if (!seen.has(val.toLowerCase())) {
              seen.add(val.toLowerCase());
              next.push(val);
            }
          }
          return next;
        });
      }
      if (tagFilter().trim().toLowerCase() === oldLower) {
        setTagFilter(updatedName);
      }
      setEditingTagId(null);
      await fetchReviewTags();
      props.onNoteSaved?.();
    } catch (e) {
      console.error('Failed to update tag:', e);
    } finally {
      setSavingTagEdit(false);
    }
  };

  const deleteTag = async (tag: ReviewTag) => {
    const msg =
      tag.usage_count > 0
        ? `Delete tag "${tag.name}"? This will also remove it from ${tag.usage_count} trade(s).`
        : `Delete unused tag "${tag.name}"?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteTagApi(tag.id);
      const oldLower = tag.name.toLowerCase();
      if (tag.kind === 'setup' && setupTag().trim().toLowerCase() === oldLower) {
        setSetupTag('');
      } else if (tag.kind === 'exit' && exitTag().trim().toLowerCase() === oldLower) {
        setExitTag('');
      } else if (tag.kind === 'mistake') {
        setMistakeTags((prev) => prev.filter((m) => m.toLowerCase() !== oldLower));
      }
      if (tagFilter().trim().toLowerCase() === oldLower) {
        setTagFilter('');
      }
      if (editingTagId() === tag.id) {
        setEditingTagId(null);
      }
      await fetchReviewTags();
      props.onNoteSaved?.();
    } catch (e) {
      console.error('Failed to delete tag:', e);
    }
  };

  const openNoteEditor = (t: TradeDeal) => {
    setEditingTrade(t);
    setNoteText(t.note || '');
    setSetupTag(t.setup_tag || '');
    setExitTag(t.exit_tag || '');
    setMistakeTags(parseTagList(t.mistake_tag));
    setCustomMistakeInput('');
    setManageTagsMode(false);
    setEditingTagId(null);
    setEntryGrade(t.entry_grade || '');
    setExecutionGrade(t.execution_grade || '');
    setManagementGrade(t.management_grade || '');
    setInitialSlInput(t.initial_sl != null && t.initial_sl > 0 ? String(t.initial_sl) : '');
  };

  const initialSlValidation = createMemo(() => {
    const t = editingTrade();
    const raw = initialSlInput().trim();
    if (!t || !raw) {
      return { value: null as number | null, error: null as string | null };
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { value: null, error: 'Enter a valid positive price.' };
    }
    const entry = t.open_price || t.price;
    if (entry > 0) {
      if (t.type === 0 && parsed >= entry - 1e-5) {
        return { value: null, error: `Initial SL must be below entry (${entry}) for BUY.` };
      }
      if (t.type === 1 && parsed <= entry + 1e-5) {
        return { value: null, error: `Initial SL must be above entry (${entry}) for SELL.` };
      }
    }
    return { value: parsed, error: null };
  });

  const initialSlPreview = createMemo(() => {
    const t = editingTrade();
    const { value, error } = initialSlValidation();
    if (!t || error || value === null) return null;
    const entry = t.open_price || t.price;
    if (entry <= 0) return null;
    const newDiff = Math.abs(entry - value);
    if (newDiff <= 1e-6) return null;

    let valPerPoint = 0;
    if (t.sl_diff_pts && t.sl_diff_pts > 1e-6 && t.risk_r > 0) {
      valPerPoint = t.risk_r / t.sl_diff_pts;
    } else {
      const closeDiff = Math.abs(t.price - entry);
      const net = getNetProfit(t);
      if (closeDiff > 1e-6 && Math.abs(net) > 1e-4) {
        valPerPoint = Math.abs(net) / closeDiff;
      }
    }
    if (valPerPoint <= 0) return null;
    const est1r = Math.max(0.01, newDiff * valPerPoint);
    const estR = getNetProfit(t) / est1r;
    return { est1r, estR, pts: newDiff };
  });

  const saveNote = async () => {
    const t = editingTrade();
    if (!t) return;
    const { value: parsedInitialSl, error: slError } = initialSlValidation();
    if (slError) return;
    setSavingNote(true);
    try {
      await saveTradeNote({
        ticket: t.ticket,
        account_id: t.account_id,
        note: noteText(),
        setup_tag: setupTag(),
        exit_tag: exitTag().trim(),
        mistake_tag: mistakeTags().join(', '),
        entry_grade: entryGrade(),
        execution_grade: executionGrade(),
        management_grade: managementGrade(),
        initial_sl: parsedInitialSl,
      });
      setEditingTrade(null);
      await fetchReviewTags();
      props.onNoteSaved?.();
    } catch (e) {
      console.error('Failed to save note:', e);
    } finally {
      setSavingNote(false);
    }
  };

  const getNetProfit = (t: TradeDeal) =>
    t.net_profit !== undefined ? t.net_profit : (t.profit + (t.swap || 0) + (t.commission || 0));

  const toggleSort = (col: SortCol) => {
    const nextDir: SortDir = sortBy() === col ? (sortDir() === 'desc' ? 'asc' : 'desc') : 'desc';
    setSortBy(col);
    setSortDir(nextDir);
    setStorageItem<SortConfig>(SORT_STORAGE_KEY, { sortBy: col, sortDir: nextDir });
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
          (t.exit_tag || '').toUpperCase().includes(q) ||
          (t.mistake_tag || '').toUpperCase().includes(q);
        if (!hit) return false;
      }
      const net = getNetProfit(t);
      if (outcome === 'winners' && net <= 0) return false;
      if (outcome === 'losers' && net >= 0) return false;
      if (outcome === 'unreviewed' && isTradeReviewed(t)) return false;
      const gFilter = gradeFilter();
      if (gFilter !== 'all') {
        const overall = computeOverallGrade(t.entry_grade, t.execution_grade, t.management_grade);
        if (overall !== gFilter) return false;
      }
      if (tag) {
        const sTag = (t.setup_tag || '').trim().toLowerCase();
        const eTag = (t.exit_tag || '').trim().toLowerCase();
        const mTags = parseTagList(t.mistake_tag).map((m) => m.toLowerCase());
        if (sTag !== tag && eTag !== tag && !mTags.includes(tag)) return false;
      }
      return true;
    });

    const col = sortBy();
    const dir = sortDir() === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      let va = 0;
      let vb = 0;
      if (col === 'time') { va = a.time; vb = b.time; }
      else if (col === 'open_time') {
        va = a.open_time || a.time || 0;
        vb = b.open_time || b.time || 0;
        if (va === vb) return ((a.time || 0) - (b.time || 0)) * dir;
      } else if (col === 'duration') {
        va = (a.time || 0) - (a.open_time || a.time || 0);
        vb = (b.time || 0) - (b.open_time || b.time || 0);
      } else if (col === 'volume') { va = a.volume; vb = b.volume; }
      else if (col === 'profit') { va = getNetProfit(a); vb = getNetProfit(b); }
      else if (col === 'r_multiple') { va = a.r_multiple; vb = b.r_multiple; }
      return (va - vb) * dir;
    });
  };

  const tagAnalytics = createMemo(() => {
    type TagRow = { tag: string; kind: 'setup' | 'mistake' | 'exit'; trades: number; won: number; totalR: number; totalProfit: number };
    const map = new Map<string, TagRow>();
    const bump = (kind: TagRow['kind'], label: string, net: number, rMult: number) => {
      const key = `${kind}:${label.toLowerCase()}`;
      const cur = map.get(key) || { tag: label, kind, trades: 0, won: 0, totalR: 0, totalProfit: 0 };
      cur.trades += 1;
      if (net > 0) cur.won += 1;
      cur.totalR += rMult;
      cur.totalProfit += net;
      map.set(key, cur);
    };
    for (const t of props.closedTrades) {
      const net = getNetProfit(t);
      const rMult = t.r_multiple || 0;
      const sTag = (t.setup_tag || '').trim();
      const eTag = (t.exit_tag || '').trim();
      if (sTag) bump('setup', sTag, net, rMult);
      if (eTag) bump('exit', eTag, net, rMult);
      for (const mTag of parseTagList(t.mistake_tag)) {
        if (mTag.toLowerCase() === 'none') continue;
        bump('mistake', mTag, net, rMult);
      }
    }
    const all = Array.from(map.values()).sort((a, b) => b.trades - a.trades);
    return {
      setups: all.filter(x => x.kind === 'setup'),
      exits: all.filter(x => x.kind === 'exit'),
      mistakes: all.filter(x => x.kind === 'mistake'),
    };
  });

  const gradeAnalytics = createMemo(() => {
    type GradeRow = { grade: 'A' | 'B' | 'C'; trades: number; won: number; totalR: number; totalProfit: number };
    const map: Record<'A' | 'B' | 'C', GradeRow> = {
      A: { grade: 'A', trades: 0, won: 0, totalR: 0, totalProfit: 0 },
      B: { grade: 'B', trades: 0, won: 0, totalR: 0, totalProfit: 0 },
      C: { grade: 'C', trades: 0, won: 0, totalR: 0, totalProfit: 0 },
    };
    for (const t of props.closedTrades) {
      const overall = computeOverallGrade(t.entry_grade, t.execution_grade, t.management_grade);
      if (!isRatedGrade(overall)) continue;
      const net = getNetProfit(t);
      const cur = map[overall];
      cur.trades += 1;
      if (net > 0) cur.won += 1;
      cur.totalR += t.r_multiple || 0;
      cur.totalProfit += net;
    }
    return GRADE_OPTIONS.map((g) => map[g]).filter((r) => r.trades > 0);
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
      'EntryGrade', 'ExecutionGrade', 'ManagementGrade', 'OverallGrade',
      'SetupTag', 'ExitTag', 'MistakeTag', 'Note', 'Comment'
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
        t.entry_grade || '',
        t.execution_grade || '',
        t.management_grade || '',
        computeOverallGrade(t.entry_grade, t.execution_grade, t.management_grade),
        t.setup_tag || '',
        t.exit_tag || '',
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
          <Show when={props.onSelectTradeScope && (activeTab() === 'history' || activeTab() === 'playbook')}>
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
            <div>
              <button
                type="button"
                {...({ popovertarget: columnsPopoverId } as Record<string, string>)}
                class={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  showColumnsMenu()
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Configure visible Closed History columns"
              >
                <SlidersHorizontal size={13} class="text-blue-400" />
                <span>Columns</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900 text-slate-300 font-mono">
                  {visibleColumns().length}/{HISTORY_COLUMNS.length}
                </span>
              </button>

              <div
                id={columnsPopoverId}
                popover="auto"
                onToggle={(e) => setShowColumnsMenu(e.newState === 'open')}
                class="columns-popover w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 text-slate-200"
              >
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    Columns
                  </span>
                  <button
                    type="button"
                    onClick={resetColumns}
                    class="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                    title="Restore default visible columns"
                  >
                    <RotateCcw size={11} />
                    <span>Reset to Default</span>
                  </button>
                </div>
                <div class="max-h-64 overflow-y-auto space-y-1 pr-1">
                  <For each={HISTORY_COLUMNS}>
                    {(col) => {
                      const checked = () => isColVisible(col.key);
                      const isLastVisible = () => checked() && visibleColumns().length <= 1;
                      return (
                        <label
                          class={`flex items-center justify-between px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors ${
                            isLastVisible()
                              ? 'opacity-60 cursor-not-allowed'
                              : 'hover:bg-slate-800/80 text-slate-200'
                          }`}
                        >
                          <span>{col.label}</span>
                          <input
                            type="checkbox"
                            checked={checked()}
                            disabled={isLastVisible()}
                            onChange={() => toggleColumn(col.key)}
                            class="accent-blue-500 rounded cursor-pointer"
                          />
                        </label>
                      );
                    }}
                  </For>
                </div>
              </div>
            </div>

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
              <For each={['all', 'winners', 'losers', 'unreviewed'] as const}>
                {(o) => (
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
                )}
              </For>
              <span class="mx-1 text-slate-700">|</span>
              <span class="text-slate-500 font-medium mr-0.5">Grade:</span>
              <For each={['all', 'A', 'B', 'C'] as const}>
                {(g) => (
                  <button
                    onClick={() => { setGradeFilter(g); setPage(1); }}
                    class={`px-2 py-1 rounded-lg font-medium border transition-colors ${
                      gradeFilter() === g
                        ? (g === 'all' ? 'bg-blue-600/20 text-blue-300 border-blue-500/40' : gradeBadgeClass(g))
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {g === 'all' ? 'All' : g}
                  </button>
                )}
              </For>
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
                  <Show when={isColVisible('symbol')}><th class="py-2.5 px-2">Symbol</th></Show>
                  <Show when={isColVisible('type')}><th class="py-2.5 px-2">Type</th></Show>
                  <Show when={isColVisible('volume')}>
                    <th class="py-2.5 px-2">
                      <button onClick={() => toggleSort('volume')} class="inline-flex items-center gap-1 hover:text-white">
                        <span>Lots</span><ArrowUpDown size={11} class={sortBy() === 'volume' ? 'text-blue-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('open_time')}>
                    <th class="py-2.5 px-2">
                      <button onClick={() => toggleSort('open_time')} class="inline-flex items-center gap-1 hover:text-white">
                        <span>Open Time</span><ArrowUpDown size={11} class={sortBy() === 'open_time' ? 'text-blue-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('close_time')}>
                    <th class="py-2.5 px-2">
                      <button onClick={() => toggleSort('time')} class="inline-flex items-center gap-1 hover:text-white">
                        <span>Close Time</span><ArrowUpDown size={11} class={sortBy() === 'time' ? 'text-blue-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('duration')}>
                    <th class="py-2.5 px-2">
                      <button onClick={() => toggleSort('duration')} class="inline-flex items-center gap-1 hover:text-white">
                        <span>Dur.</span><ArrowUpDown size={11} class={sortBy() === 'duration' ? 'text-blue-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('open_price')}><th class="py-2.5 px-2">Open</th></Show>
                  <Show when={isColVisible('close_price')}><th class="py-2.5 px-2">Close</th></Show>
                  <Show when={isColVisible('sl')}><th class="py-2.5 px-2">SL</th></Show>
                  <Show when={isColVisible('tp')}><th class="py-2.5 px-2">TP</th></Show>
                  <Show when={isColVisible('pips')}><th class="py-2.5 px-2">Pips</th></Show>
                  <Show when={isColVisible('swap')}><th class="py-2.5 px-2">Swap</th></Show>
                  <Show when={isColVisible('commission')}><th class="py-2.5 px-2">Comm.</th></Show>
                  <Show when={isColVisible('mae')}><th class="py-2.5 px-2">MAE</th></Show>
                  <Show when={isColVisible('mfe')}><th class="py-2.5 px-2">MFE</th></Show>
                  <Show when={isColVisible('ticket')}><th class="py-2.5 px-2">Ticket</th></Show>
                  <Show when={isColVisible('net_profit')}>
                    <th class="py-2.5 px-2">
                      <button onClick={() => toggleSort('profit')} class="inline-flex items-center gap-1 hover:text-white">
                        <span>Net Profit</span><ArrowUpDown size={11} class={sortBy() === 'profit' ? 'text-blue-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('r_multiple')}>
                    <th class="py-2.5 px-2 text-right">
                      <button onClick={() => toggleSort('r_multiple')} class="inline-flex items-center gap-1 hover:text-white ml-auto">
                        <span>R-Multiple</span><ArrowUpDown size={11} class={sortBy() === 'r_multiple' ? 'text-purple-400' : 'opacity-50'} />
                      </button>
                    </th>
                  </Show>
                  <Show when={isColVisible('comment')}><th class="py-2.5 px-2">Comment</th></Show>
                  <Show when={isColVisible('exit_tag')}><th class="py-2.5 px-2">Exit</th></Show>
                  <Show when={isColVisible('grade')}><th class="py-2.5 px-2">Grade</th></Show>
                  <Show when={isColVisible('journal')}><th class="py-2.5 px-2">Journal</th></Show>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                <Show
                  when={paginatedClosed().length > 0}
                  fallback={
                    <tr>
                      <td colspan={visibleColumns().length} class="py-8 text-center text-slate-500 text-xs">
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
                      <Show when={isColVisible('symbol')}>
                        <td class="py-2 px-2 font-bold text-white font-mono">{t.symbol}</td>
                      </Show>
                      <Show when={isColVisible('type')}>
                        <td class="py-2 px-2 font-semibold">
                          <span class={`px-1.5 py-0.5 rounded text-[10px] ${
                            t.type === 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {t.type === 0 ? 'BUY' : 'SELL'}
                          </span>
                        </td>
                      </Show>
                      <Show when={isColVisible('volume')}>
                        <td class="py-2 px-2 text-slate-300 font-mono">{t.volume.toFixed(2)}</td>
                      </Show>
                      <Show when={isColVisible('open_time')}>
                        <td class="py-2 px-2 text-slate-400 font-mono text-[11px]">{formatTimestamp(t.open_time || 0)}</td>
                      </Show>
                      <Show when={isColVisible('close_time')}>
                        <td class="py-2 px-2 text-slate-300 font-mono text-[11px]">{formatTimestamp(t.time)}</td>
                      </Show>
                      <Show when={isColVisible('duration')}>
                        <td class="py-2 px-2 text-slate-400 font-mono text-[11px]">{formatDuration(t.open_time, t.time)}</td>
                      </Show>
                      <Show when={isColVisible('open_price')}>
                        <td class="py-2 px-2 text-slate-300 font-mono">{t.open_price}</td>
                      </Show>
                      <Show when={isColVisible('close_price')}>
                        <td class="py-2 px-2 text-slate-300 font-mono">{t.price}</td>
                      </Show>
                      <Show when={isColVisible('sl')}>
                        <td class="py-2 px-2 font-mono">
                          <Show
                            when={t.initial_sl != null && t.initial_sl > 0}
                            fallback={<span class="text-slate-400">{t.sl > 0 ? t.sl : '—'}</span>}
                          >
                            <span
                              class="text-amber-300"
                              title={`Manual Initial SL: ${t.initial_sl} (MT5 Final SL: ${t.sl > 0 ? t.sl : 'None'})`}
                            >
                              {t.initial_sl}
                            </span>
                          </Show>
                        </td>
                      </Show>
                      <Show when={isColVisible('tp')}>
                        <td class="py-2 px-2 text-slate-400 font-mono">{t.tp > 0 ? t.tp : '—'}</td>
                      </Show>
                      <Show when={isColVisible('pips')}>
                        <td class="py-2 px-2 text-slate-300 font-mono">
                          {t.pips != null ? (t.pips > 0 ? `+${t.pips.toFixed(1)}` : t.pips.toFixed(1)) : '—'}
                        </td>
                      </Show>
                      <Show when={isColVisible('swap')}>
                        <td class="py-2 px-2 text-slate-400 font-mono">{(t.swap || 0).toFixed(2)}</td>
                      </Show>
                      <Show when={isColVisible('commission')}>
                        <td class="py-2 px-2 text-slate-400 font-mono">{(t.commission || 0).toFixed(2)}</td>
                      </Show>
                      <Show when={isColVisible('mae')}>
                        <td class="py-2 px-2 text-rose-400 font-mono">
                          {props.mode === 'r'
                            ? (t.mae_r != null ? `-${Math.abs(t.mae_r).toFixed(2)}R` : '—')
                            : (t.mae_amount != null ? `-$${Math.abs(t.mae_amount).toFixed(2)}` : '—')}
                        </td>
                      </Show>
                      <Show when={isColVisible('mfe')}>
                        <td class="py-2 px-2 text-emerald-400 font-mono">
                          {props.mode === 'r'
                            ? (t.mfe_r != null ? `+${Math.abs(t.mfe_r).toFixed(2)}R` : '—')
                            : (t.mfe_amount != null ? `+$${Math.abs(t.mfe_amount).toFixed(2)}` : '—')}
                        </td>
                      </Show>
                      <Show when={isColVisible('ticket')}>
                        <td class="py-2 px-2 text-slate-400 font-mono">#{t.ticket}</td>
                      </Show>
                      <Show when={isColVisible('net_profit')}>
                        <td class="py-2 px-2 font-bold">
                          <span class={netVal >= 0 ? 'text-emerald-400' : 'text-rose-400'} title={`Gross: ${t.profit.toFixed(2)}`}>
                            {netVal >= 0 ? '+$' : '-$'}{Math.abs(netVal).toFixed(2)}
                          </span>
                        </td>
                      </Show>
                      <Show when={isColVisible('r_multiple')}>
                        <td class="py-2 px-2 text-right font-bold">
                          <span
                            title={
                              t.risk_source === 'manual_sl'
                                ? `1R = $${(t.risk_r || 0.20).toFixed(2)} (Manual Initial SL: ${t.initial_sl}, ${t.sl_diff_pts || '—'} pts)`
                                : t.risk_source === 'sl'
                                  ? `1R = $${(t.risk_r || 0.20).toFixed(2)} (MT5 SL: ${t.sl_diff_pts || '—'} pts)`
                                  : `1R = $${(t.risk_r || 0.20).toFixed(2)} (1% Account Risk Model)`
                            }
                            class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono cursor-help ${
                              t.r_multiple > 0
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                : (t.r_multiple < 0 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'text-slate-400')
                            }`}
                          >
                            <Show when={t.risk_source === 'manual_sl'}>
                              <span class="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            </Show>
                            <span>{t.r_multiple > 0 ? `+${t.r_multiple.toFixed(2)}R` : `${t.r_multiple.toFixed(2)}R`}</span>
                          </span>
                        </td>
                      </Show>
                      <Show when={isColVisible('comment')}>
                        <td class="py-2 px-2 text-slate-400 text-[11px] max-w-[120px] truncate" title={t.comment}>{t.comment || '—'}</td>
                      </Show>
                      <Show when={isColVisible('exit_tag')}>
                        <td class="py-2 px-2">
                          <button
                            onClick={() => openNoteEditor(t)}
                            class={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                              t.exit_tag
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30 hover:bg-sky-500/25'
                                : 'bg-slate-800/40 text-slate-500 border-slate-800 hover:text-slate-300'
                            }`}
                            title={t.exit_tag ? `Exit: ${t.exit_tag}` : 'Set exit tag'}
                          >
                            {t.exit_tag || '—'}
                          </button>
                        </td>
                      </Show>
                      <Show when={isColVisible('grade')}>
                        <td class="py-2 px-2">
                          {(() => {
                            const hasAny = Boolean(t.entry_grade || t.execution_grade || t.management_grade);
                            const overall = computeOverallGrade(t.entry_grade, t.execution_grade, t.management_grade);
                            const sub = `${t.entry_grade || '—'}/${t.execution_grade || '—'}/${t.management_grade || '—'}`;
                            return (
                              <button
                                onClick={() => openNoteEditor(t)}
                                class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                  hasAny
                                    ? gradeBadgeClass(overall)
                                    : 'bg-slate-800/40 text-slate-500 border-slate-800 hover:text-slate-300'
                                }`}
                                title={`Entry: ${t.entry_grade || 'Unrated'} | Execution: ${t.execution_grade || 'Unrated'} | Management: ${t.management_grade || 'Unrated'}`}
                              >
                                <Show when={hasAny} fallback={<span>—</span>}>
                                  <span class="font-bold">{overall || '?'}</span>
                                  <span class="opacity-80">({sub})</span>
                                </Show>
                              </button>
                            );
                          })()}
                        </td>
                      </Show>
                      <Show when={isColVisible('journal')}>
                        <td class="py-2 px-2">
                          <button
                            onClick={() => openNoteEditor(t)}
                            class={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] border transition-colors ${
                              isTradeReviewed(t)
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                                : 'bg-slate-800/70 text-slate-400 border-slate-700 hover:text-white'
                            }`}
                            title={t.note || 'Inspect H1 / M5 / M1 charts & journal'}
                          >
                            <CandlestickChart size={11} class="text-blue-400" />
                            <span>{t.setup_tag || (t.note ? 'Note' : (isTradeReviewed(t) ? 'Graded' : 'Log'))}</span>
                          </button>
                        </td>
                      </Show>
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
            <h4 class="text-xs font-bold uppercase tracking-wider text-blue-400">Grade Breakdown</h4>
            <Show
              when={gradeAnalytics().length > 0}
              fallback={<p class="text-xs text-slate-500 py-4 text-center">No fully graded trades yet. Rate Entry, Execution &amp; Management in Journal.</p>}
            >
              <div class="space-y-1.5">
                <For each={gradeAnalytics()}>
                  {(row) => {
                    const wr = (row.won / Math.max(1, row.trades)) * 100;
                    const expR = row.totalR / Math.max(1, row.trades);
                    return (
                      <button
                        onClick={() => { setGradeFilter(row.grade); setActiveTab('history'); setPage(1); }}
                        class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs transition-colors"
                      >
                        <div class="text-left flex items-center gap-2.5">
                          <span class={`px-2 py-0.5 rounded font-mono font-bold border text-[11px] ${gradeBadgeClass(row.grade)}`}>
                            {row.grade}
                          </span>
                          <div class="text-[10px] text-slate-400 font-mono">
                            {row.trades} {row.trades === 1 ? 'trade' : 'trades'} • WR {wr.toFixed(0)}% • Exp {expR >= 0 ? '+' : ''}{expR.toFixed(2)}R
                          </div>
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

          {(() => {
            const renderTagSection = (
              title: string,
              titleClass: string,
              rows: Array<{ tag: string; kind: ReviewTagKind; trades: number; won: number; totalR: number; totalProfit: number }>,
              emptyMsg: string
            ) => (
              <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 class={`text-xs font-bold uppercase tracking-wider ${titleClass}`}>{title}</h4>
                <Show
                  when={rows.length > 0}
                  fallback={<p class="text-xs text-slate-500 py-4 text-center">{emptyMsg}</p>}
                >
                  <div class="space-y-1.5">
                    <For each={rows}>
                      {(row) => {
                        const wr = (row.won / Math.max(1, row.trades)) * 100;
                        const expR = row.totalR / Math.max(1, row.trades);
                        const libTag = () => findLibraryTag(row.kind, row.tag);
                        const isEditing = () => {
                          const t = libTag();
                          return t !== undefined && editingTagId() === t.id;
                        };
                        return (
                          <Show
                            when={isEditing() && libTag()}
                            fallback={
                              <div class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs transition-colors">
                                <button
                                  type="button"
                                  onClick={() => { setTagFilter(row.tag); setActiveTab('history'); setPage(1); }}
                                  class="flex-1 flex items-center justify-between text-left min-w-0"
                                >
                                  <div class="min-w-0">
                                    <div class="flex items-center gap-1.5">
                                      <span class="font-semibold text-white truncate">{row.tag}</span>
                                      <Show when={row.kind === 'mistake' && libTag()}>
                                        {(lt) => (
                                          <span class="px-1.5 py-0.2 rounded text-[9px] uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                                            {lt().category === 'exit_mgmt' ? 'Exit/Mgmt' : 'Entry'}
                                          </span>
                                        )}
                                      </Show>
                                    </div>
                                    <div class="text-[10px] text-slate-400 font-mono">{row.trades} {row.trades === 1 ? 'trade' : 'trades'} • WR {wr.toFixed(0)}% • Exp {expR >= 0 ? '+' : ''}{expR.toFixed(2)}R</div>
                                  </div>
                                  <div class="text-right font-mono shrink-0 ml-2">
                                    <div class={`font-bold ${row.totalR >= 0 ? 'text-purple-300' : 'text-rose-400'}`}>{row.totalR >= 0 ? '+' : ''}{row.totalR.toFixed(2)}R</div>
                                    <div class={`text-[10px] ${row.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{row.totalProfit >= 0 ? '+$' : '-$'}{Math.abs(row.totalProfit).toFixed(2)}</div>
                                  </div>
                                </button>
                                <Show when={libTag()}>
                                  {(lt) => (
                                    <div class="flex items-center gap-0.5 pl-1 border-l border-slate-800 shrink-0">
                                      <button
                                        type="button"
                                        title={`Edit "${row.tag}"`}
                                        onClick={() => startEditingTag(lt())}
                                        class="p-1 rounded text-slate-500 hover:text-blue-400 hover:bg-slate-800"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        title={`Delete "${row.tag}"`}
                                        onClick={() => deleteTag(lt())}
                                        class="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </Show>
                              </div>
                            }
                          >
                            {(lt) => (
                              <div class="p-2.5 rounded-lg bg-slate-900 border border-blue-500/40 space-y-2 text-xs">
                                <div class="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={editTagName()}
                                    onInput={(e) => setEditTagName(e.currentTarget.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        if (e.isComposing || e.keyCode === 229) return;
                                        e.preventDefault();
                                        saveTagEdit(lt());
                                      } else if (e.key === 'Escape') {
                                        cancelEditingTag();
                                      }
                                    }}
                                    class="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={savingTagEdit() || !editTagName().trim()}
                                    onClick={() => saveTagEdit(lt())}
                                    class="p-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                                    title="Save tag"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditingTag}
                                    class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                                <Show when={lt().kind === 'mistake'}>
                                  <div class="flex items-center gap-1.5 text-[10px]">
                                    <span class="text-slate-400">Category:</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditTagCategory('entry')}
                                      class={`px-2 py-0.5 rounded border ${editTagCategory() === 'entry' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                                    >
                                      Entry
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditTagCategory('exit_mgmt')}
                                      class={`px-2 py-0.5 rounded border ${editTagCategory() === 'exit_mgmt' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                                    >
                                      Exit / Mgmt
                                    </button>
                                  </div>
                                </Show>
                              </div>
                            )}
                          </Show>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            );

            return (
              <>
                {renderTagSection(
                  'Exit Breakdown',
                  'text-sky-400',
                  tagAnalytics().exits,
                  'No exit tags logged yet. Set Exit (TP, SL, BE, Trailing, Manual) in Journal.'
                )}
                {renderTagSection(
                  'Setup Playbook',
                  'text-emerald-400',
                  tagAnalytics().setups,
                  'No setup tags logged yet. Use Journal → Log on closed trades.'
                )}
                {renderTagSection(
                  'Mistake & Execution Leaks',
                  'text-rose-400',
                  tagAnalytics().mistakes,
                  'No mistake tags logged yet.'
                )}
              </>
            );
          })()}
        </div>
      </Show>

      {/* Trade Journal & MTF Chart Modal */}
      <Show when={editingTrade()}>
        {(t) => (
          <dialog
            ref={(el) => { tradeDialogRef = el; }}
            aria-labelledby={tradeDialogTitleId}
            {...({ closedby: 'any' } as Record<string, string>)}
            onClose={() => setEditingTrade(null)}
            class="m-auto p-0 bg-transparent border-0 w-[calc(100%-2rem)] max-w-7xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
          >
            <div class="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-4">
              <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h1 id={tradeDialogTitleId} class="text-sm font-bold text-white">Trade Review &amp; Journal — #{t().ticket}</h1>
                  <p class="text-[11px] text-slate-400 font-mono">
                    {t().symbol} • {t().type === 0 ? 'BUY' : 'SELL'} • {t().volume.toFixed(2)} lots • Entry {t().open_price} → Exit {t().price} • {t().r_multiple >= 0 ? '+' : ''}{t().r_multiple.toFixed(2)}R
                  </p>
                </div>
                <button type="button" onClick={() => tradeDialogRef?.close()} aria-label="Close" class="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div class="lg:col-span-8 flex flex-col">
                  <TradeChartGrid trade={t()} />
                </div>
                <div class="lg:col-span-4 space-y-3 text-xs">
                <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <label for="initial-sl-input" class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Initial Stop Loss (1R)
                    </label>
                    <Show when={initialSlInput().trim().length > 0}>
                      <button
                        type="button"
                        onClick={() => setInitialSlInput('')}
                        class="text-[10px] text-amber-400 hover:text-amber-300"
                      >
                        Reset to MT5 SL
                      </button>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      id="initial-sl-input"
                      type="number"
                      step="any"
                      placeholder={t().sl > 0 ? `MT5 final SL: ${t().sl}` : 'Enter initial SL price...'}
                      value={initialSlInput()}
                      onInput={(e) => setInitialSlInput(e.currentTarget.value)}
                      class={`flex-1 bg-slate-900 border rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none ${
                        initialSlValidation().error
                          ? 'border-rose-500 focus:border-rose-400'
                          : 'border-slate-800 focus:border-amber-500'
                      }`}
                    />
                  </div>
                  <Show when={initialSlValidation().error}>
                    {(err) => <p class="text-[10px] text-rose-400">{err()}</p>}
                  </Show>
                  <Show
                    when={initialSlPreview()}
                    fallback={
                      <p class="text-[10px] text-slate-500 font-mono">
                        Current 1R: ${(t().risk_r || 0).toFixed(2)} ({t().risk_source === 'manual_sl' ? 'Manual SL' : t().risk_source === 'sl' ? `MT5 SL ${t().sl}` : '1% Model'})
                      </p>
                    }
                  >
                    {(prev) => (
                      <p class="text-[10px] text-amber-300 font-mono">
                        Est. 1R: ${prev().est1r.toFixed(2)} • Est. R: {prev().estR >= 0 ? '+' : ''}{prev().estR.toFixed(2)}R
                      </p>
                    )}
                  </Show>
                </div>
                <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Trade Grading</span>
                    {(() => {
                      const overall = computeOverallGrade(entryGrade(), executionGrade(), managementGrade());
                      return (
                        <span class={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${gradeBadgeClass(overall)}`}>
                          {overall ? `Overall: ${overall}` : 'Overall: —'}
                        </span>
                      );
                    })()}
                  </div>
                  <div class="space-y-2">
                    <For each={[
                      { label: 'Entry', value: entryGrade, setter: setEntryGrade },
                      { label: 'Execution', value: executionGrade, setter: setExecutionGrade },
                      { label: 'Position Mgmt', value: managementGrade, setter: setManagementGrade },
                    ]}>
                      {(dim) => (
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-slate-300">{dim.label}</span>
                          <div class="flex items-center gap-1">
                            <For each={GRADE_OPTIONS}>
                              {(g) => {
                                const active = () => dim.value() === g;
                                return (
                                  <button
                                    type="button"
                                    onClick={() => dim.setter(active() ? '' : g)}
                                    class={`w-7 h-6 rounded-md font-mono font-bold text-[11px] border transition-colors ${
                                      active()
                                        ? gradeBadgeClass(g)
                                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                                    }`}
                                  >
                                    {g}
                                  </button>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                {(() => {
                  const renderInlineTagEditor = (kind: ReviewTagKind) => {
                    const editing = () => {
                      const id = editingTagId();
                      if (id === null) return undefined;
                      return reviewTags().find((rt) => rt.id === id && rt.kind === kind);
                    };
                    return (
                      <Show when={editing()}>
                        {(lt) => (
                          <div class="mt-2 p-2.5 rounded-lg bg-slate-900 border border-blue-500/40 space-y-2">
                            <div class="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editTagName()}
                                onInput={(e) => setEditTagName(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (e.isComposing || e.keyCode === 229) return;
                                    e.preventDefault();
                                    saveTagEdit(lt());
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditingTag();
                                  }
                                }}
                                class="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                              />
                              <button
                                type="button"
                                disabled={savingTagEdit() || !editTagName().trim()}
                                onClick={() => saveTagEdit(lt())}
                                class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-medium"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingTag}
                                class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                            <Show when={kind === 'mistake'}>
                              <div class="flex items-center gap-1.5 text-[10px]">
                                <span class="text-slate-400">Category:</span>
                                <button
                                  type="button"
                                  onClick={() => setEditTagCategory('entry')}
                                  class={`px-2 py-0.5 rounded border ${editTagCategory() === 'entry' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                                >
                                  Entry
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditTagCategory('exit_mgmt')}
                                  class={`px-2 py-0.5 rounded border ${editTagCategory() === 'exit_mgmt' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                                >
                                  Exit / Mgmt
                                </button>
                              </div>
                            </Show>
                          </div>
                        )}
                      </Show>
                    );
                  };

                  const renderLibraryChip = (
                    tag: ReviewTag,
                    isActive: () => boolean,
                    activeClass: string,
                    onSelect: () => void
                  ) => (
                    <div
                      class={`inline-flex items-center rounded-md text-[11px] border transition-colors ${
                        isActive()
                          ? activeClass
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={onSelect}
                        class="px-2 py-0.5 font-medium"
                      >
                        {tag.name}
                      </button>
                      <Show when={manageTagsMode()}>
                        <button
                          type="button"
                          title={`Edit "${tag.name}"`}
                          onClick={() => startEditingTag(tag)}
                          class="px-1 py-0.5 text-slate-400 hover:text-blue-400 border-l border-slate-800/80"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          type="button"
                          title={`Delete "${tag.name}"`}
                          onClick={() => deleteTag(tag)}
                          class="px-1 py-0.5 text-slate-400 hover:text-rose-400 border-l border-slate-800/80"
                        >
                          <Trash2 size={10} />
                        </button>
                      </Show>
                    </div>
                  );

                  return (
                    <>
                      <div>
                        <div class="flex items-center justify-between mb-1">
                          <label class="text-slate-400">Setup Tag</label>
                          <button
                            type="button"
                            onClick={() => {
                              setManageTagsMode(!manageTagsMode());
                              setEditingTagId(null);
                            }}
                            class={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                              manageTagsMode()
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            <Pencil size={10} />
                            <span>{manageTagsMode() ? 'Done Managing' : 'Manage Tags'}</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. London Breakout, Pullback EMA20"
                          value={setupTag()}
                          onInput={(e) => setSetupTag(e.currentTarget.value)}
                          class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        <Show when={setupLibraryTags().length > 0}>
                          <div class="flex flex-wrap gap-1.5 mt-1.5">
                            <For each={setupLibraryTags()}>
                              {(tag) =>
                                renderLibraryChip(
                                  tag,
                                  () => setupTag().trim().toLowerCase() === tag.name.toLowerCase(),
                                  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                                  () => setSetupTag(setupTag().trim().toLowerCase() === tag.name.toLowerCase() ? '' : tag.name)
                                )
                              }
                            </For>
                          </div>
                        </Show>
                        {renderInlineTagEditor('setup')}
                      </div>

                      <div>
                        <label class="block text-slate-400 mb-1">Exit Tag</label>
                        <div class="flex flex-wrap gap-1.5 mb-1.5">
                          <For each={exitLibraryTags()}>
                            {(tag) =>
                              renderLibraryChip(
                                tag,
                                () => exitTag().trim().toLowerCase() === tag.name.toLowerCase(),
                                'bg-sky-500/20 text-sky-300 border-sky-500/40',
                                () => setExitTag(exitTag().trim().toLowerCase() === tag.name.toLowerCase() ? '' : tag.name)
                              )
                            }
                          </For>
                        </div>
                        <input
                          type="text"
                          placeholder="Or custom exit reason..."
                          value={exitTag()}
                          onInput={(e) => setExitTag(e.currentTarget.value)}
                          class="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        {renderInlineTagEditor('exit')}
                      </div>

                      <div class="space-y-2">
                        <div class="flex items-center justify-between">
                          <label class="text-slate-400">Mistake Tags</label>
                          <Show when={mistakeTags().length > 0}>
                            <button
                              type="button"
                              onClick={() => setMistakeTags([])}
                              class="text-[10px] text-slate-500 hover:text-rose-400"
                            >
                              Clear ({mistakeTags().length})
                            </button>
                          </Show>
                        </div>

                        <For each={[
                          { group: 'Entry', tags: entryMistakeTags },
                          { group: 'Exit / Mgmt', tags: exitMistakeTags },
                        ]}>
                          {(g) => (
                            <div class="space-y-1">
                              <span class="block text-[10px] uppercase tracking-wider text-slate-500">{g.group}</span>
                              <div class="flex flex-wrap gap-1.5">
                                <For each={g.tags()}>
                                  {(tag) =>
                                    renderLibraryChip(
                                      tag,
                                      () => mistakeTags().some((m) => m.toLowerCase() === tag.name.toLowerCase()),
                                      'bg-rose-500/20 text-rose-300 border-rose-500/40',
                                      () => toggleMistakeTag(tag.name)
                                    )
                                  }
                                </For>
                              </div>
                            </div>
                          )}
                        </For>

                        <Show when={mistakeTags().some((t) => !reviewTags().some((rt) => rt.kind === 'mistake' && rt.name.toLowerCase() === t.toLowerCase()))}>
                          <div class="flex flex-wrap gap-1.5 pt-0.5">
                            <For each={mistakeTags().filter((t) => !reviewTags().some((rt) => rt.kind === 'mistake' && rt.name.toLowerCase() === t.toLowerCase()))}>
                              {(customTag) => (
                                <button
                                  type="button"
                                  onClick={() => toggleMistakeTag(customTag)}
                                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                >
                                  <span>{customTag}</span>
                                  <X size={10} />
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>

                        {renderInlineTagEditor('mistake')}

                        <div class="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Add custom mistake tag..."
                            value={customMistakeInput()}
                            onInput={(e) => setCustomMistakeInput(e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (e.isComposing || e.keyCode === 229) return;
                                e.preventDefault();
                                addCustomMistakeTag();
                              }
                            }}
                            class="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                          />
                          <div class="inline-flex rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => setCustomMistakeCategory('entry')}
                              class={`px-2 py-1 rounded-md font-medium transition-colors ${
                                customMistakeCategory() === 'entry'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Entry
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomMistakeCategory('exit_mgmt')}
                              class={`px-2 py-1 rounded-md font-medium transition-colors ${
                                customMistakeCategory() === 'exit_mgmt'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              Exit
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={addCustomMistakeTag}
                            class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
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
              </div>
              <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => tradeDialogRef?.close()}
                  class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveNote}
                  disabled={savingNote() || Boolean(initialSlValidation().error)}
                  class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {savingNote() ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </dialog>
        )}
      </Show>

    </div>
  );
};
