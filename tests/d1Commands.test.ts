import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { AppError } from "../src/app/errors";
const state = vi.hoisted(() => ({
  values: new Map<string, string>(),
  write: vi.fn(),
}));
vi.mock("../src/app/storage", () => ({
  appStorage: {
    getItem: (key: string) => state.values.get(key) || null,
    setItemDurably: (key: string, value: string) => {
      state.write();
      state.values.set(key, value);
    },
    removeItem: (key: string) => state.values.delete(key),
  },
}));
import { withD1Command } from "../src/app/d1Commands";
afterEach(() => {
  state.values.clear();
  state.write.mockReset();
  vi.unstubAllGlobals();
});
function options(token = "session-one") {
  return {
    method: "POST",
    body: JSON.stringify({
      action: "territory.create",
      characterId: "character",
      name: "New territory",
      sessionToken: token,
    }),
  };
}
it("reuses a durable command ID after a lost response or a new session for the same account", async () => {
  vi.stubGlobal("crypto", webcrypto);
  state.values.set("pcm-draft-account", "account");
  const send = vi
    .fn()
    .mockRejectedValueOnce(new AppError("uncertain", "Lost response"))
    .mockResolvedValueOnce(new Response("{}"));
  await expect(withD1Command(options(), send)).rejects.toMatchObject({
    code: "uncertain",
  });
  await withD1Command(options("new-session"), send);
  const first = JSON.parse(String(send.mock.calls[0][0].body)),
    second = JSON.parse(String(send.mock.calls[1][0].body));
  expect(first.commandId).toBe(second.commandId);
  expect(second.sessionToken).toBe("new-session");
  expect([...state.values.keys()]).toEqual(["pcm-draft-account"]);
  expect([...state.values.values()]).not.toContain("New territory");
});
it("allows a new intentional identical creation after confirmation and isolates accounts", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const send = vi.fn().mockResolvedValue(new Response("{}"));
  await withD1Command(options(), send);
  await withD1Command(options(), send);
  expect(JSON.parse(String(send.mock.calls[0][0].body)).commandId).not.toBe(
    JSON.parse(String(send.mock.calls[1][0].body)).commandId,
  );
});
it("never sends a change when its retry ID cannot be saved durably", async () => {
  vi.stubGlobal("crypto", webcrypto);
  state.write.mockImplementation(() => {
    throw new AppError("storage", "Storage full");
  });
  const send = vi.fn();
  await expect(withD1Command(options(), send)).rejects.toMatchObject({
    code: "storage",
  });
  expect(send).not.toHaveBeenCalled();
});
