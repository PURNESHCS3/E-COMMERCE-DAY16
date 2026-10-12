import { useContext } from "react";
import { RealtimeContext } from "./RealtimeContext";
import type { RealtimeContextValue } from "./RealtimeContext";

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within RealtimeProvider.");
  }
  return context;
}
