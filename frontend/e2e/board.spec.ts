import { expect, test, type Locator, type Page } from "@playwright/test";
import { newUser, PASSWORD, saved, signIn } from "./helpers";

async function reload(page: Page) {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Product Launch" })).toBeVisible();
}

async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

async function openEditor(card: Locator, title: string) {
  await card.hover();
  await card.getByRole("button", { name: `Edit ${title}` }).click();
}

async function removeCard(card: Locator, title: string) {
  await card.hover();
  await card.getByRole("button", { name: `Delete ${title}` }).click();
}

const cardOrder = (page: Page, columnId: string) =>
  page.getByTestId(`column-${columnId}`).locator("li").evaluateAll((els) => els.map((el) => el.dataset.testid));

let username: string;

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
  username = await newUser(page);
  expect(errors).toEqual([]);
});

test("loads with dummy data in 5 columns", async ({ page }) => {
  await expect(page.getByLabel("Column title")).toHaveCount(5);
  await expect(page.getByLabel("Column title").first()).toHaveValue("Backlog");
  await expect(page.getByTestId("column-backlog").locator("li")).toHaveCount(3);
  await expect(page.getByText("10 cards across 5 columns")).toBeVisible();
});

test("renames a column", async ({ page }) => {
  const input = page.getByTestId("column-review").getByLabel("Column title");
  await input.fill("QA");
  await expect(input).toHaveValue("QA");
});

test("adds a card", async ({ page }) => {
  const column = page.getByTestId("column-progress");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByLabel("Card title").fill("Playwright card");
  await column.getByLabel("Card details").fill("Added from e2e");
  await column.getByRole("button", { name: "Add card" }).click();
  await expect(column.getByText("Playwright card")).toBeVisible();
  await expect(column.locator("li")).toHaveCount(3);
});

test("requires a title to add a card", async ({ page }) => {
  const column = page.getByTestId("column-todo");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByRole("button", { name: "Add card" }).click();
  await expect(column.locator("li")).toHaveCount(2);
});

test("deletes a card", async ({ page }) => {
  await removeCard(page.getByTestId("card-c1"), "Competitor research");
  await expect(page.getByText("Competitor research")).toHaveCount(0);
  await expect(page.getByText("9 cards across 5 columns")).toBeVisible();
});

test("drags a card to another column", async ({ page }) => {
  await drag(page, page.getByTestId("card-c1"), page.getByTestId("column-done"));
  await expect(page.getByTestId("column-done").getByTestId("card-c1")).toBeVisible();
  await expect(page.getByTestId("column-backlog").locator("li")).toHaveCount(2);
});

test("drags a card into an empty column", async ({ page }) => {
  await removeCard(page.getByTestId("card-c8"), "Email notifications");
  await expect(page.getByTestId("column-review").locator("li")).toHaveCount(0);
  await drag(page, page.getByTestId("card-c4"), page.getByTestId("column-review"));
  await expect(page.getByTestId("column-review").getByTestId("card-c4")).toBeVisible();
});

test("reorders cards within a column", async ({ page }) => {
  await drag(page, page.getByTestId("card-c1"), page.getByTestId("card-c3"));
  expect(await cardOrder(page, "backlog")).toEqual(["card-c2", "card-c3", "card-c1"]);
});

test("edits a card", async ({ page }) => {
  const card = page.getByTestId("card-c4");
  await openEditor(card, "Onboarding flow");
  await card.getByLabel("Edit card title").fill("Onboarding v2");
  await card.getByLabel("Edit card details").fill("Two steps only");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Onboarding v2")).toBeVisible();
  await expect(card.getByText("Two steps only")).toBeVisible();
  await expect(page.getByText("Onboarding flow")).toHaveCount(0);
});

test("cancels editing a card", async ({ page }) => {
  const card = page.getByTestId("card-c4");
  await openEditor(card, "Onboarding flow");
  await card.getByLabel("Edit card title").fill("Discarded");
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByText("Onboarding flow")).toBeVisible();
});

test("edited card can still be dragged", async ({ page }) => {
  const card = page.getByTestId("card-c4");
  await openEditor(card, "Onboarding flow");
  await card.getByLabel("Edit card title").fill("Moved after edit");
  await card.getByRole("button", { name: "Save" }).click();
  await drag(page, card, page.getByTestId("column-done"));
  await expect(page.getByTestId("column-done").getByText("Moved after edit")).toBeVisible();
});

