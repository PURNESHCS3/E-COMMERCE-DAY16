import {
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { useWebSocket } from "../hooks/useWebSocket";
import { getBackgroundJobs } from "../services/jobs";
import { useNotificationStore } from "../stores/notificationStore";
import { getOrderNotification } from "./orderNotification";
import { RealtimeContext, type RealtimeListener } from "./RealtimeContext";
import type { BackgroundJob, ServerRealtimeEvent } from "../types";

export function RealtimeProvider({ children }: PropsWithChildren) {
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((state) => state.add);
  const listenersRef = useRef(new Set<RealtimeListener>());
  const observedJobStatuses = useRef(new Map<string, BackgroundJob["status"]>());
  const jobsQuery = useQuery({
    queryKey: ["background-jobs", user?.id],
    queryFn: getBackgroundJobs,
    enabled: Boolean(user),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "pending" || job.status === "running")
        ? 1500
        : false,
  });

  const handleMessage = useCallback(
    (event: ServerRealtimeEvent) => {
      if (event.type === "order.updated") {
        void queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (user) addNotification(getOrderNotification(user, event));
      } else if (event.type === "chat.message") {
        void queryClient.invalidateQueries({ queryKey: ["chat", "conversations"] });
        if (event.message.sender_id !== user?.id) {
          addNotification({
            title: `Message from ${event.message.sender_name}`,
            message: event.message.body,
          });
        }
      }

      listenersRef.current.forEach((listener) => listener(event));
    },
    [addNotification, queryClient, user],
  );

  const { status, send } = useWebSocket({
    enabled: Boolean(user),
    onMessage: handleMessage,
  });

  useEffect(() => {
    if (!user || !jobsQuery.data) return;
    for (const job of jobsQuery.data) {
      const previousStatus = observedJobStatuses.current.get(job.id);
      if (
        job.kind === "invoice" &&
        job.status === "completed" &&
        (previousStatus === "pending" || previousStatus === "running")
      ) {
        addNotification({
          title: "Invoice ready to download",
          message: `The invoice for order #${job.result?.order_id ?? ""} is ready to download.`,
          dedupeKey: `invoice-ready:${job.id}`,
        });
      }
      observedJobStatuses.current.set(job.id, job.status);
    }
  }, [addNotification, jobsQuery.data, user]);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ status, send, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
