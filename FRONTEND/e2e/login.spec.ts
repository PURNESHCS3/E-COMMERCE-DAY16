import { expect, test, type Page } from "@playwright/test";
import type { User } from "../src/types";

const apiBase = "**/api";
const user: User = {
  id: 42,
  name: "Playwright Shopper",
  email: "shopper@example.com",
  is_active: true,
  role: "customer",
};
const tokens = {
  access_token: "e2e-access-token",
  refresh_token: "e2e-refresh-token",
  token_type: "bearer",
};

async function mockSuccessfulLogin(page: Page) {
  await page.routeWebSocket("ws://**/api/ws", (socket) => {
    socket.onMessage((message) => {
      const event = JSON.parse(String(message)) as { type?: string };
      if (event.type === "auth") socket.send(JSON.stringify({ type: "auth.ok" }));
    });
  });
  await page.route(`${apiBase}/auth/login`, (route) =>
    route.fulfill({ json: tokens })
  );
  await page.route(`${apiBase}/auth/me`, (route) =>
    route.fulfill({ json: user })
  );
  await page.route(`${apiBase}/cart/`, (route) =>
    route.fulfill({ json: { cart: {} } })
  );
  await page.route(`${apiBase}/jobs/`, (route) =>
    route.fulfill({ json: [] })
  );
  await page.route(`${apiBase}/ai/providers`, (route) =>
    route.fulfill({ json: { providers: [] } })
  );
}

test.describe("login page", () => {
  test("shows the login form and navigation link", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: "Login" })).toBeVisible();
    await expect(
      page.locator("p").filter({ hasText: "Don't have an account?" })
        .getByRole("link", { name: "Register" }),
    ).toHaveAttribute("href", "/register");
  });

  test("registration link opens the registration page", async ({ page }) => {
    await page.goto("/login");
    await page
      .locator("p")
      .filter({ hasText: "Don't have an account?" })
      .getByRole("link", { name: "Register" })
      .click();

    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: /create.*account/i })).toBeVisible();
  });

  test("does not submit when both required fields are empty", async ({ page }) => {
    let loginRequests = 0;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      loginRequests += 1;
      await route.fulfill({ json: tokens });
    });
    await page.goto("/login");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    expect(await page.getByPlaceholder("Email").evaluate(
      (input: HTMLInputElement) => input.validity.valueMissing
    )).toBe(true);
    expect(await page.getByPlaceholder("Password").evaluate(
      (input: HTMLInputElement) => input.validity.valueMissing
    )).toBe(true);
    expect(loginRequests).toBe(0);
  });

  test("rejects malformed email before sending a request", async ({ page }) => {
    let loginRequests = 0;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      loginRequests += 1;
      await route.fulfill({ json: tokens });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill("not-an-email");
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    expect(await page.getByPlaceholder("Email").evaluate(
      (input: HTMLInputElement) => input.validity.typeMismatch
    )).toBe(true);
    expect(loginRequests).toBe(0);
  });

  test("rejects a password shorter than six characters", async ({ page }) => {
    let loginRequests = 0;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      loginRequests += 1;
      await route.fulfill({ json: tokens });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("short");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    expect(await page.getByPlaceholder("Password").evaluate(
      (input: HTMLInputElement) => input.validity.tooShort
    )).toBe(true);
    expect(loginRequests).toBe(0);
  });

  test("submits credentials, loads the authenticated user, and opens the account", async ({ page }) => {
    let submittedBody: unknown;
    let authorizationHeader: string | undefined;
    await page.routeWebSocket("ws://**/api/ws", (socket) => {
      socket.onMessage((message) => {
        const event = JSON.parse(String(message)) as { type?: string };
        if (event.type === "auth") socket.send(JSON.stringify({ type: "auth.ok" }));
      });
    });
    await page.route(`${apiBase}/auth/login`, async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({ json: tokens });
    });
    await page.route(`${apiBase}/auth/me`, async (route) => {
      authorizationHeader = route.request().headers().authorization;
      await route.fulfill({ json: user });
    });
    await page.route(`${apiBase}/cart/`, (route) =>
      route.fulfill({ json: { cart: {} } })
    );
    await page.route(`${apiBase}/jobs/`, (route) =>
      route.fulfill({ json: [] })
    );
    await page.route(`${apiBase}/ai/providers`, (route) =>
      route.fulfill({ json: { providers: [] } })
    );
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    expect(submittedBody).toEqual({ email: user.email, password: "secret123" });
    expect(authorizationHeader).toBeDefined();
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole("heading", { name: `Hello, ${user.name.split(" ")[0]}` }),
    ).toBeVisible();
    expect(submittedBody).toEqual({ email: user.email, password: "secret123" });
    expect(authorizationHeader).toBe("Bearer e2e-access-token");
  });

  test("returns to the protected page that originally requested login", async ({ page }) => {
    await mockSuccessfulLogin(page);
    await page.route(`${apiBase}/cart/`, (route) =>
      route.fulfill({ json: { cart: {} } })
    );
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  });

  test("shows the API message for invalid credentials", async ({ page }) => {
    await page.route(`${apiBase}/auth/login`, (route) =>
      route.fulfill({
        status: 401,
        json: { detail: "Invalid username or password" },
      })
    );
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("wrongpass");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows a fallback message when the login request has a network failure", async ({ page }) => {
    await page.route(`${apiBase}/auth/login`, (route) => route.abort("failed"));
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Login failed.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("disables the submit button while the login request is pending", async ({ page }) => {
    let releaseLogin: (() => void) | undefined;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await new Promise<void>((resolve) => {
        releaseLogin = resolve;
      });
      await route.fulfill({ json: tokens });
    });
    await page.route(`${apiBase}/auth/me`, (route) =>
      route.fulfill({ json: user })
    );
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByRole("button", { name: "Logging in..." })).toBeDisabled();
    await expect.poll(() => Boolean(releaseLogin)).toBe(true);
    releaseLogin?.();
    await expect(page).toHaveURL(/\/account$/);
  });
});
