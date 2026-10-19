import { expect, test, type Page } from "@playwright/test";
import { boardList, newUser, saved } from "./helpers";

async function createBoard(page: Page, name: string, sample = false) {
  await boardList(page).getByRole("button", { name: /new board/i }).click();
  await boardList(page).getByLabel("Board name").fill(name);
  if (sample) await boardList(page).getByLabel("Start with sample cards").check();
  await boardList(page).getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

const boardButton = (page: Page, name: string) => boardList(page).getByRole("button", { name: new RegExp(name) });

test.beforeEach(async ({ page }) => {
  await newUser(page);
});

test("new users start with one sample board", async ({ page }) => {
  await expect(boardList(page).getByRole("listitem")).toHaveCount(1);
  await expect(boardButton(page, "Product Launch")).toHaveAttribute("aria-current", "page");
});

test("creates an empty board and switches between boards", async ({ page }) => {
  await createBoard(page, "Website");
  await expect(page.getByText("0 cards across 5 columns")).toBeVisible();
  await expect(boardList(page).getByRole("listitem")).toHaveCount(2);
  await boardButton(page, "Product Launch").click();
  await expect(page.getByText("10 cards across 5 columns")).toBeVisible();
  await boardButton(page, "Website").click();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
});

test("creates a board with sample cards", async ({ page }) => {
  await createBoard(page, "Sample copy", true);
  await expect(page.getByText("10 cards across 5 columns")).toBeVisible();
});

test("boards keep separate cards", async ({ page }) => {
  await createBoard(page, "Website");
  const column = page.getByTestId("column-todo");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByLabel("Card title").fill("Landing page");
  const save = saved(page);
  await column.getByRole("button", { name: "Add card" }).click();
  await save;
  await expect(boardButton(page, "Website")).toContainText("1");
  await boardButton(page, "Product Launch").click();
  await expect(page.getByText("Landing page")).toHaveCount(0);
  await boardButton(page, "Website").click();
  await expect(page.getByText("Landing page")).toBeVisible();
});

test("reopens the last selected board after reload", async ({ page }) => {
  await createBoard(page, "Website");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Website" })).toBeVisible();
});

test("renames a board", async ({ page }) => {
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Board name").fill("Launch 2.0");
  await page.getByLabel("Board name").press("Enter");
  await expect(page.getByRole("heading", { name: "Launch 2.0" })).toBeVisible();
  await expect(boardButton(page, "Launch 2.0")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Launch 2.0" })).toBeVisible();
});

test("deletes a board after confirmation", async ({ page }) => {
  await createBoard(page, "Temporary");
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByRole("heading", { name: "Temporary" })).toBeVisible();
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
  await expect(boardButton(page, "Temporary")).toHaveCount(0);
  await page.reload();
  await expect(boardList(page).getByRole("listitem")).toHaveCount(1);
});

test("shows an empty state when every board is deleted", async ({ page }) => {
  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
  await createBoard(page, "Fresh start");
  await expect(page.getByText("0 cards across 5 columns")).toBeVisible();
});

test("users only see their own boards", async ({ page, browser }) => {
  await createBoard(page, "Private plans");
  const other = await browser.newPage();
  await newUser(other);
  await expect(boardList(other).getByRole("listitem")).toHaveCount(1);
  await expect(boardButton(other, "Private plans")).toHaveCount(0);
  const ids = await page.request.get("/api/boards").then((r) => r.json());
  const response = await other.request.get(`/api/boards/${ids[1].id}`);
  expect(response.status()).toBe(404);
  await other.close();
});
