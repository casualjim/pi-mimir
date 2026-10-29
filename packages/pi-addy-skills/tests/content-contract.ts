/**
 * Contract check for the ported skills, prompts, and package surfaces. Runs
 * under the package's test script (`bun tests/content-contract.ts`).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(root, "skills");
const promptsRoot = path.join(root, "commands");
const referencesRoot = path.join(root, "references");

const pkg = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
) as {
  files: string[];
  pi: { extensions: string[]; skills: string[]; prompts: string[] };
};

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const simple = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (simple) result[simple[1]!] = simple[2]!.replace(/^['"]|['"]$/g, "").trim();
  }
  return result;
}

// --- package surfaces exist as declared ---
for (const entry of pkg.pi.extensions)
  assert.ok(existsSync(path.join(root, entry)), `extension path ${entry} exists`);
for (const entry of pkg.pi.skills)
  assert.ok(existsSync(path.join(root, entry)), `skills path ${entry} exists`);
for (const entry of pkg.pi.prompts)
  assert.ok(existsSync(path.join(root, entry)), `prompts path ${entry} exists`);
for (const entry of pkg.files)
  assert.ok(existsSync(path.join(root, entry)), `files entry ${entry} exists`);
assert.ok(pkg.files.includes("references/"), "references/ must be published");

// --- skills inventory ---
const skillDirs = readdirSync(skillsRoot).filter((name) =>
  statSync(path.join(skillsRoot, name)).isDirectory(),
);
assert.equal(skillDirs.length, 25, "expected 25 ported skills");
const skillNames = new Set(skillDirs);

for (const dir of skillDirs) {
  const skillPath = path.join(skillsRoot, dir, "SKILL.md");
  const markdown = readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  assert.equal(frontmatter.name, dir, `${dir} frontmatter name matches dir`);
  assert.ok(frontmatter.description, `${dir} has a description`);
  assert.ok(
    frontmatter.description!.length <= 1024,
    `${dir} description within 1024 chars`,
  );
  assert.ok(
    markdown.includes("## omp tooling"),
    `${dir} carries an omp tooling section`,
  );
  assert.ok(
    !markdown.includes("agent-skills:"),
    `${dir} must not keep the Claude plugin skill prefix`,
  );
}

// --- every relative markdown link inside shipped markdown resolves ---
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

let linkCount = 0;
for (const file of [...walkMarkdown(skillsRoot), ...walkMarkdown(referencesRoot)]) {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const [filePart] = target.split("#");
    if (!filePart) continue;
    const resolved = path.resolve(path.dirname(file), filePart!);
    linkCount += 1;
    assert.ok(
      existsSync(resolved),
      `${path.relative(root, file)} links missing ${target}`,
    );
  }
}
assert.ok(linkCount > 20, `expected the reference network to be exercised (${linkCount} links)`);

// --- commands (pi prompts surface) ---
const promptFiles = readdirSync(promptsRoot).sort();
assert.deepEqual(
  promptFiles,
  [
    "as:build.md",
    "as:code-simplify.md",
    "as:constraints.md",
    "as:plan.md",
    "as:review.md",
    "as:ship.md",
    "as:spec.md",
    "as:test.md",
    "as:webperf.md",
  ],
  "unexpected prompt set",
);

for (const file of promptFiles) {
  const markdown = readFileSync(path.join(promptsRoot, file), "utf8");
  const frontmatter = parseFrontmatter(markdown);
  assert.ok(frontmatter.description, `${file} has a description`);
  assert.ok(
    !markdown.includes("agent-skills:"),
    `${file} must not keep the Claude plugin skill prefix`,
  );
  assert.ok(
    !markdown.includes("subagent_type") && !markdown.includes("Agent tool"),
    `${file} must not reference Claude spawn mechanics`,
  );
  for (const match of markdown.matchAll(/`([a-z][a-z0-9-]+)` skill/g)) {
    assert.ok(
      skillNames.has(match[1]!),
      `${file} references unknown skill ${match[1]}`,
    );
  }
}

const ship = readFileSync(path.join(promptsRoot, "as:ship.md"), "utf8");
for (const persona of ["code-reviewer", "security-auditor", "test-engineer"])
  assert.ok(ship.includes(persona), `as:ship fans out to ${persona}`);
assert.ok(ship.includes("tasks[]"), "as:ship dispatches one parallel task call on omp");

// --- root references shipped intact ---
assert.equal(
  readdirSync(referencesRoot).filter((n) => n.endsWith(".md")).length,
  7,
  "expected 7 root reference docs",
);

console.log(
  `addy-skills content contract: ok (${skillDirs.length} skills, ${promptFiles.length} prompts, ${linkCount} links resolved)`,
);
