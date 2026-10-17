import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const board = (page: Page) => page.getByRole("heading", { name: "Product Launch" });
const loginHeading = (page: Page) => page.getByRole("heading", { name: "Sign in" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("requires sign in to see the board", async ({ page }) => {
  await expect(loginHeading(page)).toBeVisible();
  await expect(board(page)).toHaveCount(0);
});

test("signs in with valid credentials", async ({ page }) => {
  await signIn(page, "user", "password");
  await expect(board(page)).toBeVisible();
});

test("rejects invalid credentials", async ({ page }) => {
  await signIn(page, "user", "wrong");
  await expect(page.getByRole("alert").filter({ hasText: "Invalid username or password" })).toBeVisible();
  await expect(board(page)).toHaveCount(0);
});

test("stays signed in after reload", async ({ page }) => {
  await signIn(page, "user", "password");
  await expect(board(page)).toBeVisible();
  await page.reload();
  await expect(board(page)).toBeVisible();
});

test("logs out and stays logged out after reload", async ({ page }) => {
  await signIn(page, "user", "password");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(loginHeading(page)).toBeVisible();
  await page.reload();
  await expect(loginHeading(page)).toBeVisible();
});

test("API rejects unauthenticated requests", async ({ request }) => {
  expect((await request.get("/api/me")).status()).toBe(401);
});
