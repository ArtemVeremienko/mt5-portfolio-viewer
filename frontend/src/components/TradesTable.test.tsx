// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import type { ReviewTag, TradeDeal } from '../types';

const mockTags: ReviewTag[] = [
  { id: 1, name: 'Breakout', kind: 'setup', category: '', is_default: false, created_at: 1700000000, usage_count: 0 },
  { id: 2, name: 'FOMO', kind: 'mistake', category: 'entry', is_default: false, created_at: 1700000000, usage_count: 0 },
];

const updateTagSpy = vi.fn(async (id: number, patch: Partial<ReviewTag>) => ({
  ...mockTags.find((t) => t.id === id)!,
  ...patch,
}));

vi.mock('../api/tags', () => ({
  getTags: vi.fn(async () => ({ tags: mockTags })),
  createTag: vi.fn(async (payload: Omit<ReviewTag, 'id'>) => ({ id: 99, ...payload })),
  updateTag: (...args: Parameters<typeof updateTagSpy>) => updateTagSpy(...args),
  deleteTag: vi.fn(async () => undefined),
}));

const saveTradeNoteSpy = vi.fn(async (_payload: unknown) => ({ status: 'ok' }));

vi.mock('../api/trades', () => ({
  saveTradeNote: (payload: unknown) => saveTradeNoteSpy(payload),
  getTradeCandles: vi.fn(async () => ({ ticket: 1, h1: [], m5: [], m1: [], cached: true, mt5_connected: false })),
}));

vi.mock('./TradeChartGrid', () => ({
  TradeChartGrid: () => <div data-testid="mock-chart-grid" />,
}));

import { TradesTable } from './TradesTable';

function installDialogPolyfill() {
  const showModalSpy = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const closeSpy = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModalSpy,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: closeSpy,
  });
  return { showModalSpy, closeSpy };
}

function makeTrade(overrides: Partial<TradeDeal> = {}): TradeDeal {
  return {
    ticket: 4242,
    order_id: 4242,
    account_id: 1,
    time: 1700003600,
    open_time: 1700000000,
    type: 0,
    symbol: 'EURUSD',
    volume: 0.5,
    price: 1.1025,
    open_price: 1.1,
    sl: 1.098,
    tp: 1.105,
    profit: 125,
    swap: 0,
    commission: -2,
    comment: '',
    pips: 25,
    risk_r: 100,
    r_multiple: 1.23,
    net_profit: 123,
    ...overrides,
  };
}

