import { onCleanup, onMount } from 'solid-js';

export function useClickOutside(
  getEl: () => HTMLElement | undefined,
  isOpen: () => boolean,
  onClose: () => void
): void {
  const handleMouseDown = (e: MouseEvent) => {
    if (!isOpen()) return;
    const el = getEl();
    if (el && !el.contains(e.target as Node)) {
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen()) {
      onClose();
    }
  };

  onMount(() => {
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('keydown', handleKeyDown);
  });
}
