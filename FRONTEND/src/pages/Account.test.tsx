import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { testUser } from "../test/server";
import { useAuthStore } from "../stores/authStore";
import Account from "./Account";

describe("Account", () => {
  it("shows customer profile details and shopping shortcuts", () => {
    useAuthStore.setState({ user: testUser, loading: false });

    render(
      <MemoryRouter>
        <Account />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Hello, Test" })).toBeInTheDocument();
    expect(screen.getAllByText(testUser.email)).toHaveLength(2);
    expect(screen.getByText("Active account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Your orders/ })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: /Shopping cart/ })).toHaveAttribute("href", "/cart");
    expect(screen.getByRole("link", { name: /Customer support/ })).toHaveAttribute("href", "/support");
  });

  it("shows store-management shortcuts to admins", () => {
    useAuthStore.setState({
      user: { ...testUser, role: "admin" },
      loading: false,
    });

    render(
      <MemoryRouter>
        <Account />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Store management" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage products/ })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByRole("link", { name: /Manage orders/ })).toHaveAttribute("href", "/admin/orders");
    expect(screen.getByRole("link", { name: /Support inbox/ })).toHaveAttribute("href", "/support");
    expect(screen.queryByRole("link", { name: /Shopping cart/ })).not.toBeInTheDocument();
  });
});
