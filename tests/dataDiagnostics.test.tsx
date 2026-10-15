import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { validateResponse } from "../src/app/validation";
import { AppError } from "../src/app/errors";
import { createMockBootstrap } from "../src/app/mockData";
import { requestCampaign } from "../src/app/transport";
import {
  diagnosticsScope,
  reportDataIssue,
  resolveDataIssues,
  clearDataIssues,
  getDataIssues,
} from "../src/app/dataDiagnostics";
import { DataDiagnostics } from "../src/components/DataDiagnostics";
import App from "../src/App";
const data = createMockBootstrap();
const token = "demo-session";
const scope = diagnosticsScope(token);
function issue(action: string, response: unknown) {
  try {
    validateResponse(action, response, data.selectedCharacterId);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).dataIssue!;
  }
  throw new Error("Expected invalid data");
}
afterEach(() => {
  clearDataIssues(scope);
  clearDataIssues(diagnosticsScope("other-session"));
});
it("pinpoints a missing dataset without inventing a spreadsheet row", () => {
  expect(
    issue("retainer-status", {
      ok: true,
      characterId: data.selectedCharacterId,
    }),
  ).toMatchObject({
    path: "retainers",
    expected: "an array",
    received: "missing",
  });
});
it("identifies a bad field and its record without copying its value", () => {
  const diagnostic = issue("retainer-status", {
    ok: true,
    characterId: data.selectedCharacterId,
    retainers: [{ ...data.retainers[0], wageGp: "PRIVATE_INVALID_VALUE" }],
  });
  expect(diagnostic).toMatchObject({
    path: "retainers[0].wageGp",
    collection: "retainers",
    recordId: data.retainers[0].retainerId,
    recordIndex: 1,
    expected: "a finite number",
    received: "text",
  });
  expect(JSON.stringify(diagnostic)).not.toContain("PRIVATE_INVALID_VALUE");
});
it("identifies a duplicate ID and the response record containing it", () => {
  expect(
    issue("retainer-status", {
      ok: true,
      characterId: data.selectedCharacterId,
      retainers: [data.retainers[0], data.retainers[0]],
    }),
  ).toMatchObject({
    path: "retainers[1].retainerId",
    recordIndex: 2,
    expected: "a unique record ID",
  });
});
it("locates nested scouting allocations and restores context after failure", () => {
  const mission = {
    ...data.scoutingMissions[0],
    allocations: [
      { retainerId: "demo-force", soldierType: "scout", men: "bad" },
    ],
  };
  expect(
    issue("territory-status", {
      ...data,
      characterId: data.selectedCharacterId,
      scoutingMissions: [mission],
    }),
  ).toMatchObject({
    path: "scoutingMissions[0].allocations[0].men",
    recordId: mission.missionId,
  });
  const next = issue("retainer-status", {
    ok: true,
    characterId: data.selectedCharacterId,
  });
  expect(next.recordId).toBeUndefined();
  expect(next.path).toBe("retainers");
});
it("uses the actual singular mutation response path", () => {
  expect(
    issue("retainer.create", {
      ok: true,
      retainer: { ...data.retainers[0], wageGp: "bad" },
      schedule: null,
    }),
  ).toMatchObject({
    path: "retainer.wageGp",
    recordId: data.retainers[0].retainerId,
  });
});
it("captures response diagnostics in transport and clears them after a valid retry", async () => {
  const url = `https://campaign.test/?action=retainer-status&characterId=${data.selectedCharacterId}&sessionToken=${token}`;
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: [{ ...data.retainers[0], wageGp: "bad" }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        ok: true,
        characterId: data.selectedCharacterId,
        retainers: data.retainers,
      }),
    );
  await expect(requestCampaign(url, undefined, send)).rejects.toMatchObject({
    code: "validation",
  });
  expect(getDataIssues(scope, data.selectedCharacterId)).toHaveLength(1);
  expect(getDataIssues(scope, data.selectedCharacterId)[0].action).toBe(
    "retainer-status",
  );
  await requestCampaign(url, undefined, send);
  expect(getDataIssues(scope, data.selectedCharacterId)).toEqual([]);
});
it("isolates characters and sessions and excludes credentials, emails and raw values from reports", async () => {
  const secret = "SESSION_SECRET_VALUE";
  const secretScope = diagnosticsScope(secret);
  expect(secretScope).not.toContain(secret);
  const url = `https://campaign.test/?action=retainer-status&characterId=${data.selectedCharacterId}&sessionToken=${token}&accessKey=ACCESS_SECRET_VALUE`;
  await expect(
    requestCampaign(
      url,
      undefined,
      vi.fn().mockResolvedValue(
        Response.json({
          ok: true,
          characterId: data.selectedCharacterId,
          password: "PASSWORD_SECRET_VALUE",
          email: "private@example.com",
          retainers: [{ ...data.retainers[0], wageGp: "PRIVATE_NOTE_VALUE" }],
        }),
      ),
    ),
  ).rejects.toMatchObject({ code: "validation" });
  const report = JSON.stringify(getDataIssues(scope, data.selectedCharacterId));
  for (const value of [
    token,
    "ACCESS_SECRET_VALUE",
    "PASSWORD_SECRET_VALUE",
    "private@example.com",
    "PRIVATE_NOTE_VALUE",
  ])
    expect(report).not.toContain(value);
  expect(
    getDataIssues(diagnosticsScope("other-session"), data.selectedCharacterId),
  ).toEqual([]);
  expect(getDataIssues(scope, "other-character")).toEqual([]);
});
it("updates the DM details panel as issues are detected and resolved", () => {
  render(<DataDiagnostics characterId={data.selectedCharacterId} />);
  expect(screen.getByText(/No active validation issues/)).toBeTruthy();
  act(() =>
    reportDataIssue(scope, "retainer-status", data.selectedCharacterId, {
      path: "retainers[0].wageGp",
      collection: "retainers",
      recordId: "demo-force",
      recordIndex: 1,
      expected: "a finite number",
      received: "text",
    }),
  );
  expect(screen.getByText("Data checks · 1 issue")).toBeTruthy();
  expect(screen.getByText("retainers[0].wageGp")).toBeTruthy();
  expect(screen.getByText("demo-force")).toBeTruthy();
  expect(
    screen.getByRole("button", {
      hidden: true,
      name: "Download data issue report",
    }),
  ).toBeTruthy();
  act(() =>
    resolveDataIssues(scope, "retainer-status", data.selectedCharacterId),
  );
  expect(screen.getByText(/No active validation issues/)).toBeTruthy();
});
it("does not show DM diagnostic controls in the player character menu", async () => {
  render(<App />);
  fireEvent.click(
    await screen.findByRole("button", { hidden: true, name: "Rowan Ashford" }),
  );
  expect(screen.queryByText(/^Data checks/)).toBeNull();
});

it("replaces an earlier field issue when a retry reaches a different invalid field", () => {
  reportDataIssue(scope, "retainer-status", data.selectedCharacterId, {
    path: "retainers[0].wageGp",
    expected: "a number",
    received: "text",
  });
  reportDataIssue(scope, "retainer-status", data.selectedCharacterId, {
    path: "retainers[1].name",
    expected: "non-empty text",
    received: "blank text",
  });
  expect(
    getDataIssues(scope, data.selectedCharacterId).map((issue) => issue.path),
  ).toEqual(["retainers[1].name"]);
});
