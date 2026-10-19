import { expect, test } from "@playwright/test";
import { alert, boardList, newUser, PASSWORD, signIn } from "./helpers";

let username: string;

test.beforeEach(async ({ page }) => {
  username = await newUser(page);
  await boardList(page).getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: username })).toBeVisible();
});

test("changes the password", async ({ page }) => {
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill("changed-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toHaveText("Password changed");
  await boardList(page).getByRole("button", { name: "Log out" }).click();
  await signIn(page, username, PASSWORD);
  await expect(alert(page)).toHaveText("Invalid username or password");
  await signIn(page, username, "changed-password");
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
});

test("rejects a wrong current password", async ({ page }) => {
  await page.getByLabel("Current password").fill("not-my-password");
  await page.getByLabel("New password").fill("changed-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(alert(page)).toHaveText("Current password is incorrect");
});

test("requires a new password of at least 8 characters", async ({ page }) => {
  await page.getByLabel("Current password").fill(PASSWORD);
  await page.getByLabel("New password").fill("short");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByLabel("New password")).toHaveJSProperty("validity.tooShort", true);
});

test("deletes the account", async ({ page }) => {
  await page.getByLabel("Confirm with your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await signIn(page, username, PASSWORD);
  await expect(alert(page)).toHaveText("Invalid username or password");
});

test("returns to the board from account settings", async ({ page }) => {
  await boardList(page).getByRole("button", { name: /Product Launch/ }).click();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
});
