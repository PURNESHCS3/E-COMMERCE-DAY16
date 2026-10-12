import { createContext } from "react";
import type { WebSocketStatus } from "../hooks/useWebSocket";
import type { ClientRealtimeEvent, ServerRealtimeEvent } from "../types";

export type RealtimeListener = (event: ServerRealtimeEvent) => void;

export interface RealtimeContextValue {
  status: WebSocketStatus;
  send: (event: ClientRealtimeEvent) => boolean;
  subscribe: (listener: RealtimeListener) => () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
