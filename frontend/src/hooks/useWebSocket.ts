import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWebSocketOptions {
  url: string;
  onMessage: (event: MessageEvent) => void;
  onOpen?: () => void;
  maxRetries?: number;
  baseDelay?: number;
}

interface UseWebSocketReturn {
  ws: WebSocket | null;
  connect: () => void;
  disconnect: () => void;
  send: (data: string | ArrayBuffer) => void;
  isConnected: boolean;
  retryCount: number;
}

/**
 * WebSocket hook with exponential backoff reconnection.
 * Does NOT reconnect on normal close (code 1000) or auth errors (4xx).
 */
export function useWebSocket({
  url,
  onMessage,
  onOpen,
  maxRetries = 5,
  baseDelay = 1000,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalClose = useRef(false);

  // Use refs for callbacks to avoid unstable props triggering reconnects
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  const cleanup = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    intentionalClose.current = false;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setIsConnected(true);
      retryCountRef.current = 0;
      setRetryCount(0);
      onOpenRef.current?.();
    };

    ws.onmessage = (e) => onMessageRef.current(e);

    ws.onclose = (event) => {
      setIsConnected(false);
      wsRef.current = null;

      // Don't reconnect on intentional close, normal close, or auth errors
      if (intentionalClose.current || event.code === 1000 || (event.code >= 4000 && event.code < 5000)) {
        return;
      }

      // Exponential backoff reconnection
      if (retryCountRef.current < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCountRef.current);
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onerror always fires before onclose, so reconnection is handled in onclose
    };

    wsRef.current = ws;
  }, [url, maxRetries, baseDelay, cleanup]);

  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    cleanup();
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [cleanup]);

  const send = useCallback((data: string | ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return {
    ws: wsRef.current,
    connect,
    disconnect,
    send,
    isConnected,
    retryCount,
  };
}
