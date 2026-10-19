import { expect, test, type Page } from "@playwright/test";
import { alert, boardList, signIn } from "./helpers";

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

test("creates an account from the sign in page", async ({ page }) => {
  const username = `new${Date.now()}`;
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill("brand-new-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(board(page)).toBeVisible();
  await expect(boardList(page).getByText(username)).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await signIn(page, username, "brand-new-password");
  await expect(board(page)).toBeVisible();
});

test("rejects a taken username", async ({ page }) => {
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(alert(page)).toHaveText("That username is already taken");
});

test("rejects an invalid username", async ({ page }) => {
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Username").fill("no spaces allowed");
  await page.getByLabel("Password").fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(alert(page)).toContainText("letters, digits");
});
