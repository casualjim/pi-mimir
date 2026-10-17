#!/usr/bin/env node
/**
 * patch-dist.mjs — apply template-aware recall/reflect tags to the stock
 * hindsight-coding-agents dist, in place, so EVERY harness (pi, claude, codex,
 * cursor, opencode, cline, kilo, mcp-server, …) gets the shared-bank features,
 * not just the pi wrapper extension.
 *
 * What it changes (surgical string patches, backed up, node --check verified):
 *   1. Injects helpers (`__piLowerResolvers`, `__piRecallTag`, `__piReflectTags`)
 *      at the top of each bundle.
 *   2. `applyTemplate` learns `<name>Lower` placeholders ({gitProjectLower} =
 *      {gitProject} lowercased) by wrapping its resolvers — one anchor that
 *      covers bankIdTemplate, retainTags and retainMetadata in EVERY bundle,
 *      including entry points that resolve banks outside applyBankConfig
 *      (status.js, deepen.js, hindsight-seed.js, dsh.js, …).
 *   3. Wraps the two success returns of `applyBankConfig` so the config gains:
 *        - `recallTags` (template-aware: {gitProject}, {gitProjectLower},
 *          {project}, {channel}, {user}) baked into `recallOptions.tags`
 *        - `recallTagsMatch` baked into `recallOptions.tags_match` (default "any")
 *        - `{gitProjectLower}` pre-resolved inside `retainTags`
 *      (recallOptions.tags set explicitly wins, verbatim)
 *   4. Teaches the client's `reflect()` to send those tags (upstream hardcodes
 *      none). Recall already spreads `recallOptions`.
 *   5. Disables the runtime's self-update staging (`maybeAutoUpdate` returns
 *      early). The daily background re-stage replaces the dist with stock
 *      code, silently wiping this patch — and with a `{gitProjectLower}`
 *      bank template every bank collapses into `omp-unknown` until the
 *      patcher is re-run. Long-running hosts hold the config they loaded at
 *      startup, so a config-level `autoUpdate: false` cannot protect them.
 *      Escape hatch: HINDSIGHT_ALLOW_SELF_UPDATE=1 (update manually, then
 *      re-run this script).
 *
 * Idempotent (markers), re-runnable after `hindsight-coding-agents update`.
 * Originals kept once as `<file>.orig-pirecalltags`. `--restore` puts them back.
 *
 * Usage:
 *   node patch-dist.mjs                       # patch ~/.hindsight/coding-agents/dist
 *   node patch-dist.mjs --dist <dir>          # patch another dist
 *   node patch-dist.mjs --restore [--dist <dir>]
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TAG = "[pi-recall-tags]";
const BACKUP_SUFFIX = ".orig-pirecalltags";
const MARKER = "__piRecallTag(";

const args = process.argv.slice(2);
const restore = args.includes("--restore");
const distIdx = args.indexOf("--dist");
const dist = distIdx !== -1 ? args[distIdx + 1] : join(homedir(), ".hindsight", "coding-agents", "dist");

if (!existsSync(dist)) {
	console.error(`${TAG} dist not found: ${dist}`);
	process.exit(1);
}

const HELPERS = `function __piLowerResolvers(resolvers) {
  const out = Object.assign(Object.create(null), resolvers);
  for (const k of Object.keys(out)) {
    const lower = k + "Lower";
    if (!(lower in out)) out[lower] = () => String(out[k]()).toLowerCase();
  }
  return out;
}
function __piReflectTags(client) {
  const ro = client && client.recallOptions;
  return Array.isArray(ro == null ? void 0 : ro.tags) && ro.tags.length ? { tags: ro.tags, tags_match: ro.tags_match } : {};
}
function __piRecallTag(res, directory) {
  try {
    const cfg = res == null ? void 0 : res.cfg;
    if (!cfg || cfg.disabled || typeof directory !== "string" || !directory) return res;
    const proj = gitProjectName(directory, cfg.resolveWorktrees ?? true, "");
    const resolvers = {
      gitProject: () => proj,
      gitProjectLower: () => proj.toLowerCase(),
      project: () => dirName(directory),
      channel: () => process.env.HINDSIGHT_CHANNEL_ID || "default",
      user: () => process.env.HINDSIGHT_USER_ID || "anonymous"
    };
    const resolve = (t) => String(t).replace(/\\{([a-zA-Z]+)\\}/g, (w, n) => resolvers[n] ? resolvers[n]() : w);
    if (Array.isArray(cfg.retainTags))
      cfg.retainTags = cfg.retainTags.map((t) => typeof t === "string" && t.includes("{gitProjectLower}") ? resolve(t) : t);
    if (cfg.recallTags === void 0 && cfg.recallTagsMatch === void 0) return res;
    const ro = cfg.recallOptions && typeof cfg.recallOptions === "object" && !Array.isArray(cfg.recallOptions) ? cfg.recallOptions : {};
    if (ro.tags !== void 0) return res;
    const templates = Array.isArray(cfg.recallTags) ? cfg.recallTags.filter((t) => typeof t === "string" && t.trim() !== "") : [];
    const match = typeof cfg.recallTagsMatch === "string" && cfg.recallTagsMatch.trim() !== "" ? cfg.recallTagsMatch.trim() : "any";
    res.cfg = { ...cfg, recallOptions: { ...ro, tags: [...new Set(templates.map(resolve))], tags_match: match } };
  } catch (err) {
    console.error("${TAG} recallTags processing failed:", err && err.message ? err.message : err);
  }
  return res;
}
`;

const ANCHOR_TEMPLATE = "function applyTemplate(template, resolvers, what) {";
const PATCH_TEMPLATE = "function applyTemplate(template, resolvers, what) {\n  resolvers = __piLowerResolvers(resolvers);";
const ANCHOR_AUTOUPDATE = '    if (!cfg.autoUpdate) return "";';
const PATCH_AUTOUPDATE = '    if (!cfg.autoUpdate) return "";\n    if (process.env.HINDSIGHT_ALLOW_SELF_UPDATE !== "1") return ""; /* pi-hindsight: patched runtime must not self-replace; update manually, then re-run patch-dist.mjs */';
const ANCHOR_NO_SECTION = "  if (!section) return { cfg, bankId: resolvedId };";
const PATCH_NO_SECTION = "  if (!section) return __piRecallTag({ cfg, bankId: resolvedId }, directory);";
const ANCHOR_TAIL = "  return { cfg: { ...cfg, ...resolvePartial(cfg, safe) }, bankId };";
const PATCH_TAIL = "  return __piRecallTag({ cfg: { ...cfg, ...resolvePartial(cfg, safe) }, bankId }, directory);";
const ANCHOR_DRAIN = "  async drain(ids, label, maxMs = 60 * 60 * 1e3) {";
const PATCH_DRAIN = ANCHOR_DRAIN + '\n    if (process.env.HINDSIGHT_NO_WAIT === "1") { this.log("[wait] HINDSIGHT_NO_WAIT=1 — enqueued, skipping drain"); return; } /* pi-hindsight: import-all enqueues only; hindsight owns the queue */';
const ANCHOR_ACTIVE = "  async activeOperations() {";
const PATCH_ACTIVE = ANCHOR_ACTIVE + '\n    if (process.env.HINDSIGHT_NO_WAIT === "1") return 0; /* pi-hindsight: settles nothing under NO_WAIT — nothing is being waited on */';
const NO_WAIT_MARKER = "HINDSIGHT_NO_WAIT";
const ANCHOR_REFLECT = 'body: JSON.stringify({ query, budget: opts.budget ?? "high" }),';
const PATCH_REFLECT = 'body: JSON.stringify({ query, budget: opts.budget ?? "high", ...__piReflectTags(this) }),';

