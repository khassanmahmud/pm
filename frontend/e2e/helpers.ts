import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password";

/** Register a fresh user (signed in, with the sample "Product Launch" board) and open the app. */
export async function newUser(page: Page): Promise<string> {
  const username = `e2e${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  const response = await page.request.post("/api/register", { data: { username, password: PASSWORD } });
  expect(response.status()).toBe(201);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
  return username;
}

export async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export const boardList = (page: Page) => page.getByRole("navigation", { name: "Boards" });

export const saved = (page: Page) =>
  page.waitForResponse((r) => /\/api\/boards\/\d+$/.test(r.url()) && r.request().method() === "PUT" && r.ok());

/** The app's alert; Next.js also renders an empty role="alert" route announcer. */
export const alert = (page: Page) => page.getByRole("alert").filter({ hasText: /\S/ });
