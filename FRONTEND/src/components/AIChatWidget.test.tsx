import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import AIChatWidget from "./AIChatWidget";
import { AI_CHAT_STORAGE_KEY, getSavedAIChatHistory } from "../services/ai";
import { server } from "../test/server";

describe("AIChatWidget", () => {
  beforeEach(() => {
    sessionStorage.clear();
    server.use(
      http.get("http://127.0.0.1:8000/api/ai/providers", () =>
        HttpResponse.json({ providers: [
          { name: "groq", model: "test-groq-model" },
          { name: "gemini", model: "test-gemini-model" },
        ] }),
      ),
      http.post("http://127.0.0.1:8000/api/ai/catalogue/prepare", () =>
        HttpResponse.json({ products_loaded: 10 }),
      ),
    );
  });

  it("prepares the catalogue before allowing the first question", async () => {
    const user = userEvent.setup();
    let completePreparation: (() => void) | undefined;
    let chatRequestCount = 0;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/catalogue/prepare", async () => {
        await new Promise<void>((resolve) => {
          completePreparation = resolve;
        });
        return HttpResponse.json({ products_loaded: 10 });
      }),
      http.post("http://127.0.0.1:8000/api/ai/chat/stream", () => {
        chatRequestCount += 1;
        return HttpResponse.text("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));

    expect(await screen.findByText(
      "Welcome to ShopHub! I can help you find products.",
    )).toBeInTheDocument();
    expect(chatRequestCount).toBe(0);
    expect(screen.getByRole("textbox", { name: "Ask about products" })).toBeDisabled();
    expect(screen.getByText("Preparing product catalogue for your first question…"))
      .toBeInTheDocument();

    completePreparation?.();
    const input = screen.getByRole("textbox", { name: "Ask about products" });
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(screen.getByRole("textbox", { name: "Ask about products" }), "Find a lamp");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));
    await screen.findByText("Find a lamp");
    expect(chatRequestCount).toBe(1);
  });

  it("shows current stock with catalogue source links", async () => {
    sessionStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify([{
        role: "assistant",
        content: "Here is a current match.",
        sources: [{
          product_id: 17,
          name: "Wireless Headphones",
          price: 49.99,
          stock: 4,
          image_url: null,
          relevance: 0.92,
        }],
      }]),
    );
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );

    await userEvent.setup().click(screen.getByRole("button", { name: "Open AI product assistant" }));

    expect(await screen.findByRole("link", {
      name: /Wireless Headphones.*4 in stock/,
    })).toBeInTheDocument();
  });

  it("opens a floating chat box from the bottom-right assistant button", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("region", { name: "ShopHub AI product assistant" }))
      .not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    expect(screen.getByRole("region", { name: "ShopHub AI product assistant" }))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Ask about products" }))
      .toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("AI assistant · ready");
    expect(screen.queryByText(/Groq|Gemini/)).not.toBeInTheDocument();

    await user.click(
      within(screen.getByRole("region", { name: "ShopHub AI product assistant" }))
        .getByRole("button", { name: "Close AI assistant" }),
    );
    expect(screen.queryByRole("region", { name: "ShopHub AI product assistant" }))
      .not.toBeInTheDocument();
  });

  it("runs a product-agent tool call when agent mode is enabled", async () => {
    const user = userEvent.setup();
    let requestBody: { messages: Array<{ role: string; content: string }> } | undefined;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/agent", async ({ request }) => {
        requestBody = await request.json() as typeof requestBody;
        return HttpResponse.json({
          answer: "Wireless headphones are in stock. [Product #17]",
          provider: "groq",
          sources: [{
            product_id: 17,
            name: "Wireless Headphones",
            price: 49.99,
            stock: 4,
            image_url: null,
            relevance: 0.92,
          }],
          tool_calls: ["search_catalog"],
          cached: false,
        });
      }),
    );
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    await user.click(screen.getByRole("button", { name: "Toggle product search agent" }));
    await user.type(screen.getByRole("textbox", { name: "Ask about products" }), "Find headphones");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));

    expect(await screen.findByText("Wireless headphones are in stock. [Product #17]"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wireless Headphones/ }))
      .toHaveAttribute("href", "/products/17");
    expect(requestBody).toEqual({
      messages: [
        {
          role: "assistant",
          content: "Welcome to ShopHub! I can help you find products.",
        },
        { role: "user", content: "Find headphones" },
      ],
    });
  });

  it("renders Markdown formatting in assistant messages", async () => {
    sessionStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify([{
        role: "assistant",
        content: "*   **Logitech MX Master 3S** [Product #17]\n    *   **Price:** 8999.00\n    *   **Available Stock:** 40",
      }]),
    );
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Open AI product assistant" }));

    expect(await screen.findByText("Logitech MX Master 3S")).toHaveClass("font-semibold");
    expect(await screen.findByText("Price:")).toHaveClass("font-semibold");
    expect(await screen.findByText("Available Stock:")).toHaveClass("font-semibold");
    const productListItem = screen.getByText("Logitech MX Master 3S").closest("li");
    expect(productListItem?.querySelectorAll("li")).toHaveLength(2);
  });

  it("closes the chat when the user clicks outside the widget", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    expect(screen.getByRole("region", { name: "ShopHub AI product assistant" }))
      .toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("region", { name: "ShopHub AI product assistant" }))
      .not.toBeInTheDocument();
  });

  it("restores only valid messages saved in the current browser session", () => {
    sessionStorage.setItem(
      AI_CHAT_STORAGE_KEY,
      JSON.stringify([{ role: "user", content: "Find headphones" }]),
    );

    expect(getSavedAIChatHistory()).toEqual([
      { role: "user", content: "Find headphones" },
    ]);
  });

  it("does not resend an empty assistant placeholder after a failed response", async () => {
    const user = userEvent.setup();
    const chatRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    let requestCount = 0;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/chat/stream", async ({ request }) => {
        chatRequests.push(await request.json() as typeof chatRequests[number]);
        requestCount += 1;
        if (requestCount === 1) {
          return HttpResponse.text(
            'event: error\ndata: {"detail":"All configured AI providers are unavailable."}\n\n',
            { headers: { "Content-Type": "text/event-stream" } },
          );
        }
        return HttpResponse.text("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    await screen.findByRole("status");

    const input = screen.getByRole("textbox", { name: "Ask about products" });
    await user.type(input, "First question");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));
    await screen.findByRole("alert");

    await user.type(input, "Try again");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));
    await screen.findByText("Try again");

    expect(chatRequests[1].messages).toEqual([
      {
        role: "assistant",
        content: "Welcome to ShopHub! I can help you find products.",
      },
      { role: "user", content: "First question" },
      { role: "user", content: "Try again" },
    ]);
  });

  it("always sends chat requests without a provider selection", async () => {
    const user = userEvent.setup();
    let requestBody: { messages: unknown[]; provider?: string } | undefined;
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/chat/stream", async ({ request }) => {
        requestBody = await request.json() as typeof requestBody;
        return HttpResponse.text("event: done\ndata: {}\n\n", {
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    await screen.findByText("AI assistant · ready");
    expect(screen.queryByText(/Groq|Gemini/)).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Ask about products" }), "Test provider order");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));

    await screen.findByText("Test provider order");
    expect(requestBody).toEqual({
      messages: [
        {
          role: "assistant",
          content: "Welcome to ShopHub! I can help you find products.",
        },
        { role: "user", content: "Test provider order" },
      ],
    });
  });

  it("reports the AI assistant as active after provider fallback", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/chat/stream", () =>
        HttpResponse.text(
          'event: attempt\ndata: {"name":"groq"}\n\nevent: attempt\ndata: {"name":"gemini"}\n\nevent: provider\ndata: {"name":"gemini"}\n\nevent: token\ndata: {"text":"Fallback answer"}\n\nevent: done\ndata: {}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    await screen.findByText("AI assistant · ready");
    await user.type(screen.getByRole("textbox", { name: "Ask about products" }), "Test fallback");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));

    expect(await screen.findByText("AI assistant · active"))
      .toBeInTheDocument();
  });

  it("shows a thinking status before the first streamed token", async () => {
    const encoder = new TextEncoder();
    server.use(
      http.post("http://127.0.0.1:8000/api/ai/chat/stream", () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('event: attempt\ndata: {"name":"groq"}\n\n'));
              setTimeout(() => {
                controller.enqueue(encoder.encode(
                  'event: provider\ndata: {"name":"groq"}\n\nevent: token\ndata: {"text":"Ready"}\n\nevent: done\ndata: {}\n\n',
                ));
                controller.close();
              }, 100);
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AIChatWidget />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Open AI product assistant" }));
    await screen.findByText("AI assistant · ready");
    await user.type(screen.getByRole("textbox", { name: "Ask about products" }), "Find a phone");
    await user.click(screen.getByRole("button", { name: "Send AI chat message" }));

    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByText("Analyzing your request…")).toBeInTheDocument();
    expect(screen.queryByText(/Groq|Gemini/)).not.toBeInTheDocument();
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });
});
