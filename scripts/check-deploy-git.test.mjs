import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDeployGit } from "./check-deploy-git.mjs";

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), "pcm-deploy-git-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init");
  git("config", "user.name", "Deployment Test");
  git("config", "user.email", "deploy@example.test");
  writeFileSync(join(cwd, "release.txt"), "committed source\n");
  writeFileSync(join(cwd, ".gitignore"), ".env.production.local\ndist/\n");
  git("add", ".");
  git("-c", "core.hooksPath=/dev/null", "commit", "-m", "Initial release");
  return { cwd, git };
}

test("accepts a clean committed checkout and returns its revision", (t) => {
  const { cwd, git } = repository(t);
  assert.equal(checkDeployGit(cwd), git("rev-parse", "HEAD"));
});
for (const staged of [false, true]) {
  test(`blocks ${staged ? "staged" : "unstaged"} release edits`, (t) => {
    const { cwd, git } = repository(t);
    writeFileSync(join(cwd, "release.txt"), "uncommitted update\n");
    if (staged) git("add", "release.txt");
    assert.throws(() => checkDeployGit(cwd), /deployment blocked/);
  });
}
test("blocks untracked release files", (t) => {
  const { cwd } = repository(t);
  writeFileSync(join(cwd, "new-release.txt"), "new code\n");
  assert.throws(() => checkDeployGit(cwd), /deployment blocked/);
});
test("allows private ignored environment files", (t) => {
  const { cwd } = repository(t);
  writeFileSync(join(cwd, ".env.production.local"), "VITE_DEMO_MODE=false\n");
  assert.doesNotThrow(() => checkDeployGit(cwd));
});
test("blocks staged deletions", (t) => {
  const { cwd, git } = repository(t);
  git("rm", "release.txt");
  assert.throws(() => checkDeployGit(cwd), /deployment blocked/);
});
