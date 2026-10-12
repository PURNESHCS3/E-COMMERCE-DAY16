import { create } from "zustand";

export interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  dedupeKey?: string;
}

interface NotificationState {
  notifications: RealtimeNotification[];
  add: (notification: Omit<RealtimeNotification, "id" | "createdAt" | "read">) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  add: (notification) =>
    set((state) => {
      if (
        notification.dedupeKey &&
        state.notifications.some(
          (existing) => existing.dedupeKey === notification.dedupeKey,
        )
      ) {
        return state;
      }
      return {
        notifications: [
          {
            ...notification,
            id: `${Date.now()}-${Math.random()}`,
            createdAt: new Date().toISOString(),
            read: false,
          },
          ...state.notifications,
        ].slice(0, 50),
      };
    }),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    })),
  clear: () => set({ notifications: [] }),
}));
