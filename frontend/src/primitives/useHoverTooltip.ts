import { createSignal, onCleanup } from 'solid-js';

export interface TooltipState<T> {
  item: T;
  x: number;
  y: number;
}

export function useHoverTooltip<T>(hideDelayMs = 80) {
  const [tooltip, setTooltip] = createSignal<TooltipState<T> | null>(null);
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelHide = () => {
    if (leaveTimer !== undefined) {
      clearTimeout(leaveTimer);
      leaveTimer = undefined;
    }
  };

  const show = (item: T, clientX: number, clientY: number) => {
    cancelHide();
    setTooltip({ item, x: clientX, y: clientY });
  };

  const scheduleHide = () => {
    cancelHide();
    leaveTimer = setTimeout(() => setTooltip(null), hideDelayMs);
  };

  const hideNow = () => {
    cancelHide();
    setTooltip(null);
  };

  onCleanup(cancelHide);

  return { tooltip, show, scheduleHide, hideNow };
}
