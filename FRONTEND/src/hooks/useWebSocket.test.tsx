import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWebSocket } from "./useWebSocket";

class MockWebSocket {
  static OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

describe("useWebSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    localStorage.setItem("access_token", "test-access-token");
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("authenticates the socket and reconnects with exponential backoff", async () => {
    const onMessage = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWebSocket({ enabled: true, onMessage }),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => {
      MockWebSocket.instances[0].open();
    });
    expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({
      type: "auth",
      token: "test-access-token",
    });

    act(() => {
      MockWebSocket.instances[0].receive({ type: "auth.ok" });
    });
    expect(result.current.status).toBe("connected");

    act(() => {
      MockWebSocket.instances[0].close(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(MockWebSocket.instances).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    act(() => {
      MockWebSocket.instances[1].close(1006);
    });
    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
    unmount();
  });
});
