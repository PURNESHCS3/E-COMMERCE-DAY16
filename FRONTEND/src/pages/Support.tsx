import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { useRealtime } from "../realtime/useRealtime";
import { getChatConversations, getChatMessages } from "../services/chat";
import type { ChatMessage } from "../types";

export default function Support() {
  const user = useAuth((state) => state.user);
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const { status, send, subscribe } = useRealtime();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const conversationListRef = useRef<HTMLUListElement>(null);
  const conversationsQuery = useQuery({
    queryKey: ["chat", "conversations"],
    queryFn: getChatConversations,
    enabled: Boolean(isAdmin),
  });

  const activeUserId = isAdmin
    ? selectedUserId ?? conversationsQuery.data?.[0]?.user_id ?? null
    : user?.id ?? null;

  const messagesQuery = useQuery({
    queryKey: ["chat", "messages", activeUserId],
    queryFn: () => getChatMessages(isAdmin ? activeUserId ?? undefined : undefined),
    enabled: activeUserId !== null,
  });

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "error") {
          setError(event.message);
          return;
        }
        if (event.type !== "chat.message" || event.message.user_id !== activeUserId) return;
        queryClient.setQueryData<ChatMessage[]>(
          ["chat", "messages", activeUserId],
          (messages = []) =>
            messages.some((message) => message.id === event.message.id)
              ? messages
              : [...messages, event.message],
        );
      }),
    [activeUserId, queryClient, subscribe],
  );

  useEffect(() => {
    const list = conversationListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messagesQuery.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeUserId) return;
    const sent = send({
      type: "chat.send",
      body,
      ...(isAdmin ? { user_id: activeUserId } : {}),
    });
    if (!sent) {
      setError("Chat is reconnecting. Please try sending again.");
      return;
    }
    setDraft("");
    setError("");
  };

  const selectedConversation = conversationsQuery.data?.find(
    (conversation) => conversation.user_id === activeUserId,
  );

  return (
    <main className={`mx-auto ${isAdmin ? "max-w-6xl" : "max-w-7xl"} px-4 py-8 sm:px-6`}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.16em] text-emerald-800">HERE TO HELP</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Customer support</h1>
          <p className="mt-2 text-sm text-slate-600">Send us a message and we’ll be happy to help.</p>
        </div>
        <p className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-sm text-slate-600">
          <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-600" : "bg-amber-500"}`} aria-hidden="true" />
          Real-time connection: <span className="font-medium capitalize text-slate-900">{status}</span>
        </p>
      </div>

      <div className={`support-panel grid overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm ${
        isAdmin
          ? "min-h-[32rem] md:grid-cols-[16rem_1fr]"
          : "min-h-[36rem] md:h-[calc(100vh-13rem)] md:min-h-[36rem]"
      }`}>
        {isAdmin && (
          <aside className="support-conversations border-b border-stone-200 bg-[#fafaf8] p-4 md:border-b-0 md:border-r">
            <h2 className="mb-3 font-semibold text-slate-950">Conversations</h2>
            {conversationsQuery.error && (
              <p role="alert" className="text-sm text-red-700">Could not load conversations.</p>
            )}
            {!conversationsQuery.error && !conversationsQuery.data?.length && (
              <p className="text-sm text-slate-500">Customer conversations will appear here.</p>
            )}
            <ul className="space-y-1">
              {conversationsQuery.data?.map((conversation) => (
                <li key={conversation.user_id}>
                  <button
                    type="button"
                    aria-pressed={activeUserId === conversation.user_id}
                    onClick={() => setSelectedUserId(conversation.user_id)}
                    className="support-conversation-button w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-emerald-50 aria-pressed:bg-emerald-900 aria-pressed:text-white"
                  >
                    <span className="block font-medium">{conversation.user_name}</span>
                    <span className="support-conversation-preview block truncate text-slate-500">{conversation.last_message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section className={`flex min-w-0 flex-col ${isAdmin ? "min-h-[32rem]" : "min-h-[36rem]"}`}>
          <h2 className="support-chat-heading border-b border-stone-200 bg-white px-4 py-3 font-semibold text-slate-950">
            {isAdmin ? selectedConversation?.user_name ?? "Select a conversation" : "Chat with support"}
          </h2>
          <ul
            ref={conversationListRef}
            aria-label="Chat messages"
            className={`support-message-list flex-1 space-y-3 overflow-y-auto bg-[#fafaf8] p-4 ${isAdmin ? "" : "md:px-8 md:py-6"}`}
          >
            {messagesQuery.error && (
              <li role="alert" className="text-sm text-red-700">Could not load chat history.</li>
            )}
            {messagesQuery.data?.map((message) => {
              const ownMessage = message.sender_id === user?.id;
              return (
                <li
                  key={message.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    ownMessage
                      ? "ml-auto bg-emerald-900 text-white shadow-sm"
                      : "border border-stone-200 bg-white text-slate-900 shadow-sm"
                  }`}
                >
                  <p className="mb-1 text-xs font-medium opacity-75">{message.sender_name}</p>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <time dateTime={message.created_at} className="mt-1 block text-right text-[10px] opacity-70">
                    {new Date(message.created_at).toLocaleTimeString()}
                  </time>
                </li>
              );
            })}
            {!messagesQuery.isPending && !messagesQuery.data?.length && (
              <li className="py-8 text-center text-sm text-slate-500">
                {isAdmin ? "No messages in this conversation yet." : "Send a message to start a support conversation."}
              </li>
            )}
          </ul>
          {error && <p role="alert" className="px-4 pb-2 text-sm text-red-700">{error}</p>}
          <form onSubmit={submit} className={`flex gap-2 border-t border-stone-200 bg-white p-3 ${isAdmin ? "" : "md:px-6 md:py-4"}`}>
            <label htmlFor="support-message" className="sr-only">Message</label>
            <input
              id="support-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              disabled={status !== "connected" || activeUserId === null}
              placeholder={status === "connected" ? "Write a message…" : "Connecting to support…"}
              className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-[#fafaf8] px-3 py-2 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15"
            />
            <Button type="submit" className="rounded-xl" disabled={status !== "connected" || !draft.trim() || activeUserId === null}>
              Send
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
