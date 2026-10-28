import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDeployGit } from "./check-deploy-git.mjs";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const target = process.argv[2];
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args) {
  const result = spawnSync(npm, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Command failed: npm ${args.join(" ")}`);
}
try {
  if (!["ui", "api"].includes(target) || process.argv.length !== 3)
    throw new Error(
      "Use npm run deploy:ui or npm run deploy:api; no bypass flags are supported.",
    );
  const commit = checkDeployGit(cwd);
  console.log(`Deploying ${target} from committed Git revision ${commit}`);
  if (target === "ui") run(["run", "build"]);
  if (checkDeployGit(cwd) !== commit)
    throw new Error(
      "Cloudflare deployment blocked: HEAD changed during preparation.",
    );
  run([
    "exec",
    "--",
    "wrangler",
    "deploy",
    "--config",
    target === "ui" ? "wrangler.ui.jsonc" : "wrangler.jsonc",
    ...(target === "api" ? ["--keep-vars"] : []),
  ]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
