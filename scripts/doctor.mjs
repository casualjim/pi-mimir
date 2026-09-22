#!/usr/bin/env node
// Doctor for local-path pi packages: verifies every local package referenced by
// pi settings loads (path exists, entry exists, deps resolve) and that required
// host binaries are on PATH. Run from anywhere: node scripts/doctor.mjs
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

// Exports maps in @earendil-works packages block bare-specifier and even
// ./package.json resolution, so probe the filesystem the way Node would:
// walk upward from the package dir looking for node_modules/<spec>/package.json.
function depResolves(fromDir, spec) {
  const parts = fromDir.split(sep);
  for (let i = parts.length; i > 0; i -= 1) {
    const dir = parts.slice(0, i).join(sep) || sep;
    if (existsSync(join(dir, "node_modules", spec, "package.json"))) return true;
  }
  return false;
}

const agentDir = join(homedir(), ".pi", "agent");
const settingsFile = join(agentDir, "settings.json");

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log(`pi package doctor — ${new Date().toISOString()}\n`);

if (!existsSync(settingsFile)) {
  console.log(`✗ no pi settings at ${settingsFile}`);
  process.exit(1);
}
let settings;
try {
  settings = JSON.parse(readFileSync(settingsFile, "utf8"));
} catch (error) {
  console.log(`✗ unreadable settings at ${settingsFile}: ${error.message}`);
  process.exit(1);
}
const packages = settings.packages ?? [];

const localPackages = packages
  .filter((p) => !p.startsWith("npm:") && !p.startsWith("git:"))
  .map((p) => resolve(agentDir, p));

if (localPackages.length === 0) console.log("(no local-path packages)\n");

for (const root of localPackages) {
  const name = root.split("/").slice(-1)[0];
  console.log(`[${name}] ${root}`);
  const pkgFile = join(root, "package.json");
  if (!existsSync(pkgFile)) {
    fail("package.json missing");
    continue;
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
  } catch (error) {
    fail(`package.json unreadable: ${error.message}`);
    continue;
  }
  for (const ext of pkg.pi?.extensions ?? []) {
    const entry = join(root, ext);
    if (existsSync(entry)) ok(`entry ${ext}`);
    else fail(`entry ${ext} missing`);
  }
  for (const spec of Object.keys(pkg.peerDependencies ?? {})) {
    if (depResolves(root, spec)) ok(`resolves ${spec}`);
    else fail(`${spec} unresolved — run pnpm install at repo root`);
  }
  console.log();
}

console.log("[host binaries]");
for (const bin of ["wt", "herdr", "jj"]) {
  try {
    const out = execFileSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
    ok(`${bin} → ${out.trim()}`);
  } catch {
    fail(`${bin} not on PATH`);
  }
}

console.log(
  failures === 0 ? "\nhealthy" : `\n${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);