const results = [];

function check(file) {
	const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
	return r.status === 0 ? null : `${r.stderr}`.slice(0, 300);
}

for (const name of readdirSync(dist).filter((f) => f.endsWith(".js") && !f.endsWith(BACKUP_SUFFIX)).sort()) {
	const path = join(dist, name);
	const src = readFileSync(path, "utf8");
	const report = { file: name, patches: 0, skipped: [], status: "" };

	if (restore) {
		const backup = path + BACKUP_SUFFIX;
		if (existsSync(backup)) {
			copyFileSync(backup, path);
			report.status = "restored";
		} else {
			report.status = "no backup";
		}
		results.push(report);
		continue;
	}

	// partial patching: a file may already carry the recall-tag patches but
	// lack newer ones (e.g. NO_WAIT) — only skip when fully current
	const alreadyHelpers = src.includes(MARKER);
	if (alreadyHelpers && src.includes(NO_WAIT_MARKER)) {
		report.status = "already patched";
		results.push(report);
		continue;
	}

    // Hook bundles start with a shebang — helpers must go AFTER it, not before.
    const bodyStart = src.startsWith("#!") ? src.indexOf("\n") + 1 : 0;
    let out = src.slice(0, bodyStart);
    let body = src.slice(bodyStart);
    if (body.includes(ANCHOR_TEMPLATE)) {
      body = body.replace(ANCHOR_TEMPLATE, PATCH_TEMPLATE);
      report.patches++;
    } else if (body.includes("function applyTemplate")) {
      report.skipped.push("applyTemplate anchor");
    }
    if (body.includes(ANCHOR_AUTOUPDATE)) {
      body = body.replace(ANCHOR_AUTOUPDATE, PATCH_AUTOUPDATE);
      report.patches++;
    } else if (body.includes("maybeAutoUpdate")) {
      report.skipped.push("autoUpdate guard anchor");
    }
    if (body.includes(ANCHOR_NO_SECTION)) {
		body = body.replace(ANCHOR_NO_SECTION, PATCH_NO_SECTION);
		report.patches++;
	} else if (body.includes("function applyBankConfig")) {
		report.skipped.push("applyBankConfig no-section anchor");
	}
	if (body.includes(ANCHOR_TAIL)) {
		body = body.replace(ANCHOR_TAIL, PATCH_TAIL);
		report.patches++;
	if (body.includes(ANCHOR_DRAIN)) {
		body = body.replace(ANCHOR_DRAIN, PATCH_DRAIN);
		report.patches++;
	}
	if (body.includes(ANCHOR_ACTIVE)) {
		body = body.replace(ANCHOR_ACTIVE, PATCH_ACTIVE);
		report.patches++;
	}
	} else if (body.includes("function applyBankConfig")) {
		report.skipped.push("applyBankConfig tail anchor");
	}
	if (body.includes(ANCHOR_REFLECT)) {
		body = body.replace(ANCHOR_REFLECT, PATCH_REFLECT);
		report.patches++;
	} else if (!alreadyHelpers) {
		report.skipped.push("reflect anchor");
	}

	if (report.patches === 0) {
		report.status = "no anchors (skipped)";
		results.push(report);
		continue;
	}

	out += (alreadyHelpers ? "" : HELPERS) + body;

	const backup = path + BACKUP_SUFFIX;
	if (!existsSync(backup)) copyFileSync(path, backup);
	writeFileSync(path, out);

	const err = check(path);
	if (err) {
		copyFileSync(backup, path);
		report.status = `REVERTED (node --check failed): ${err}`;
	} else {
		report.status = "patched";
	}
	results.push(report);
}

for (const r of results) {
	const extra = r.skipped.length ? ` (skipped: ${r.skipped.join(", ")})` : "";
	console.log(`${r.patches ? "✔" : "·"} ${r.file}: ${r.status}${extra}`);
}
const bad = results.filter((r) => r.status.startsWith("REVERTED"));
console.log(`\n${results.filter((r) => r.status === "patched").length} patched, ${bad.length} reverted`);
if (bad.length) process.exit(1);
