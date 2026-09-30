#!/usr/bin/env node
/**
 * Convert pi-mcp-adapter MCP config files to pi's built-in MCP format.
 *
 * Reads adapter config sources (adapter precedence, later wins):
 *   global:  ~/.config/mcp/mcp.json, ~/.agents/mcp.json, ~/.agents/mcp/mcp.json,
 *            ~/.pi/agent/mcp-adapter.json, then ~/.pi/agent/mcp.json (pi-global override)
 *   project: ./.mcp.json, ./.pi/mcp-adapter.json
 *
 * Dry-run (default): prints the converted result and what it would write.
 * --write: backs up each target (suffix .converter.bak) and writes the merged result to
 *          ~/.pi/agent/mcp.json and, when project sources exist, ./.pi/mcp.json.
 *          Source files are left untouched (they may be shared with other hosts).
 * --self-test: run the built-in unit checks and exit.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

// Adapter-only keys with no pi equivalent. Dropped, reported when present.
const DROPPED = new Set([
  "inheritEnv", "socket", "caFile", "requestHeadersCommand", "auth",
  "bearerTokenStore", "lifecycle", "idleTimeout", "exposeResources",
  "toolPrefix", "searchKeywords", "approveTools", "debug", "trace",
  "httpTransport", "pluginDataDir", "literalEnv", "protocolVersion", "tasks",
]);

function convertServer(name, entry) {
  const warns = [];
  const out = {};
  let dropped = false;

  for (const k of ["command", "args", "env", "cwd", "url", "headers"]) {
    if (entry[k] !== undefined) out[k] = entry[k];
  }

  // Authentication
  if (entry.auth === false) {
    warns.push('auth:false: pi cannot disable OAuth discovery; set an "Authorization" header if the server rejects OAuth');
  }
  if (entry.bearerTokenEnv) {
    out.headers = { ...(out.headers ?? {}), Authorization: `Bearer \${${entry.bearerTokenEnv}}` };
  }
  if (entry.bearerToken !== undefined) {
    out.headers = { ...(out.headers ?? {}), Authorization: `Bearer ${entry.bearerToken}` };
    warns.push("bearerToken literal written into headers — move it to an env var and reference ${VAR} instead");
  }
  if (entry.bearerTokenStore) {
    warns.push("bearerTokenStore: pi has no OS credential store; use bearerTokenEnv or a ${VAR} reference");
  }
  if (entry.requestHeadersCommand) {
    warns.push('requestHeadersCommand: unsupported; use header values like "!gh auth token" (a command that prints the full header value)');
  }
  if (entry.caFile) warns.push("caFile: unsupported; pi uses system TLS roots");

  if (entry.oauth !== undefined && entry.oauth !== false) {
    const o = (out.oauth = {});
    for (const k of ["clientId", "clientSecret", "scope", "callbackPort"]) {
      if (entry.oauth[k] !== undefined) o[k] = entry.oauth[k];
    }
    const r = entry.oauth.redirectUri;
    if (r !== undefined) {
      if (isLoopbackHttp(r)) {
        o.callbackUrl = r;
      } else {
        warns.push(`oauth.redirectUri "${r}": pi needs a loopback http:// callbackUrl (or omit it and set callbackPort); dropped`);
      }
    }
    for (const k of ["grantType", "clientMetadataUrl", "authorizationParams", "clientName", "clientUri", "logoUri", "authServerMetadataUrl", "skipIssuerMetadataValidation"]) {
      if (entry.oauth[k] !== undefined) warns.push(`oauth.${k}: no pi equivalent, dropped`);
    }
    if (Object.keys(o).length === 0) delete out.oauth;
  } else if (entry.oauth === false) {
    warns.push("oauth:false: pi connects OAuth servers automatically when there is no Authorization header; cannot disable");
  }

  // Tool exposure
  const dt = entry.directTools;
  if (dt === true) out.exposure = "direct";
  else if (dt === "search") out.exposure = "deferred";
  else if (Array.isArray(dt)) {
    out.toolExposure = { ...(out.toolExposure ?? {}) };
    for (const t of dt) out.toolExposure[t] = "direct";
    warns.push(`directTools list (${dt.length} tools) mapped to toolExposure entries`);
  }

  // Include/exclude → toolExposure
  if (entry.excludeTools?.length) {
    out.toolExposure = { ...(out.toolExposure ?? {}) };
    for (const t of entry.excludeTools) out.toolExposure[t] = "hidden";
  }
  if (entry.includeTools?.length) {
    warns.push(`includeTools (${entry.includeTools.join(", ")}): no allowlist equivalent — excluded tools become hidden and the rest keep the server exposure; review toolExposure`);
  }

  // Timeouts, enable/disable
  if (entry.requestTimeoutMs > 0) out.timeout = Math.max(1, Math.round(entry.requestTimeoutMs / 1000));
  if (entry.disabled === true) out.enabled = false;

  // Unmappable behavior
  if (["lazy", "lazy-keep-alive"].includes(entry.lifecycle)) {
    warns.push(`lifecycle:"${entry.lifecycle}": pi connects every server at session start (eager)`);
  }
  if (entry.socket) {
    dropped = true;
    warns.push('socket transport unsupported; entry needs "command" (stdio) or "url" (http) → dropped');
  }
  if (entry.httpTransport === "sse") {
    dropped = true;
    warns.push('httpTransport:"sse": pi only supports streamable HTTP (if the server also serves /mcp, point url there) → dropped');
  }
  if (entry.toolPrefix && entry.toolPrefix !== "server") {
    warns.push(`toolPrefix:"${entry.toolPrefix}": pi always names tools mcp__<server>__<tool>`);
  }
  if (entry.exposeResources === false) {
    warns.push('exposeResources:false: pi adds resource tools automatically; use exposure:"hidden" to silence the whole server');
  }
  if (entry.approveTools) {
    warns.push("approveTools: pi has no per-tool approval in mcp.json; write a small permission extension using tool annotations");
  }

  if (dropped) return { name, error: warns.slice(-1)[0] ?? "unsupported entry" };
  return { name, value: out, warns };
}

function isLoopbackHttp(uri) {
  try {
    const u = new URL(uri);
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      && u.search === "" && u.hash === "" && !u.pathname.includes("{port}");
  } catch { return false; }
}

// -- config file reading ------------------------------------------------------

function loadSource(label, path, report) {
  if (!existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    report.push(`ERROR  ${label} ${path}: not valid JSON (${e.message}) — skipped`);
    return null;
  }
  const servers = parsed?.mcpServers;
  if (!servers || typeof servers !== "object") {
    report.push(`NOTE   ${label} ${path}: no mcpServers object — skipped`);
    return null;
  }
  const extra = Object.keys(parsed).filter((k) => k !== "mcpServers" && k !== "autoEnableCodemode");
  if (extra.length) {
    report.push(`NOTE   ${label} ${path}: adapter keys ${extra.join(", ")} not carried over`);
  }
  return { label, path, servers };
}

function convertConfig(sources, report) {
  const out = {};
  const warns = {};
  for (const src of sources) {
    for (const [name, entry] of Object.entries(src.servers)) {
      const r = convertServer(name, entry);
      if (r.error) {
        report.push(`ERROR  ${src.label} ${src.path}: server "${name}" dropped — ${r.error}`);
        continue;
      }
      if (r.warns.length) warns[name] = [...new Set([...(warns[name] ?? []), ...r.warns])];
      out[name] = r.value;
    }
  }
  return { out, warns };
}

// -- main ---------------------------------------------------------------------

function candidateSources() {
  const a = (p) => join(AGENT_DIR, p);
  return {
    global: [
      ["shared-global ~/.config", join(homedir(), ".config", "mcp", "mcp.json")],
      ["agents-global", join(homedir(), ".agents", "mcp.json")],
      ["agents-nested-global", join(homedir(), ".agents", "mcp", "mcp.json")],
      ["adapter-global", a("mcp-adapter.json")],
      ["pi-global (target)", a("mcp.json")],
    ],
    project: [
      ["project .mcp.json", ".mcp.json"],
      ["project .pi", ".pi/mcp-adapter.json"],
    ],
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) return runSelfTest();
  const write = argv.includes("--write");

  const report = [];
  const c = candidateSources();
  const gFound = c.global.map(([label, path]) => loadSource(label, path, report)).filter(Boolean);
  const pFound = c.project.map(([label, path]) => loadSource(label, path, report)).filter(Boolean);

  if (!gFound.length && !pFound.length) {
    console.error("No adapter or pi mcp.json files found — nothing to convert.");
    return 1;
  }

  const g = convertConfig(gFound, report);
  const p = convertConfig(pFound, report);

  for (const line of report) console.log(line);
  for (const [name, ws] of Object.entries({ ...g.warns, ...p.warns })) {
    for (const w of ws) console.log(`WARN   ${name}: ${w}`);
  }
  if (report.some((l) => l.startsWith("ERROR  "))) {
    console.log("\nDropped servers mean pi would otherwise reject/skip the entry — fix or accept the loss, then re-run.");
  }

  const json = (o) => JSON.stringify(o, null, 2) + "\n";
  const targets = [];
  if (Object.keys(g.out).length) targets.push([join(AGENT_DIR, "mcp.json"), json({ mcpServers: g.out }), "global"]);
  if (Object.keys(p.out).length) targets.push([join(".pi", "mcp.json"), json({ mcpServers: p.out }), "project"]);

  if (!write) {
    for (const [path, content, scope] of targets) {
      console.log(`\n--- dry run: would write ${scope} ${path} (use --write) ---`);
      console.log(content);
    }
    return 0;
  }

  let failed = false;
  for (const [path, content, scope] of targets) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      if (existsSync(path)) {
        const bak = path + ".converter.bak";
        if (!existsSync(bak)) copyFileSync(path, bak);
        else console.log(`NOTE   backup ${bak} already exists, not overwritten`);
      }
      writeFileSync(path, content);
      console.log(`WROTE  ${scope} ${path}`);
    } catch (e) {
      console.error(`FAILED writing ${path}: ${e.message}`);
      failed = true;
    }
  }
  console.log(`
Next: review the file, run \`pi mcp list\` to verify, then \`pi remove npm:pi-mcp-adapter\`.
Source files were left untouched — delete them or ignore; pi never reads the adapter paths.`);
  return failed ? 1 : 0;
}

// -- self test ----------------------------------------------------------------

function assertEq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function runSelfTest() {
  const t = (e) => convertServer("t", e);
  assertEq(t({ command: "x", directTools: true }).value.exposure, "direct", "directTools true → direct");
  assertEq(t({ command: "x", directTools: "search" }).value.exposure, "deferred", "directTools search → deferred");
  assertEq(t({ url: "u", directTools: ["a", "b"] }).value.toolExposure, { a: "direct", b: "direct" }, "directTools array → toolExposure");
  assertEq(t({ command: "x", disabled: true }).value.enabled, false, "disabled → enabled:false");
  assertEq(t({ url: "u", bearerTokenEnv: "TOK" }).value.headers, { Authorization: "Bearer ${TOK}" }, "bearerTokenEnv → header");
  assertEq(t({ url: "u", requestTimeoutMs: 90000 }).value.timeout, 90, "requestTimeoutMs → timeout seconds");
  assertEq(t({ url: "u", oauth: { clientId: "c", redirectUri: "http://127.0.0.1:8765/callback" } }).value.oauth,
    { clientId: "c", callbackUrl: "http://127.0.0.1:8765/callback" }, "oauth client + loopback redirectUri kept");
  assertEq(t({ url: "u", oauth: { clientId: "c", redirectUri: "http://127.0.0.1:{port}/cb" } }).value.oauth,
    { clientId: "c" }, "oauth {port} placeholder redirectUri dropped");
  assertEq(t({ command: "x", excludeTools: ["z"] }).value.toolExposure, { z: "hidden" }, "excludeTools → hidden");
  assertEq(t({ socket: "/tmp/x.sock" }).error !== undefined, true, "socket-only entry → error");
  assertEq(t({ url: "u", httpTransport: "sse" }).error !== undefined, true, "sse → error");
  assertEq(t({ command: "x", args: ["y"], env: { A: "1" }, debug: true }).value,
    { command: "x", args: ["y"], env: { A: "1" } }, "core fields kept, debug dropped");
  console.log("self-test: all checks passed");
  return 0;
}

process.exit(main());