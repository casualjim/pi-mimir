#!/usr/bin/env node
/**
 * import-all.mjs — one command, zero cds: import every coding-agent session on
 * disk into its omp-<repo> bank, grouped by GIT REPO, not by fs dir.
 *
 * - Discovery reads each transcript's own header ({"type":"session","cwd":…})
 *   in ~/.pi/agent/sessions and ~/.omp/agent/sessions — attribution comes from
 *   where the session actually ran, never from this script's cwd.
 * - Grouping resolves each recorded cwd to its git checkout root; the bank id
 *   preview uses the repo's common dir, so worktrees of one repo share one
 *   bank — same rule as the plugin's omp-{gitProjectLower} template.
 * - pi/claude/codex/dsh sessions are delegated to the STAGED installer run
 *   with cwd=<repo root> (its own readers, full fidelity). Never via npx:
 *   staging would wipe the pi-hindsight patch (see README).
 * - omp sessions are converted natively (its store has a "title" line before
 *   the session header, which the official reader rejects) and sent to the
 *   staged deepen.js directly.
 * - Imports ENQUEUE ONLY: children run with HINDSIGHT_NO_WAIT=1, the env the
   patched dist (patch-dist.mjs) honors by skipping deepen's client-side
   extraction drain — every session is POSTed with async:true (the server owns
   the queue) and the run ends there. Requires a patched dist; an unpatched
   deepen simply waits as before. Per-bank logs land in
   ~/.hindsight/coding-agents-logs/import-all-<bank>.log
 *
 * Usage:
 *   node import-all.mjs --dry-run        # show the grouping, import nothing
 *   node import-all.mjs                  # enqueue every bank, report failures
 */
import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const HOME = homedir();
const DIST = join(HOME, ".hindsight", "coding-agents", "dist");
const INSTALLER = join(DIST, "installer.js");
const DEEPEN = join(DIST, "deepen.js");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sourcesIdx = args.indexOf("--sources");
const sources = sourcesIdx !== -1 ? args[sourcesIdx + 1].split(",") : ["pi", "omp", "claude"];

// ---------------------------------------------------------------------------
// turn conversion — mirrors the official reader (installer.js) so omp
// transcripts get identical treatment: prose + action lines, injected memory
// stripped so recalled blocks never re-enter the bank as new conversation.
// ---------------------------------------------------------------------------
const MEMORY_TAG_RE =
  /<(hook_prompt|task-notification|system-reminder|hindsight_memory|hindsight_memories|hindsight_bank|relevant_memories|user_feedback|hindsight_knowledge|hindsight_knowledge_refresh)\b[\s\S]*?<\/\1>/g;
const TARGET_KEYS = ["file_path", "path", "notebook_path", "command", "pattern", "query", "url", "name", "id"];
const ACTION_TARGET_CAP = 120;

const stripInjectedMemory = (s) => s.replace(MEMORY_TAG_RE, "");

function actionLine(tool, input) {
  let target = "";
  if (input && typeof input === "object") {
    for (const k of TARGET_KEYS) {
      const v = input[k];
      if (typeof v === "string" && v.trim()) { target = v.trim().split("\n")[0]; break; }
    }
  } else if (typeof input === "string") {
    target = input.trim().split("\n")[0];
  }
  if (target.length > ACTION_TARGET_CAP) target = `${target.slice(0, ACTION_TARGET_CAP)}…`;
  return target ? `${tool} ${target}` : tool;
}

function renderMessage(m) {
  if (!m || typeof m !== "object") return [];
  const role = m.role;
  if (role !== "user" && role !== "assistant") return [];
  const texts = [];
  const actions = [];
  if (typeof m.content === "string") {
    const t = stripInjectedMemory(m.content).trim();
    if (t) texts.push(t);
  } else if (Array.isArray(m.content)) {
    for (const part of m.content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "text" && typeof part.text === "string") {
        const t = stripInjectedMemory(part.text).trim();
        if (t) texts.push(t);
      } else if (part.type === "toolCall" && typeof part.name === "string") {
        actions.push({ role: "action", content: actionLine(part.name, part.arguments) });
      }
    }
  }
  const out = [];
  const joined = texts.join("\n").trim();
  if (joined) out.push({ role, content: joined });
  out.push(...actions);
  return out;
}

function toSession(id, turns) {
  const prose = turns
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role, text: t.content, ...(t.timestamp ? { timestamp: t.timestamp } : {}) }));
  return prose.length ? { id, turns: prose } : undefined;
}

