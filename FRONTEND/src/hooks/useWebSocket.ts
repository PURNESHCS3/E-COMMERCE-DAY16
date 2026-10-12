import { useCallback, useEffect, useRef, useState } from "react";
import { getWebSocketUrl } from "../services/api";
import { refreshSessionTokens } from "../services/auth";
import type { ClientRealtimeEvent, ServerRealtimeEvent } from "../types";

export type WebSocketStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

interface UseWebSocketOptions {
  enabled: boolean;
  onMessage: (event: ServerRealtimeEvent) => void;
}

const MAX_RECONNECT_DELAY_MS = 30_000;

export function useWebSocket({ enabled, onMessage }: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let attempts = 0;
    let reconnectTimer: number | undefined;
    let stableTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;
      const token = localStorage.getItem("access_token");
      if (!token) return;

      setStatus(attempts === 0 ? "connecting" : "reconnecting");
      socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        socket?.send(JSON.stringify({ type: "auth", token }));
      };

      socket.onmessage = (message) => {
        let event: ServerRealtimeEvent;
        try {
          event = JSON.parse(message.data) as ServerRealtimeEvent;
        } catch (error) {
          console.error("Received invalid WebSocket JSON.", error);
          return;
        }

        if (event.type === "auth.ok") {
          setStatus("connected");
          if (stableTimer !== undefined) window.clearTimeout(stableTimer);
          stableTimer = window.setTimeout(() => {
            attempts = 0;
          }, 30_000);
        }
        onMessageRef.current(event);
      };

      socket.onerror = () => socket?.close();
      socket.onclose = (event) => {
        if (stableTimer !== undefined) {
          window.clearTimeout(stableTimer);
          stableTimer = undefined;
        }
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        if (event.code === 1000 || event.code === 4403) {
          setStatus("disconnected");
          return;
        }

        setStatus("reconnecting");
        const delay = Math.min(1000 * 2 ** attempts, MAX_RECONNECT_DELAY_MS);
        attempts += 1;
        reconnectTimer = window.setTimeout(async () => {
          if (event.code === 4401) {
            try {
              await refreshSessionTokens();
            } catch (error) {
              if (disposed) return;
              console.error("Unable to refresh credentials for the WebSocket.", error);
              window.dispatchEvent(new Event("auth:logout"));
              setStatus("disconnected");
              return;
            }
          }
          if (disposed) return;
          connect();
        }, delay);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (stableTimer !== undefined) window.clearTimeout(stableTimer);
      socket?.close(1000, "Component unmounted");
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [enabled]);

  const send = useCallback((event: ClientRealtimeEvent): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(event));
    return true;
  }, []);

  return { status: enabled ? status : "disconnected", send };
}
