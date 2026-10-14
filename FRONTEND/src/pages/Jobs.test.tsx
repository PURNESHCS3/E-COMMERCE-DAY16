import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../stores/authStore";
import { useNotificationStore } from "../stores/notificationStore";
import { RealtimeProvider } from "../realtime/RealtimeProvider";
import { server } from "../test/server";
import type { BackgroundJob } from "../types";
import Jobs from "./Jobs";

afterEach(() => {
  vi.unstubAllGlobals();
});

const runningJob: BackgroundJob = {
  id: "2d2e7ec4-d429-42d9-8f1f-e11e24291a18",
  kind: "invoice",
  status: "running",
  progress: 42,
  message: "Rendering the invoice PDF.",
  result: { order_id: 42 },
  error: null,
  created_at: null,
};

function renderJobs() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RealtimeProvider>
            <Jobs />
          </RealtimeProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("background jobs", () => {
  it("shows active job progress and enables product import for admins", async () => {
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Store Admin",
        email: "admin@example.com",
        is_active: true,
        role: "admin",
      },
      loading: false,
    });
    server.use(
      http.get("http://127.0.0.1:8000/api/jobs/", () =>
        HttpResponse.json([runningJob]),
      ),
      http.get("http://127.0.0.1:8000/api/ai/usage", () =>
        HttpResponse.json({
          date: "2026-10-13",
          daily_limit: 100,
          total_requests: 2,
          remaining_requests: 98,
          provider_requests: { groq: 2, gemini: 0 },
          estimated_token_limit: 300000,
          estimated_tokens_used: 1800,
          estimated_tokens_remaining: 298200,
          details: [{
            provider: "groq",
            model: "test-model",
            feature: "description",
            attempts: 2,
            successes: 1,
            failures: 1,
            cache_hits: 3,
            estimated_tokens: 1800,
          }],
        }),
      ),
    );

    renderJobs();

    expect(await screen.findByText("Invoice for order #42")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", {
      name: "Invoice for order #42 progress",
    })).toHaveAttribute("value", "42");
    expect(screen.getByRole("heading", { name: "Import products from CSV" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start import" })).toBeDisabled();
    expect(await screen.findAllByText("1,800")).toHaveLength(2);
    expect(screen.getByText("Success / failed").closest("table")).toHaveTextContent(
      "description",
    );
  });

  it("hides leftover product-description background jobs", async () => {
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Store Admin",
        email: "admin@example.com",
        is_active: true,
        role: "admin",
      },
      loading: false,
    });
    const obsoleteDescriptionJob: BackgroundJob = {
      ...runningJob,
      kind: "product_import",
      message: "Product description queued.",
      result: null,
    };
    server.use(
      http.get("http://127.0.0.1:8000/api/jobs/", () =>
        HttpResponse.json([obsoleteDescriptionJob]),
      ),
      http.get("http://127.0.0.1:8000/api/ai/usage", () =>
        HttpResponse.json({
          date: "2026-10-13",
          daily_limit: 100,
          total_requests: 0,
          remaining_requests: 100,
          provider_requests: { groq: 0, gemini: 0 },
          estimated_token_limit: 300000,
          estimated_tokens_used: 0,
          estimated_tokens_remaining: 300000,
          details: [],
        }),
      ),
    );

    renderJobs();

    await waitFor(() => {
      expect(screen.getByText("You’re all caught up")).toBeInTheDocument();
    });
    expect(screen.queryByText("Product description queued.")).not.toBeInTheDocument();
    expect(screen.queryByText("Product CSV import")).not.toBeInTheDocument();
  });

  it("submits a CSV import and shows the returned job", async () => {
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Store Admin",
        email: "admin@example.com",
        is_active: true,
        role: "admin",
      },
      loading: false,
    });
    const queuedJob: BackgroundJob = {
      ...runningJob,
      kind: "product_import",
      message: "Product import queued.",
      result: null,
    };
    server.use(
      http.get("http://127.0.0.1:8000/api/jobs/", () =>
        HttpResponse.json([queuedJob]),
      ),
      http.post("http://127.0.0.1:8000/api/jobs/imports/products", () =>
        HttpResponse.json(queuedJob, { status: 202 }),
      ),
    );
    renderJobs();

    const file = new File(
      ["name,price,stock\nDesk lamp,19.99,3\n"],
      "products.csv",
      { type: "text/csv" },
    );
    fireEvent.change(await screen.findByLabelText("Product CSV file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start import" }));

    expect(await screen.findByRole("status"))
      .toHaveTextContent("CSV import queued");
    expect(await screen.findByText("Product CSV import")).toBeInTheDocument();
  });

  it("notifies the user when an invoice is ready and after its download", async () => {
    useAuthStore.setState({
      user: {
        id: 7,
        name: "Test Shopper",
        email: "shopper@example.com",
        is_active: true,
        role: "customer",
      },
      loading: false,
    });
    useNotificationStore.setState({ notifications: [] });
    let currentJob = runningJob;
    server.use(
      http.get("http://127.0.0.1:8000/api/jobs/", () =>
        HttpResponse.json([currentJob]),
      ),
      http.get(
        "http://127.0.0.1:8000/api/jobs/:jobId/download",
        () => new HttpResponse("%PDF-1.4 test", {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
    const createObjectUrl = vi.fn(() => "blob:invoice");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", Object.assign(class MockURL extends URL {}, {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    }));
    const { queryClient } = renderJobs();

    expect(await screen.findByText("Invoice for order #42")).toBeInTheDocument();
    currentJob = {
      ...runningJob,
      status: "completed",
      progress: 100,
      message: "Invoice is ready to download.",
      result: { order_id: 42, filename: "invoice.pdf" },
    };
    queryClient.setQueryData(["background-jobs", 7], [currentJob]);

    await waitFor(
      () => {
        expect(useNotificationStore.getState().notifications).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              title: "Invoice ready to download",
              message: "The invoice for order #42 is ready to download.",
            }),
          ]),
        );
      },
      { timeout: 4000, interval: 50 },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Download invoice PDF" }));
    await waitFor(() => {
      expect(useNotificationStore.getState().notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "Invoice downloaded",
            message: "The invoice for order #42 has been downloaded.",
          }),
        ]),
      );
    });
    expect(createObjectUrl).toHaveBeenCalled();
  });
});
