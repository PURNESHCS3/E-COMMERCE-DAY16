import { expect, test, type Page } from "@playwright/test";
import type { User } from "../src/types";

const apiBase = "http://127.0.0.1:8000/api";
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
  await page.route(`${apiBase}/auth/login`, async (route) => {
    await route.fulfill({ json: tokens });
  });
  await page.route(`${apiBase}/auth/me`, async (route) => {
    await route.fulfill({ json: user });
  });
}

test.describe("login page", () => {
  test("shows the login form and registration link", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByPlaceholder("Email")).toBeVisible();
    await expect(page.getByPlaceholder("Password")).toBeVisible();
    await expect(page.locator("form").getByRole("button", { name: "Login" })).toBeVisible();
    await expect(
      page.getByRole("navigation").getByRole("link", { name: "Register" })
    ).toHaveAttribute("href", "/register");
  });

  test("registration link opens the registration page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Register" }).click();

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

    expect(
      await page.getByPlaceholder("Email").evaluate((input: HTMLInputElement) =>
        input.validity.valueMissing
      )
    ).toBe(true);
    expect(
      await page.getByPlaceholder("Password").evaluate((input: HTMLInputElement) =>
        input.validity.valueMissing
      )
    ).toBe(true);
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

    expect(
      await page.getByPlaceholder("Email").evaluate((input: HTMLInputElement) =>
        input.validity.typeMismatch
      )
    ).toBe(true);
    expect(loginRequests).toBe(0);
  });

  test("rejects a password shorter than six characters before sending a request", async ({ page }) => {
    let loginRequests = 0;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      loginRequests += 1;
      await route.fulfill({ json: tokens });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("short");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    expect(
      await page.getByPlaceholder("Password").evaluate((input: HTMLInputElement) =>
        input.validity.tooShort
      )
    ).toBe(true);
    expect(loginRequests).toBe(0);
  });

  test("submits email and password to the login endpoint", async ({ page }) => {
    let submittedBody: unknown;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({ json: tokens });
    });
    await page.route(`${apiBase}/auth/me`, async (route) => {
      await route.fulfill({ json: user });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/account$/);
    expect(submittedBody).toEqual({ email: user.email, password: "secret123" });
  });

  test("redirects to the account page after a successful login", async ({ page }) => {
    await mockSuccessfulLogin(page);
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("button", { name: /logout/i })).toBeVisible();
  });

  test("uses the access token to load the current user after successful login", async ({
    page,
  }) => {
    let authorizationHeader: string | undefined;
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await route.fulfill({ json: tokens });
    });
    await page.route(`${apiBase}/auth/me`, async (route) => {
      authorizationHeader = route.request().headers().authorization;
      await route.fulfill({ json: user });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/account$/);
    expect(authorizationHeader).toBe(`Bearer ${tokens.access_token}`);
  });

  test("returns to the protected page that originally requested login", async ({ page }) => {
    await mockSuccessfulLogin(page);
    await page.route(`${apiBase}/cart/`, async (route) => {
      await route.fulfill({ json: { cart: {} } });
    });
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  });

  test("shows the API message for invalid credentials", async ({ page }) => {
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await route.fulfill(
        { status: 401, json: { detail: "Invalid username or password" } }
      );
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("wrongpass");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Invalid username or password")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows a server error returned by the login API", async ({ page }) => {
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await route.fulfill(
        { status: 503, json: { detail: "Login service unavailable" } }
      );
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Login service unavailable")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows a fallback message when the login request has a network failure", async ({
    page,
  }) => {
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await route.abort("failed");
    });
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
    await page.route(`${apiBase}/auth/me`, async (route) => {
      await route.fulfill({ json: user });
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    const submitButton = page.getByRole("button", { name: "Logging in..." });
    await expect(submitButton).toBeDisabled();
    await expect.poll(() => Boolean(releaseLogin)).toBe(true);
    releaseLogin?.();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("shows an error and clears tokens if loading the user after login fails", async ({
    page,
  }) => {
    await page.route(`${apiBase}/auth/login`, async (route) => {
      await route.fulfill({ json: tokens });
    });
    await page.route(`${apiBase}/auth/me`, async (route) => {
      await route.fulfill(
        { status: 503, json: { detail: "Unable to load account" } }
      );
    });
    await page.goto("/login");
    await page.getByPlaceholder("Email").fill(user.email);
    await page.getByPlaceholder("Password").fill("secret123");
    await page.locator("form").getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Unable to load account")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect
      .poll(() =>
        page.evaluate(() => [
          localStorage.getItem("access_token"),
          localStorage.getItem("refresh_token"),
        ])
      )
      .toEqual([null, null]);
  });
});