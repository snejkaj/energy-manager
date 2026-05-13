import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(rootDir, "package.json");
const configPath = join(rootDir, "config.yaml");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const packageVersion = packageJson.version;

if (!/^\d+\.\d+\.\d+$/.test(packageVersion)) {
  fail(`package.json version must use MAJOR.MINOR.PATCH. Found: ${packageVersion}`);
}

if (existsSync(configPath)) {
  const configYaml = readFileSync(configPath, "utf8");
  const configVersion = /^version:\s*["']?([^"'\n]+)["']?/m.exec(configYaml)?.[1]?.trim();
  if (configVersion !== packageVersion) {
    fail(`config.yaml version (${configVersion ?? "missing"}) must match package.json version (${packageVersion}).`);
  }
}

if (!existsSync(join(rootDir, "..", ".git"))) {
  process.exit(0);
}

const trackedChangedFiles = execFileSync("git", ["diff", "--name-only", "HEAD"], {
  cwd: join(rootDir, ".."),
  encoding: "utf8",
})
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const untrackedFiles = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
  cwd: join(rootDir, ".."),
  encoding: "utf8",
})
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const changedFiles = [...trackedChangedFiles, ...untrackedFiles];

const sourceChanged = changedFiles.some((file) => isVersionedChange(file));
const versionChanged = changedFiles.some((file) =>
  file === "energy-manager/package.json"
  || file === "energy-manager/package-lock.json"
  || file === "energy-manager/config.yaml"
);

if (sourceChanged && !versionChanged) {
  fail("Source files changed but version files did not. Update package.json and config.yaml according to VERSIONING.md.");
}

function isVersionedChange(file) {
  if (!file.startsWith("energy-manager/")) {
    return false;
  }

  return [
    "energy-manager/src/",
    "energy-manager/public/",
    "energy-manager/scripts/",
    "energy-manager/tests/",
    "energy-manager/docs/",
    "energy-manager/translations/",
  ].some((prefix) => file.startsWith(prefix))
    || [
      "energy-manager/Dockerfile",
      "energy-manager/run.sh",
      "energy-manager/.env.example",
      "energy-manager/README.md",
    ].includes(file);
}

function fail(message) {
  console.error(`[Version] ${message}`);
  process.exit(1);
}
