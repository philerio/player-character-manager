import { afterEach, expect, it, vi } from "vitest";
import { requestCampaign, cancelCharacterReads } from "../src/app/transport";
const url =
  "https://campaign.example.test/?action=journal-status&characterId=hero";
const response = () =>
  Response.json({ ok: true, characterId: "hero", journal: [] });
afterEach(() => {
  vi.useRealTimers();
});
it("deduplicates identical reads and gives each caller a readable response", async () => {
  let resolve!: (value: Response) => void;
  const send = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const first = requestCampaign(url + "&_=1", undefined, send);
  const second = requestCampaign(url + "&_=2", undefined, send);
  resolve(response());
  expect(await (await first).json()).toEqual(await (await second).json());
  expect(send).toHaveBeenCalledTimes(1);
});
it("retries a transient failed read once", async () => {
  vi.useFakeTimers();
  const send = vi
    .fn()
    .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
    .mockResolvedValueOnce(response());
  const promise = requestCampaign(url, undefined, send);
  await vi.advanceTimersByTimeAsync(500);
  expect((await promise).ok).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
});
it("times out slow reads and gives up after one bounded retry", async () => {
  vi.useFakeTimers();
  const send = vi.fn(
    (_url: string, options?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const pending = requestCampaign(url, undefined, send);
  const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(40_500);
  await assertion;
  expect(send).toHaveBeenCalledTimes(2);
});
it("never automatically repeats a write whose confirmation was lost", async () => {
  const send = vi.fn().mockRejectedValue(new TypeError("Network lost"));
  await expect(
    requestCampaign(
      "https://campaign.example.test/",
      {
        method: "POST",
        body: JSON.stringify({
          action: "retainer.create",
          characterId: "hero",
        }),
      },
      send,
    ),
  ).rejects.toMatchObject({ code: "uncertain" });
  expect(send).toHaveBeenCalledTimes(1);
});
it("rejects responses for the wrong character before they reach the working copy", async () => {
  const send = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ok: true, characterId: "another-hero", journal: [] }),
    );
  await expect(requestCampaign(url, undefined, send)).rejects.toMatchObject({
    code: "validation",
  });
});
it("cancels an obsolete read without blocking a fresh read for the same character", async () => {
  const send = vi.fn(
    (_url: string, options?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  const old = requestCampaign(url, undefined, send);
  const rejected = expect(old).rejects.toMatchObject({ code: "cancelled" });
  cancelCharacterReads("hero");
  const fresh = requestCampaign(
    url,
    undefined,
    vi.fn().mockResolvedValue(response()),
  );
  await rejected;
  expect((await fresh).ok).toBe(true);
});