test("serves the API alongside the app", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("edits priority, due date and labels", async ({ page }) => {
  const card = page.getByTestId("card-c3");
  await openEditor(card, "Mobile app spike");
  await card.getByLabel("Priority").selectOption("high");
  await card.getByLabel("Due date").fill("2030-03-04");
  await card.getByLabel("Labels").fill("mobile, research");
  const save = saved(page);
  await card.getByRole("button", { name: "Save" }).click();
  await save;
  await expect(card.getByText("high", { exact: true })).toBeVisible();
  await expect(card.getByText("Due Mar 4")).toBeVisible();
  await expect(card.getByText("mobile", { exact: true })).toBeVisible();
  await reload(page);
  await expect(page.getByTestId("card-c3").getByText("Due Mar 4")).toBeVisible();
  await expect(page.getByTestId("card-c3").getByText("research", { exact: true })).toBeVisible();
});

test("flags overdue cards", async ({ page }) => {
  const card = page.getByTestId("card-c1");
  await openEditor(card, "Competitor research");
  await card.getByLabel("Due date").fill("2001-02-03");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Overdue Feb 3")).toBeVisible();
  await expect(page.getByText(/\d+ overdue/)).toBeVisible();
});

test("searches and filters cards", async ({ page }) => {
  await page.getByLabel("Search cards").fill("research");
  await expect(page.getByTestId("column-backlog").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("column-todo").locator("li")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(page.locator("li[data-testid^=card-]")).toHaveCount(3);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("li[data-testid^=card-]")).toHaveCount(10);
});

test("drags a card while a filter is active", async ({ page }) => {
  await page.getByLabel("Filter by priority").selectOption("high");
  const save = saved(page);
  await drag(page, page.getByTestId("card-c2"), page.getByTestId("column-done"));
  await save;
  // dnd-kit swallows clicks for 50ms after a drop, so clear the filter without clicking.
  await page.getByLabel("Filter by priority").selectOption("");
  await expect(page.getByTestId("column-done").getByTestId("card-c2")).toBeVisible();
  await expect(page.getByTestId("column-backlog").locator("li")).toHaveCount(2);
});

test.describe("persistence", () => {
  test("added card survives reload", async ({ page }) => {
    const column = page.getByTestId("column-progress");
    await column.getByRole("button", { name: /add a card/i }).click();
    await column.getByLabel("Card title").fill("Persisted card");
    const save = saved(page);
    await column.getByRole("button", { name: "Add card" }).click();
    await save;
    await reload(page);
    await expect(page.getByTestId("column-progress").getByText("Persisted card")).toBeVisible();
  });

  test("edited card survives reload", async ({ page }) => {
    const card = page.getByTestId("card-c4");
    await openEditor(card, "Onboarding flow");
    await card.getByLabel("Edit card title").fill("Edited and saved");
    const save = saved(page);
    await card.getByRole("button", { name: "Save" }).click();
    await save;
    await reload(page);
    await expect(page.getByTestId("card-c4").getByText("Edited and saved")).toBeVisible();
  });

  test("deleted card stays deleted after reload", async ({ page }) => {
    const save = saved(page);
    await removeCard(page.getByTestId("card-c1"), "Competitor research");
    await save;
    await reload(page);
    await expect(page.getByText("Competitor research")).toHaveCount(0);
    await expect(page.getByText("9 cards across 5 columns")).toBeVisible();
  });

  test("moved card survives reload", async ({ page }) => {
    const save = saved(page);
    await drag(page, page.getByTestId("card-c1"), page.getByTestId("column-done"));
    await save;
    await reload(page);
    await expect(page.getByTestId("column-done").getByTestId("card-c1")).toBeVisible();
    await expect(page.getByTestId("column-backlog").locator("li")).toHaveCount(2);
  });

  test("reordered cards survive reload", async ({ page }) => {
    const save = saved(page);
    await drag(page, page.getByTestId("card-c1"), page.getByTestId("card-c3"));
    await save;
    await reload(page);
    expect(await cardOrder(page, "backlog")).toEqual(["card-c2", "card-c3", "card-c1"]);
  });

  test("renamed column survives reload after Enter", async ({ page }) => {
    const input = page.getByTestId("column-review").getByLabel("Column title");
    await input.fill("QA");
    const save = saved(page);
    await input.press("Enter");
    await save;
    await reload(page);
    await expect(page.getByTestId("column-review").getByLabel("Column title")).toHaveValue("QA");
  });

  test("renamed column is saved once, on blur", async ({ page }) => {
    const puts: string[] = [];
    page.on("request", (r) => r.method() === "PUT" && puts.push(r.url()));
    const input = page.getByTestId("column-review").getByLabel("Column title");
    await input.pressSequentially(" QA");
    expect(puts).toHaveLength(0);
    const save = saved(page);
    await page.getByRole("heading", { name: "Product Launch" }).click();
    await save;
    expect(puts).toHaveLength(1);
  });

  test("board survives sign out and back in", async ({ page }) => {
    const save = saved(page);
    await removeCard(page.getByTestId("card-c1"), "Competitor research");
    await save;
    await page.getByRole("button", { name: "Log out" }).click();
    await signIn(page, username, PASSWORD);
    await expect(page.getByText("9 cards across 5 columns")).toBeVisible();
  });
});
