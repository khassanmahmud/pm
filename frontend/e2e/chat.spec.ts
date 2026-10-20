import { expect, test, type Page } from "@playwright/test";
import { newCard } from "../src/lib/board";
import { deferred } from "../src/test/async";
import { initialBoard } from "../src/test/sampleBoard";
import { boardList, createBoard, newUser } from "./helpers";

async function mockChat(page: Page, reply: string, board: unknown = null) {
  const requests: unknown[] = [];
  await page.route("**/api/boards/*/chat", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { reply, board } });
  });
  return requests;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test.beforeEach(async ({ page }) => {
  await newUser(page);
});

test("sidebar is shown next to the board", async ({ page }) => {
  await expect(page.getByRole("complementary", { name: "AI assistant" })).toBeVisible();
  await expect(page.getByText(/ask me to add, edit, move/i)).toBeVisible();
});

test("chats and shows the reply", async ({ page }) => {
  const requests = await mockChat(page, "You have 10 cards.");
  await send(page, "How many cards?");
  const messages = page.getByTestId("chat-messages");
  await expect(messages.getByText("How many cards?")).toBeVisible();
  await expect(messages.getByText("You have 10 cards.")).toBeVisible();
  expect(requests).toEqual([{ message: "How many cards?", history: [] }]);
});

test("sends history on follow-up messages", async ({ page }) => {
  const requests = await mockChat(page, "Sure.");
  await send(page, "first");
  await expect(page.getByTestId("chat-messages").getByText("Sure.")).toBeVisible();
  await send(page, "second");
  await expect(page.getByTestId("chat-messages").getByText("Sure.")).toHaveCount(2);
  expect(requests[1]).toEqual({
    message: "second",
    history: [
      { role: "user", content: "first" },
      { role: "assistant", content: "Sure." },
    ],
  });
});

test("board refreshes when the AI updates it", async ({ page }) => {
  const board = structuredClone(initialBoard);
  board.cards.ai1 = newCard("ai1", { title: "Created by AI", details: "From the assistant", priority: "high" });
  board.columns[1].cardIds.push("ai1");
  board.columns[0].cardIds = board.columns[0].cardIds.filter((id) => id !== "c1");
  board.columns[4].cardIds.unshift("c1");
  await mockChat(page, "Added a card and moved Competitor research to Done.", board);
  await send(page, "Add a card and move c1 to done");
  await expect(page.getByTestId("column-todo").getByText("Created by AI")).toBeVisible();
  await expect(page.getByTestId("column-done").getByTestId("card-c1")).toBeVisible();
  await expect(page.getByText("11 cards across 5 columns")).toBeVisible();
  await expect(page.getByTestId("card-ai1").getByText("high", { exact: true })).toBeVisible();
  await expect(boardList(page).getByRole("button", { name: /Product Launch\s*11/ })).toBeVisible();
});

test("chat goes to the selected board and starts fresh per board", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/boards/*/chat", async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { reply: "Noted.", board: null } });
  });
  await send(page, "On the first board");
  await expect(page.getByTestId("chat-messages").getByText("Noted.")).toBeVisible();
  await createBoard(page, "Second");
  await expect(page.getByTestId("chat-messages").getByText("On the first board")).toHaveCount(0);
  await send(page, "On the second board");
  await expect(page.getByTestId("chat-messages").getByText("Noted.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).not.toEqual(requests[1]);
});

test("board is unchanged when the AI returns no update", async ({ page }) => {
  await mockChat(page, "Nothing to change.");
  await send(page, "Hello");
  await expect(page.getByTestId("chat-messages").getByText("Nothing to change.")).toBeVisible();
  await expect(page.getByText("10 cards across 5 columns")).toBeVisible();
});

test("shows an error when the assistant fails", async ({ page }) => {
  await page.route("**/api/boards/*/chat", (route) => route.fulfill({ status: 500, body: "" }));
  await send(page, "Hello");
  await expect(page.getByText(/could not respond/i)).toBeVisible();
});

test("sidebar can be closed and reopened", async ({ page }) => {
  await page.getByRole("button", { name: "Close assistant" }).click();
  await expect(page.getByLabel("Message")).toHaveCount(0);
  await page.getByRole("button", { name: "AI assistant" }).click();
  await expect(page.getByLabel("Message")).toBeVisible();
});

test("board cannot be edited while the AI is responding", async ({ page }) => {
  const replied = deferred();
  await page.route("**/api/boards/*/chat", async (route) => {
    await replied.promise;
    await route.fulfill({ json: { reply: "Done.", board: null } });
  });
  await send(page, "Wait");
  const card = page.getByTestId("card-c1");
  const remove = card.getByRole("button", { name: "Delete Competitor research" });
  await card.hover({ force: true });
  await remove.click({ force: true });
  await expect(card).toBeVisible();
  replied.resolve();
  await expect(page.getByTestId("chat-messages").getByText("Done.")).toBeVisible();
  await card.hover();
  await remove.click();
  await expect(card).toHaveCount(0);
});
