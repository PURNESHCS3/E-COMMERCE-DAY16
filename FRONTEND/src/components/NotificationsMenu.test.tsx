import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import NotificationsMenu from "./NotificationsMenu";
import { useNotificationStore } from "../stores/notificationStore";

describe("NotificationsMenu", () => {
  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [{
        id: "notification-1",
        title: "Order update",
        message: "Your order has shipped.",
        createdAt: "2026-10-07T00:00:00.000Z",
        read: false,
      }],
    });
  });

  it("closes the notification popover when the page changes", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/orders"]}>
        <NotificationsMenu />
        <Routes>
          <Route path="/orders" element={<Link to="/account">Account</Link>} />
          <Route path="/account" element={<p>Account page</p>} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Account" }));

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("closes the notification popover when clicking outside it", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationsMenu />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();

    await user.click(document.body);

    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });
});
