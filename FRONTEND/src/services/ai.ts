import api, { API_URL } from "./api";
import type {
  AIChatMessage,
  AIContentModerationResponse,
  AIProductAgentResponse,
  AIProductDescriptionResponse,
  AIProductSource,
  AIProviderInfo,
  AIUsageReport,
} from "../types";

interface AIProviderResponse {
  providers: AIProviderInfo[];
}

interface AIStreamHandlers {
  onAttempt: (provider: string) => void;
  onSources: (sources: AIProductSource[]) => void;
  onProvider: (provider: string) => void;
  onToken: (token: string) => void;
}

interface AIStreamEvent {
  event: string;
  data: string;
}

export interface SavedAIChatMessage extends AIChatMessage {
  sources?: AIProductSource[];
}

export const AI_CHAT_STORAGE_KEY = "shophub-ai-chat-history";

export function getSavedAIChatHistory(): SavedAIChatMessage[] {
  const stored = sessionStorage.getItem(AI_CHAT_STORAGE_KEY);
  if (!stored) return [];

  try {
    const messages = JSON.parse(stored) as unknown;
    if (
      Array.isArray(messages) &&
      messages.every(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string",
      )
    ) {
      return messages.slice(-40) as SavedAIChatMessage[];
    }
    throw new TypeError("Stored AI chat history has an invalid format.");
  } catch (error) {
    console.error("Could not restore the current-session AI chat history.", error);
    sessionStorage.removeItem(AI_CHAT_STORAGE_KEY);
    return [];
  }
}

export function saveAIChatHistory(messages: SavedAIChatMessage[]): void {
  try {
    if (messages.length) {
      sessionStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } else {
      sessionStorage.removeItem(AI_CHAT_STORAGE_KEY);
    }
  } catch (error) {
    console.error("Could not save the current-session AI chat history.", error);
  }
}

export function clearAIChatHistory(): void {
  try {
    sessionStorage.removeItem(AI_CHAT_STORAGE_KEY);
  } catch (error) {
    console.error("Could not clear the previous AI chat history.", error);
  }
}

export async function getAIProviders(): Promise<AIProviderInfo[]> {
  const { data } = await api.get<AIProviderResponse>("/ai/providers");
  return data.providers;
}

export async function getAIUsage(): Promise<AIUsageReport> {
  const { data } = await api.get<AIUsageReport>("/ai/usage");
  return data;
}

export async function prepareAICatalogue(): Promise<number> {
  const { data } = await api.post<{ products_loaded: number }>(
    "/ai/catalogue/prepare",
  );
  return data.products_loaded;
}

export async function generateAIProductDescription(input: {
  product_name: string;
  price: number;
  features: string;
}): Promise<AIProductDescriptionResponse> {
  const { data } = await api.post<AIProductDescriptionResponse>(
    "/ai/product-description",
    input,
  );
  return data;
}

export async function moderateAIProductContent(input: {
  product_name: string;
  content: string;
}): Promise<AIContentModerationResponse> {
  const { data } = await api.post<AIContentModerationResponse>("/ai/moderate", input);
  return data;
}

export async function runAIProductAgent(
  messages: AIChatMessage[],
  signal?: AbortSignal,
): Promise<AIProductAgentResponse> {
  const { data } = await api.post<AIProductAgentResponse>(
    "/ai/agent",
    { messages },
    { signal },
  );
  return data;
}

function parseEventFrame(frame: string): AIStreamEvent | null {
  let event = "message";
  const data: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

export async function streamAIChat(
  messages: AIChatMessage[],
  handlers: AIStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem("access_token");
  const response = await fetch(`${API_URL}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(errorBody?.detail || `AI request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The browser did not provide a response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const dispatchFrame = (frame: string) => {
    const parsed = parseEventFrame(frame);
    if (!parsed) return;
    const payload = JSON.parse(parsed.data) as Record<string, unknown>;
    switch (parsed.event) {
      case "attempt":
        handlers.onAttempt(payload.name as string);
        break;
      case "sources":
        handlers.onSources(payload.products as AIProductSource[]);
        break;
      case "provider":
        handlers.onProvider(payload.name as string);
        break;
      case "token":
        handlers.onToken(payload.text as string);
        break;
      case "error":
        throw new Error(payload.detail as string);
      case "done":
        finished = true;
        break;
    }
  };

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) dispatchFrame(frame);
      if (done) {
        if (buffer.trim()) dispatchFrame(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
