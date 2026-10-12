import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import {
  getAIProviders,
  getSavedAIChatHistory,
  saveAIChatHistory,
  streamAIChat,
  type SavedAIChatMessage,
} from "../services/ai";
import type { AIChatMessage, AIProductSource, AIProviderInfo } from "../types";

const AIChatMarkdown = lazy(() => import("./AIChatMarkdown"));

const providerLabels: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini",
};

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SavedAIChatMessage[]>(getSavedAIChatHistory);
  const [draft, setDraft] = useState("");
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [providerError, setProviderError] = useState("");
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const [attemptedProvider, setAttemptedProvider] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLUListElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveAIChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    let active = true;
    getAIProviders()
      .then((available) => {
        if (!active) return;
        setProviders(available);
        if (!available.length) {
          setProviderError("Groq and Gemini are not configured on the backend.");
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setProviderError(
            requestError instanceof Error
              ? requestError.message
              : "Could not check AI provider configuration.",
          );
        }
      });
    return () => {
      active = false;
      controllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !widgetRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const reset = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setDraft("");
    setError("");
    setActiveProvider("");
    setAttemptedProvider("");
    setStreaming(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || streaming) return;

    const userMessage: AIChatMessage = { role: "user", content: question };
    const assistantMessage: SavedAIChatMessage = {
      role: "assistant",
      content: "",
      sources: [],
    };
    setMessages((current) => [...current, userMessage, assistantMessage].slice(-40));
    setDraft("");
    setError("");
    setActiveProvider("");
    setAttemptedProvider("");
    setStreaming(true);

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await streamAIChat(
        [
          ...messages.filter((message) => message.content.trim()).slice(-8),
          userMessage,
        ].map(({ role, content }) => ({ role, content })),
        {
          onAttempt: setAttemptedProvider,
          onSources: (sources) => {
            setMessages((current) =>
              current.map((message, index) =>
                index === current.length - 1 ? { ...message, sources } : message,
              ),
            );
          },
          onProvider: (provider) => {
            setActiveProvider(provider);
            setAttemptedProvider("");
          },
          onToken: (token) => {
            setMessages((current) =>
              current.map((message, index) =>
                index === current.length - 1
                  ? { ...message, content: message.content + token }
                  : message,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (requestError: unknown) {
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The AI assistant could not answer. Please try again.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setStreaming(false);
      }
    }
  };

  return (
    <div ref={widgetRef} className="fixed bottom-5 right-5 z-50">
      {open && (
        <section
          aria-label="ShopHub AI product assistant"
          className="absolute bottom-16 right-0 flex h-[min(38rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border bg-white text-slate-900 shadow-2xl"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-900 p-2 text-white">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">ShopHub AI</h2>
                <p className="text-xs text-slate-500">Product catalogue assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Start a new AI chat"
                title="Start a new chat"
                onClick={reset}
                disabled={streaming}
                className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Close AI assistant"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
            {providers.length ? (
              <span
                role="status"
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  activeProvider === "gemini"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : attemptedProvider
                      ? "border-slate-300 bg-slate-50 text-slate-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                }`}
              >
                {attemptedProvider && !activeProvider
                  ? `${providerLabels[attemptedProvider] ?? attemptedProvider} · connecting`
                  : activeProvider === "gemini"
                    ? "Gemini · fallback active"
                    : activeProvider === "groq"
                      ? "Groq · active"
                      : providers.some((provider) => provider.name === "groq")
                        ? "Groq · active"
                        : `${providerLabels[providers[0].name] ?? providers[0].name} · active`}
              </span>
            ) : (
              <span role={providerError ? "alert" : "status"} className="text-xs text-amber-700">
                {providerError || "Checking AI providers…"}
              </span>
            )}
          </div>

          <ul
            ref={messageListRef}
            aria-label="AI chat messages"
            className="flex-1 space-y-3 overflow-y-auto p-3"
          >
            {!messages.length && (
              <li className="px-3 py-10 text-center text-sm text-slate-500">
                Ask about products, prices, or availability.
              </li>
            )}
            {messages.map((message, index) => (
              <li
                key={`${index}-${message.role}`}
                className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {message.role === "assistant" && message.content ? (
                  <Suspense fallback={<p className="whitespace-pre-wrap break-words">{message.content}</p>}>
                    <AIChatMarkdown content={message.content} />
                  </Suspense>
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {message.content || (streaming && index === messages.length - 1 ? (
                      <span className="flex items-center gap-2 text-slate-600">
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {attemptedProvider
                          ? `Connecting to ${providerLabels[attemptedProvider] ?? attemptedProvider}…`
                          : "Connecting to an AI provider…"}
                      </span>
                    ) : "")}
                  </p>
                )}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 border-t border-slate-300 pt-2">
                    <p className="mb-1 text-xs font-semibold">Catalogue sources</p>
                    <ul className="space-y-1">
                      {message.sources.map((source: AIProductSource) => (
                        <li key={source.product_id}>
                          <Link
                            to={`/products/${source.product_id}`}
                            onClick={() => setOpen(false)}
                            className="text-xs underline"
                          >
                            #{source.product_id} {source.name} · ₹{source.price.toFixed(2)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {error && <p role="alert" className="px-3 pb-2 text-xs text-red-700">{error}</p>}
          <form onSubmit={submit} className="flex items-end gap-2 border-t p-3">
            <label htmlFor="ai-question" className="sr-only">Ask about products</label>
            <textarea
              id="ai-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={2}
              disabled={streaming}
              placeholder="Ask about the catalogue…"
              className="min-w-0 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
            <Button
              type="submit"
              size="sm"
              aria-label="Send AI chat message"
              disabled={streaming || !draft.trim() || providers.length === 0}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="px-3 pb-2 text-[10px] text-slate-500">
            Verify price and availability on product pages.
          </p>
        </section>
      )}

      <button
        type="button"
        aria-label={open ? "Close AI assistant" : "Open AI product assistant"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:scale-105 hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        {!open && <MessageCircle className="absolute mb-8 ml-8 h-4 w-4 rounded-full bg-white p-0.5 text-slate-900" />}
      </button>
    </div>
  );
}