describe('TradesTable modern web interactions', () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    updateTagSpy.mockClear();
    saveTradeNoteSpy.mockClear();
  });

  afterEach(() => {
    dispose?.();
    container.remove();
    vi.restoreAllMocks();
  });

  it('wires the Columns button to a [popover="auto"] panel and resets active state on tab switch', async () => {
    dispose = render(
      () => <TradesTable openTrades={[]} closedTrades={[makeTrade()]} mode="currency" />,
      container
    );
    await Promise.resolve();

    const columnsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Columns')
    ) as HTMLButtonElement | undefined;
    expect(columnsBtn).toBeDefined();

    const targetId = columnsBtn!.getAttribute('popovertarget');
    expect(targetId).toBeTruthy();

    const popoverEl = container.querySelector(`[id="${targetId}"]`) as HTMLElement | null;
    expect(popoverEl).not.toBeNull();
    expect(popoverEl!.getAttribute('popover')).toBe('auto');
    expect(popoverEl!.classList.contains('columns-popover')).toBe(true);

    // Simulate browser ToggleEvent('toggle', { newState: 'open' })
    const openEvt = new Event('toggle') as Event & { newState: string };
    Object.defineProperty(openEvt, 'newState', { value: 'open' });
    popoverEl!.dispatchEvent(openEvt);
    expect(columnsBtn!.className).toContain('bg-blue-600/20');

    // Switch to Open Positions tab and back to Closed History: active state must reset
    const openTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open Positions')
    ) as HTMLButtonElement;
    openTabBtn.click();
    await Promise.resolve();

    const historyTabBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Closed History')
    ) as HTMLButtonElement;
    historyTabBtn.click();
    await Promise.resolve();

    const columnsBtnAfter = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Columns')
    ) as HTMLButtonElement;
    expect(columnsBtnAfter.className).not.toContain('bg-blue-600/20');
  });

  it('opens trade review <dialog> via showModal() and blocks IME Enter in custom mistake input', async () => {
    const { showModalSpy, closeSpy } = installDialogPolyfill();

    dispose = render(
      () => <TradesTable openTrades={[]} closedTrades={[makeTrade()]} mode="currency" />,
      container
    );
    // Flush onMount async getTags()
    await Promise.resolve();
    await Promise.resolve();

    const reviewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Log'
    ) as HTMLButtonElement | undefined;
    expect(reviewBtn).toBeDefined();
    reviewBtn!.click();
    await Promise.resolve();

    const dialog = container.querySelector('dialog') as HTMLDialogElement | null;
    expect(dialog).not.toBeNull();
    expect(showModalSpy).toHaveBeenCalledTimes(1);
    expect(dialog!.getAttribute('closedby')).toBe('any');
    expect(dialog!.hasAttribute('role')).toBe(false);
    expect(dialog!.hasAttribute('aria-modal')).toBe(false);

    const labelledBy = dialog!.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = dialog!.querySelector('h1');
    expect(heading).not.toBeNull();
    expect(heading!.id).toBe(labelledBy);

    // Test IME-safe Enter on custom mistake tag input
    const mistakeInput = dialog!.querySelector(
      'input[placeholder="Add custom mistake tag..."]'
    ) as HTMLInputElement | null;
    expect(mistakeInput).not.toBeNull();

    mistakeInput!.value = 'Early exit';
    mistakeInput!.dispatchEvent(new Event('input', { bubbles: true }));

    // 1. isComposing === true must NOT submit
    const composingEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    mistakeInput!.dispatchEvent(composingEnter);
    expect(mistakeInput!.value).toBe('Early exit');

    // 2. Safari keyCode === 229 fallback must NOT submit
    const safari229Enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: false,
    });
    Object.defineProperty(safari229Enter, 'keyCode', { value: 229 });
    mistakeInput!.dispatchEvent(safari229Enter);
    expect(mistakeInput!.value).toBe('Early exit');

    // 3. Normal Enter DOES submit and clears the input
    const realEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: false,
    });
    mistakeInput!.dispatchEvent(realEnter);
    expect(realEnter.defaultPrevented).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(mistakeInput!.value).toBe('');

    // Close dialog via Close button
    const closeBtn = dialog!.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    closeBtn.click();
    await Promise.resolve();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('validates Initial SL override in the journal modal and submits initial_sl on save', async () => {
    installDialogPolyfill();
    dispose = render(
      () => (
        <TradesTable
          openTrades={[]}
          closedTrades={[makeTrade({ open_price: 1.1, sl: 1.098, sl_diff_pts: 0.002, risk_r: 100, risk_source: 'sl' })]}
          mode="currency"
        />
      ),
      container
    );
    await Promise.resolve();
    await Promise.resolve();

    const reviewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Log'
    ) as HTMLButtonElement;
    reviewBtn.click();
    await Promise.resolve();

    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    // Collapsed by default when no manual initial_sl is set
    expect(dialog.querySelector('#initial-sl-input')).toBeNull();
    const toggleBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Initial SL Override (1R)')
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    // Expand section
    toggleBtn.click();
    await Promise.resolve();
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

    const slInput = dialog.querySelector('#initial-sl-input') as HTMLInputElement;
    const saveBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save Note'
    ) as HTMLButtonElement;

    // Wrong-side SL for BUY (above open_price 1.1) -> shows error & disables Save
    slInput.value = '1.105';
    slInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(dialog.textContent).toContain('must be below entry');
    expect(saveBtn.disabled).toBe(true);

    // Valid wider SL (1.096 = 2x risk) -> enables Save and submits initial_sl
    slInput.value = '1.096';
    slInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(saveBtn.disabled).toBe(false);
    expect(dialog.textContent).toContain('Est. 1R: $200.00');

    saveBtn.click();
    await Promise.resolve();
    expect(saveTradeNoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: 4242,
        initial_sl: 1.096,
      })
    );
  });
});
