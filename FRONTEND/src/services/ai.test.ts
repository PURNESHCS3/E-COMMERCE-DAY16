import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_CHAT_STORAGE_KEY,
  clearAIChatHistory,
  getSavedAIChatHistory,
  saveAIChatHistory,
  streamAIChat,
} from "./ai";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("streamAIChat", () => {
  it("parses streamed source, provider, and token events across chunks", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'event: sources\ndata: {"products":[{"product_id":7,"name":"Phone","price":10,"stock":1,"image_url":null,"relevance":0.9}]}\n\nevent: attempt\ndata: {"name":"groq"}\n\n',
      'event: provider\ndata: {"name":"groq"}\n\nevent: tok',
      'en\ndata: {"text":"Hello"}\n\nevent: done\ndata: {}\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
          controller.close();
        },
      }),
      { status: 200 },
    )));

    const sources = vi.fn();
    const attempt = vi.fn();
    const provider = vi.fn();
    const token = vi.fn();
    await streamAIChat(
      [{ role: "user", content: "Find a phone" }],
      { onAttempt: attempt, onSources: sources, onProvider: provider, onToken: token },
      new AbortController().signal,
    );

    expect(sources).toHaveBeenCalledWith([
      expect.objectContaining({ product_id: 7, name: "Phone" }),
    ]);
    expect(attempt).toHaveBeenCalledWith("groq");
    expect(provider).toHaveBeenCalledWith("groq");
    expect(token).toHaveBeenCalledWith("Hello");
  });

  it("reports API errors to the caller", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { detail: "No AI provider is configured." },
      { status: 503 },
    )));

    await expect(streamAIChat(
      [{ role: "user", content: "Find a phone" }],
      {
        onAttempt: vi.fn(),
        onSources: vi.fn(),
        onProvider: vi.fn(),
        onToken: vi.fn(),
      },
      new AbortController().signal,
    )).rejects.toThrow("No AI provider is configured.");
  });

  it("clears the saved transcript when the login session ends", () => {
    saveAIChatHistory([{ role: "user", content: "Previous session question" }]);
    expect(sessionStorage.getItem(AI_CHAT_STORAGE_KEY)).not.toBeNull();

    clearAIChatHistory();

    expect(getSavedAIChatHistory()).toEqual([]);
  });
});
