// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { CalendarView } from './CalendarView';
import type { CalendarDay } from '../types';

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

describe('CalendarView native <dialog> modal', () => {
  let container: HTMLDivElement;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    dispose?.();
    container.remove();
    vi.restoreAllMocks();
  });

  it('opens a native <dialog> with showModal(), semantic heading, closedby="any", and closes cleanly on close event', async () => {
    const { showModalSpy, closeSpy } = installDialogPolyfill();

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-15`;

    const days: CalendarDay[] = [
      {
        date: dateStr,
        profit: 125.5,
        r: 1.5,
        trades: 1,
        won: 1,
        lost: 0,
        win_rate: 100,
        deals: [
          {
            ticket: 1001,
            symbol: 'EURUSD',
            type: 0,
            type_str: 'BUY',
            volume: 0.5,
            open_price: 1.1,
            close_price: 1.1025,
            open_time: 1700000000,
            close_time: 1700003600,
            duration_seconds: 3600,
            duration_str: '1h',
            profit: 125.5,
            pips: 25,
            commission: 0,
            r_multiple: 1.5,
          },
        ],
      },
    ];

    dispose = render(() => <CalendarView days={days} mode="currency" />, container);

    expect(container.querySelector('dialog')).toBeNull();

    // Click the day cell for the 15th
    const dayCell = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
      el.textContent?.includes('+$126') || el.textContent?.includes('$125.50') || el.textContent?.includes('1T')
    ) as HTMLElement | undefined;
    expect(dayCell).toBeDefined();
    dayCell!.click();

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

    // Click close button
    const closeBtn = dialog!.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    closeBtn!.click();

    await Promise.resolve();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('dialog')).toBeNull();
  });
});
