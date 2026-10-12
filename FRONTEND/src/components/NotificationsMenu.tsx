import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useNotificationStore } from "../stores/notificationStore";

export default function NotificationsMenu() {
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const open = openPathname === pathname;
  const notifications = useNotificationStore((state) => state.notifications);
  const markAllRead = useNotificationStore((state) => state.markAllRead);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpenPathname(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const toggle = () => {
    setOpenPathname((current) => current === pathname ? null : pathname);
    markAllRead();
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={toggle}
        className="relative rounded-lg p-2 hover:bg-slate-100"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <section
          aria-label="Notifications"
          className="absolute right-0 top-11 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3 text-slate-900 shadow-xl"
        >
          <h2 className="mb-2 font-semibold">Notifications</h2>
          {notifications.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">You’re all caught up.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <p className="mt-1 break-words text-sm text-slate-600">{notification.message}</p>
                  <time
                    dateTime={notification.createdAt}
                    className="mt-1 block text-xs text-slate-400"
                  >
                    {new Date(notification.createdAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
