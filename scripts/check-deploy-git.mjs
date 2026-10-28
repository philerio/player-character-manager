import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function checkDeployGit(cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "--verify", "HEAD");
  const changes = git("status", "--porcelain", "--untracked-files=all");
  if (changes) {
    throw new Error(
      "Cloudflare deployment blocked: commit all staged, unstaged, and untracked changes first. " +
        "Do not stash or ignore release files to bypass this rule.\n" +
        changes,
    );
  }
  return commit;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(`Deployment source: ${checkDeployGit()}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
