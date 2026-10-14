import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import {
  getAIProviders,
  getSavedAIChatHistory,
  prepareAICatalogue,
  runAIProductAgent,
  saveAIChatHistory,
  streamAIChat,
  type SavedAIChatMessage,
} from "../services/ai";
import type { AIChatMessage, AIProductSource, AIProviderInfo } from "../types";

const AIChatMarkdown = lazy(() => import("./AIChatMarkdown"));

const WELCOME_MESSAGE = "Welcome to ShopHub! I can help you find products.";

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SavedAIChatMessage[]>(getSavedAIChatHistory);
  const [draft, setDraft] = useState("");
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [providerError, setProviderError] = useState("");
  const [catalogueReady, setCatalogueReady] = useState(false);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState("");
  const [catalogueRetry, setCatalogueRetry] = useState(0);
  const [error, setError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const [attemptedProvider, setAttemptedProvider] = useState("");
  const [agentMode, setAgentMode] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLUListElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const welcomeStartedRef = useRef(false);
  const cataloguePreparationStartedRef = useRef(false);

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
          setProviderError("The AI assistant is currently unavailable.");
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
    if (!open || catalogueReady || cataloguePreparationStartedRef.current) return;
    cataloguePreparationStartedRef.current = true;
    setCatalogueLoading(true);
    setCatalogueError("");
    void prepareAICatalogue()
      .then(() => setCatalogueReady(true))
      .catch((requestError: unknown) => {
        setCatalogueError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load the product catalogue. Please retry.",
        );
      })
      .finally(() => {
        cataloguePreparationStartedRef.current = false;
        setCatalogueLoading(false);
      });
  }, [catalogueReady, catalogueRetry, open]);

  useEffect(() => {
    if (
      !open ||
      messages.some((message) => message.content.trim()) ||
      welcomeStartedRef.current
    ) {
      return;
    }

    welcomeStartedRef.current = true;
    setMessages((current) =>
      current.length
        ? current
        : [{ role: "assistant", content: WELCOME_MESSAGE, sources: [] }],
    );
    setError("");
  }, [messages, open]);

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
    welcomeStartedRef.current = false;
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
      const requestMessages = [
        ...messages.filter((message) => message.content.trim()).slice(-8),
        userMessage,
      ].map(({ role, content }) => ({ role, content }));
      if (agentMode) {
        const result = await runAIProductAgent(requestMessages, controller.signal);
        setActiveProvider(result.provider);
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1
              ? { ...message, content: result.answer, sources: result.sources }
              : message,
          ),
        );
      } else {
        await streamAIChat(
          requestMessages,
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
      }
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
          className="absolute bottom-16 right-0 flex h-[min(38rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white text-slate-900 shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-emerald-900/10 bg-emerald-950 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/10 p-2 text-emerald-100">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">ShopHub AI</h2>
                <p className="text-xs text-emerald-100/75">Product catalogue assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Start a new AI chat"
                title="Start a new chat"
                onClick={reset}
                disabled={streaming}
                className="rounded-lg p-2 text-emerald-50 hover:bg-white/10 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Close AI assistant"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-emerald-50 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-[#fafaf8] px-3 py-2">
            <button
              type="button"
              aria-label="Toggle product search agent"
              aria-pressed={agentMode}
              onClick={() => {
                setAgentMode((enabled) => !enabled);
                setActiveProvider("");
                setAttemptedProvider("");
              }}
              disabled={streaming}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${
                agentMode
                  ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                  : "border-stone-300 bg-white text-slate-700"
              }`}
            >
              {agentMode ? "Tool-using agent · on" : "Tool-using agent · off"}
            </button>
            {providers.length ? (
              <span
                role="status"
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  activeProvider === "gemini"
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : attemptedProvider
                      ? "border-stone-300 bg-stone-50 text-slate-700"
                      : "border-emerald-300 bg-emerald-50 text-emerald-800"
                }`}
              >
                {agentMode && activeProvider
                  ? "AI agent · active"
                  : attemptedProvider && !activeProvider
                  ? "Thinking…"
                  : activeProvider === "gemini"
                    ? "AI assistant · active"
                    : activeProvider === "groq"
                      ? "AI assistant · active"
                      : "AI assistant · ready"}
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
            className="flex-1 space-y-3 overflow-y-auto bg-[#fafaf8] p-3"
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
                    ? "ml-auto bg-emerald-900 text-white"
                    : "border border-stone-200 bg-white text-slate-900 shadow-sm"
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
                          ? "Analyzing your request…"
                          : "Thinking through your request…"}
                      </span>
                    ) : "")}
                  </p>
                )}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 border-t border-emerald-900/15 pt-2">
                    <p className="mb-1 text-xs font-semibold">Catalogue sources</p>
                    <ul className="space-y-1">
                      {message.sources.map((source: AIProductSource) => (
                        <li key={source.product_id}>
                          <Link
                            to={`/products/${source.product_id}`}
                            onClick={() => setOpen(false)}
                            className="text-xs text-emerald-900 underline decoration-emerald-700/50 underline-offset-2 hover:text-emerald-700"
                          >
                            #{source.product_id} {source.name} · ₹{source.price.toFixed(2)}
                            {" · "}
                            {source.stock > 0
                              ? `${source.stock} in stock`
                              : "Out of stock"}
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
          <form onSubmit={submit} className="flex items-end gap-2 border-t border-stone-200 bg-white p-3">
            <label htmlFor="ai-question" className="sr-only">Ask about products</label>
            <textarea
              id="ai-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={4000}
              rows={2}
              disabled={streaming || !catalogueReady}
              placeholder={
                catalogueLoading
                  ? "Loading product catalogue…"
                  : catalogueReady
                    ? "Ask about the catalogue…"
                    : "Catalogue unavailable"
              }
              className="min-w-0 flex-1 resize-none rounded-xl border border-stone-300 bg-[#fafaf8] px-3 py-2 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/15"
            />
            <Button
              type="submit"
              size="sm"
              aria-label="Send AI chat message"
              disabled={
                streaming || !catalogueReady || !draft.trim() || providers.length === 0
              }
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {catalogueLoading && (
            <p role="status" className="px-3 pb-2 text-xs text-slate-500">
              Preparing product catalogue for your first question…
            </p>
          )}
          {catalogueError && (
            <div role="alert" className="flex items-center justify-between gap-2 px-3 pb-2 text-xs text-red-700">
              <span>{catalogueError}</span>
              <button
                type="button"
                className="shrink-0 underline"
                onClick={() => setCatalogueRetry((attempt) => attempt + 1)}
              >
                Retry
              </button>
            </div>
          )}
          <p className="px-3 pb-2 text-[10px] text-slate-500">
            Prices and stock come from the latest catalogue lookup. Verify details on product pages.
          </p>
        </section>
      )}

      <button
        type="button"
        aria-label={open ? "Close AI assistant" : "Open AI product assistant"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-900 text-white shadow-lg transition hover:scale-105 hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-800/30"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
        {!open && <MessageCircle className="absolute mb-8 ml-8 h-4 w-4 rounded-full bg-white p-0.5 text-emerald-900" />}
      </button>
    </div>
  );
}
