import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "./AccountSettings";

function mockFetch(status: number) {
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : "{}", { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderSettings() {
  const props = { onDeleted: vi.fn(), onUnauthorized: vi.fn() };
  render(<AccountSettings username="alice" {...props} />);
  return props;
}

async function changePassword(current: string, next: string) {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
}

async function deleteAccount(password: string) {
  await userEvent.type(screen.getByLabelText("Confirm with your password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountSettings", () => {
  it("shows the username", () => {
    renderSettings();
    expect(screen.getByRole("heading", { name: "alice" })).toBeInTheDocument();
  });

  it("changes the password and clears the form", async () => {
    const fetchMock = mockFetch(200);
    renderSettings();
    await changePassword("old-password", "new-password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password" }),
    });
  });

  it("reports a wrong current password", async () => {
    mockFetch(403);
    renderSettings();
    await changePassword("wrong-password", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
  });

  it("reports an invalid new password", async () => {
    mockFetch(422);
    renderSettings();
    await changePassword("old-password", "x".repeat(200));
    expect(await screen.findByRole("alert")).toHaveTextContent("8-128 characters");
  });

  it("deletes the account", async () => {
    const fetchMock = mockFetch(204);
    const { onDeleted } = renderSettings();
    await deleteAccount("my-password");
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/account", expect.objectContaining({ method: "DELETE" }));
  });

  it("does not delete the account with a wrong password", async () => {
    mockFetch(403);
    const { onDeleted } = renderSettings();
    await deleteAccount("wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("signs out when the session has expired", async () => {
    mockFetch(401);
    const { onUnauthorized } = renderSettings();
    await changePassword("old-password", "new-password");
    await deleteAccount("my-password");
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});
