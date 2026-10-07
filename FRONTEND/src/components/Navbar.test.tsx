import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import Navbar from "./Navbar";
import { useThemeStore } from "../stores/themeStore";

describe("theme toggle", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "light" });
  });

  it("toggles the selected theme and exposes the next mode accessibly", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});
