import { onCleanup, onMount } from 'solid-js';

export function useWebSocket<T>(
  path: string,
  onMessage: (data: T) => void,
  reconnectDelayMs = 3000
): void {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const connect = () => {
    if (disposed || typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}${path}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data)) as T;
        onMessage(parsed);
      } catch {
        // ignore malformed WS frames
      }
    };

    ws.onclose = () => {
      if (!disposed) {
        reconnectTimer = setTimeout(connect, reconnectDelayMs);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  };

  onMount(connect);

  onCleanup(() => {
    disposed = true;
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
    }
    ws?.close();
  });
}
