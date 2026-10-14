import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import Navbar from "./Navbar";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore } from "../stores/authStore";
import { testUser } from "../test/server";

describe("theme toggle", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "light" });
  });

  describe("responsive navigation", () => {
    it("opens the mobile menu and closes it after selecting a route", async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Navbar />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await user.click(screen.getByRole("button", { name: "Open navigation menu" }));
      expect(screen.getByRole("navigation", { name: "Mobile navigation" }))
        .toBeInTheDocument();
      await user.click(
        within(screen.getByRole("navigation", { name: "Mobile navigation" }))
          .getByRole("link", { name: "Products" }),
      );

      expect(screen.queryByRole("navigation", { name: "Mobile navigation" }))
        .not.toBeInTheDocument();
    });
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
    expect(screen.getByRole("button", { name: "Switch to light mode" }))
      .toHaveClass("navbar-utility-action");
  });

  it("keeps the cart navigation link on the shared palette hover style", () => {
    useAuthStore.setState({ user: testUser, loading: false });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: "Cart" }))
      .toHaveClass("site-nav-link", "hover:bg-stone-100", "hover:text-slate-950");
    expect(screen.getByRole("link", { name: /Test Shopper/ }))
      .toHaveClass("navbar-utility-action");
  });
});