function readTranscriptTurns(file) {
  const turns = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try { entry = JSON.parse(trimmed); } catch { continue; }
    if (!entry || entry.type !== "message" || !entry.message) continue;
    for (const turn of renderMessage(entry.message)) {
      turns.push(entry.timestamp ? { ...turn, timestamp: entry.timestamp } : turn);
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// discovery: session stores on disk, each file's own header carries its cwd
// ---------------------------------------------------------------------------
function headJson(file, maxLines = 12, cap = 256 * 1024) {
  try {
    const fd = openSync(file, "r");
    const chunk = Buffer.alloc(64 * 1024);
    let acc = "";
    try {
      while (acc.length < cap) {
        const n = readSync(fd, chunk, 0, chunk.length, null);
        if (n <= 0) break;
        acc += chunk.subarray(0, n).toString("utf8");
        if (acc.includes("\n")) break;
      }
    } finally {
      closeSync(fd);
    }
    for (const line of acc.split("\n").slice(0, maxLines)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const o = JSON.parse(trimmed);
        // omp writes a {"type":"title"} line before the session header — keep
        // scanning until the actual session line (pi has it on line 1)
        if (o && typeof o === "object" && o.type === "session") return o;
      } catch { /* not json — keep scanning */ }
    }
  } catch { /* unreadable */ }
  return null;
}

function jsonlFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => join(dir, e.name));
  } catch { return []; }
}

/** pi-family store: sessions/<project-dir>/*.jsonl, header {"type":"session",cwd,id}
 *  (omp writes a {"type":"title"} line first — headJson scans past it). */
function discoverPiFamily(root) {
  const found = [];
  if (!existsSync(root)) return found;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of jsonlFiles(join(root, dir.name))) {
      const head = headJson(file);
      if (head?.type === "session" && typeof head.cwd === "string" && head.cwd) {
        found.push({ file, cwd: head.cwd, id: head.id });
      }
    }
  }
  return found;
}

/** claude store: ~/.claude/projects/<project>/{files}.jsonl, "cwd" appears inside the file head. */
function discoverClaude(root) {
  const found = [];
  if (!existsSync(root)) return found;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of jsonlFiles(join(root, dir.name))) {
      try {
        for (const line of readFileSync(file, "utf8").split("\n", 400)) {
          if (!line.includes('"cwd"')) continue;
          const cwd = JSON.parse(line).cwd;
          if (typeof cwd === "string" && cwd) { found.push({ file, cwd, id: undefined }); break; }
        }
      } catch { /* skip */ }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// grouping: recorded cwd -> git checkout root; bank preview from common dir
// ---------------------------------------------------------------------------
const toplevelCache = new Map();
function checkoutRoot(cwd) {
  if (toplevelCache.has(cwd)) return toplevelCache.get(cwd);
  let root = null;
  if (existsSync(cwd)) {
    const r = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim()) root = resolve(r.stdout.trim());
  }
  toplevelCache.set(cwd, root);
  return root;
}

function repoNameOf(root) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8" });
  if (r.status !== 0) return basename(root).toLowerCase();
  const common = resolve(root, r.stdout.trim());
  const base = basename(common);
  return (base === ".git" ? basename(dirname(common)) : base).toLowerCase();
}

function isWithin(dir, prefix) {
  const p = prefix.endsWith("/") ? prefix : prefix + "/";
  return dir === prefix || dir.startsWith(p);
}

