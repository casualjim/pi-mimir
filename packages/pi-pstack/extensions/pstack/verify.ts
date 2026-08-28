import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";

// Returns "verify-skill" if a project-local verify-* skill exists, "harness" if
// a recognizable test harness is present, or null when neither is found. Drives
// the end-of-setup offer to generate a verification skill.
export function findVerification(cwd: string): "verify-skill" | "harness" | null {
  try {
    for (const name of readdirSync(path.join(cwd, ".pi", "skills"))) {
      if (name.startsWith("verify-")) return "verify-skill";
    }
  } catch {
    // No .pi/skills directory; nothing to find.
  }
  const has = (file: string) => existsSync(path.join(cwd, file));
  if (
    [
      "vitest.config.ts", "vitest.config.js", "vitest.config.mjs", "vitest.config.mts", "vitest.config.cts",
      "jest.config.js", "jest.config.ts", "jest.config.mjs", "jest.config.cjs",
      "playwright.config.ts", "playwright.config.js", "cypress.config.ts", "cypress.config.js",
      "pytest.ini", "conftest.py", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "build.gradle.kts",
    ].some(has)
  ) {
    return "harness";
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as { scripts?: { test?: string } };
    const test = pkg.scripts?.test;
    if (test && !/^(echo .*no test|exit 0)/i.test(test)) return "harness";
  } catch {
    // No or invalid package.json.
  }
  try {
    if (existsSync(path.join(cwd, "Makefile")) && /^test:/m.test(readFileSync(path.join(cwd, "Makefile"), "utf8"))) return "harness";
  } catch {
    // Makefile unreadable; ignore.
  }
  return null;
}