function optInPrefixes() {
  try {
    const cfg = JSON.parse(readFileSync(join(HOME, ".hindsight", "coding-agent.json"), "utf8"));
    if (cfg.optInOnly !== true || !Array.isArray(cfg.optInPaths)) return null;
    return cfg.optInPaths.map((p) => resolve(p.replace(/^~(?=\/|$)/, HOME)));
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
if (!existsSync(INSTALLER) || !existsSync(DEEPEN)) {
  console.error(`staged runtime not found at ${DIST} — run the plugin installer first`);
  process.exit(1);
}

const sessions = [];
if (sources.includes("pi")) sessions.push(...discoverPiFamily(join(HOME, ".pi", "agent", "sessions")).map((s) => ({ ...s, source: "pi" })));
if (sources.includes("omp")) sessions.push(...discoverPiFamily(join(HOME, ".omp", "agent", "sessions")).map((s) => ({ ...s, source: "omp" })));
if (sources.includes("claude")) sessions.push(...discoverClaude(join(HOME, ".claude", "projects")).map((s) => ({ ...s, source: "claude" })));

const groups = new Map(); // root -> { root, sources:Set, ompFiles:[], pi:bool, claude:bool }
const dropped = { noDir: 0, notRepo: new Set(), notOptedIn: new Set() };
const optIn = optInPrefixes();

for (const s of sessions) {
  const root = checkoutRoot(s.cwd);
  if (!root) {
    if (!existsSync(s.cwd)) { dropped.noDir++; continue; }
    // not a git checkout: the plugin falls back to the directory's own basename
    // for {gitProjectLower} — same bank shape, just without git seeding
    const g = groups.get(s.cwd) ?? { root: s.cwd, bank: `omp-${basename(s.cwd).toLowerCase()}`, sources: new Set(), ompFiles: [], delegated: true };
    g.sources.add(`${s.source}(non-repo)`);
    if (s.source === "omp") g.ompFiles.push(s);
    groups.set(s.cwd, g);
    continue;
  }
  const g = groups.get(root) ?? { root, bank: `omp-${repoNameOf(root)}`, sources: new Set(), ompFiles: [], delegated: true };
  g.sources.add(s.source);
  if (s.source === "omp") g.ompFiles.push(s);
  groups.set(root, g);
}

const opted = [];
for (const g of groups.values()) {
  if (optIn && !optIn.some((p) => isWithin(g.root, p))) { dropped.notOptedIn.add(g.root); continue; }
  opted.push(g);
}

console.log(`discovered ${sessions.length} sessions across ${opted.length + dropped.notOptedIn.size} project groups\n`);
for (const g of [...opted].sort((a, b) => a.root.localeCompare(b.root))) {
  const ompTurns = g.ompFiles.reduce((n, f) => n + readTranscriptTurns(f.file).length, 0);
  console.log(`  ${g.bank.padEnd(34)} ${[...g.sources].join("+").padEnd(24)} ${g.root}`);
  if (g.ompFiles.length) console.log(`      └ omp: ${g.ompFiles.length} sessions, ${ompTurns} turns (native import)`);
}
if (dropped.notOptedIn.size) {
  console.log(`\nskipped — outside optInPaths:`);
  for (const r of [...dropped.notOptedIn].sort()) console.log(`  ${r}`);
}
if (dropped.noDir) console.log(`skipped — recorded cwd no longer exists: ${dropped.noDir} sessions`);
if (!sessions.length) { console.log("nothing found"); process.exit(0); }
if (dryRun) { console.log("\n--dry-run — nothing imported"); process.exit(0); }

const LOG_DIR = join(HOME, ".hindsight", "coding-agents-logs");
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

mkdirSync(LOG_DIR, { recursive: true });

// enqueue-only: HINDSIGHT_NO_WAIT=1 makes the patched dist skip deepen's
// client-side extraction drain (deepen POSTs every retain with async:true and
// exits) — hindsight's server queue owns everything after that. Children run
// concurrently across banks; within a bank the omp deepen is chained before
// the delegated installer because deepen's per-bank lease would otherwise make
// the second run silently skip its import.
const runs = [];
for (const g of opted) {
  const cmds = [];

  // omp transcripts: official reader cannot parse them — convert + deepen directly
  if (g.ompFiles.length) {
    const converted = [];
    for (const f of g.ompFiles) {
      const s = toSession(f.id ?? f.file, readTranscriptTurns(f.file));
      if (s) converted.push(s);
    }
    if (converted.length) {
      const file = join(mkdtempSync(join(tmpdir(), "hindsight-import-")), "conversations.json");
      writeFileSync(file, JSON.stringify(converted));
      console.log(`omp: ${g.bank} — ${converted.length} sessions (${converted.reduce((n, s) => n + s.turns.length, 0)} turns)`);
      cmds.push(`node ${shq(DEEPEN)} --repo ${shq(g.root)} --conversations ${shq(file)}`);
    }
  }

  // pi/claude/codex/dsh: the staged installer's own readers, run at the repo root
  if (g.delegated) {
    cmds.push(`node ${shq(INSTALLER)} install pi claude-code codex dsh --import-conversations`);
  }
  if (!cmds.length) continue;

  const log = join(LOG_DIR, `import-all-${g.bank}.log`);
  const fd = openSync(log, "a");
  console.log(`enqueuing ${g.bank.padEnd(34)} → ${log}`);
  runs.push(new Promise((resolve) => {
    const child = spawn("sh", ["-c", cmds.join(" ; ")], {
      cwd: g.root,
      env: { ...process.env, HINDSIGHT_NO_WAIT: "1" },
      stdio: ["ignore", fd, fd],
    });
    const done = (result) => { closeSync(fd); resolve(result); };
    child.on("exit", (code) => done(code === 0 ? null : g.bank));
    child.on("error", (e) => done(`${g.bank} (${e.message})`));
  }));
}

const failures = (await Promise.all(runs)).filter(Boolean);
console.log(`\ndone — enqueued ${runs.length - failures.length}/${runs.length} banks; hindsight drains the queue from here`);
if (failures.length) {
  console.log(`failed (see ${LOG_DIR}/import-all-<bank>.log):`);
  for (const f of failures) console.log(`  ${f}`);
}
process.exit(failures.length ? 1 : 0);
