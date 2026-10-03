#!/usr/bin/env node
/**
 * Convert pi-mcp-adapter MCP config files to pi's built-in MCP format, in place.
 *
 * Usage: pi-mcp-convert [dir] [--write] [--self-test]
 *
 * Walks `dir` (default: cwd, skipping node_modules and VCS dirs) for files named
 * `.mcp.json`, `mcp.json`, or`mcp-adapter.json` that hold adapter - format
  * entries(any adapter - only key: directTools, excludeTools, requestTimeoutMs,
 * bearerTokenEnv, socket, ...).Each match is rewritten IN PLACE: same path,
 * entries converted, unsupported entries dropped and reported.Files without
 * adapter keys(already pi - native) are left untouched.
 *
 * Dry - run(default ): prints what would change.
 * --write: backs up each match(suffix.bak) and rewrites it.
 * --self - test: run the built -in unit checks and exit.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";

// Adapter-only keys with no pi equivalent. Dropped, reported when present.
const DROPPED = new Set([
 "inheritEnv", "socket", "caFile", "requestHeadersCommand", "auth",
 "bearerTokenStore", "lifecycle", "idleTimeout", "exposeResources",
 "toolPrefix", "searchKeywords", "approveTools", "debug", "trace",
 "httpTransport", "pluginDataDir", "literalEnv", "protocolVersion", "tasks",
]);

// Keys that only adapter-format entries carry. "auth" is deliberately absent —
// pi's native format also has it, so it must not mark a file as adapter-format.
// A file whose servers use any of these keys is adapter-format and gets
// rewritten; files without them are already pi-native and are skipped.
const ADAPTER_KEYS = [
 "directTools", "excludeTools", "includeTools", "requestTimeoutMs", "disabled",
 "bearerTokenEnv", "bearerToken", "bearerTokenStore", "requestHeadersCommand",
 ...[...DROPPED].filter((k) => k !== "auth"),
];

const SKIP_DIRS = new Set(["node_modules", ".git", ".jj", ".hg", ".svn"]);
const FILE_NAMES = new Set([".mcp.json", "mcp.json", "mcp-adapter.json"]);

function convertServer(name, entry) {
 const warns = [];
 const out = {};
 let dropped = false;

 // Pi-native keys included so a repeat run over converted output is a no-op.
 for (const k of ["command", "args", "env", "cwd", "url", "headers", "exposure", "toolExposure", "timeout", "enabled"]) {
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
  for (const k of ["clientId", "clientSecret", "scope", "callbackPort", "callbackUrl"]) {
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

// -- directory walk -----------------------------------------------------------

function isAdapterEntry(entry) {
 return entry !== null && typeof entry === "object" && ADAPTER_KEYS.some((k) => entry[k] !== undefined);
}

function walkMcpFiles(rootDir) {
 const found = [];
 const visit = (dir) => {
  let entries;
  try {
   entries = readdirSync(dir, { withFileTypes: true });
  } catch {
   return;
  }
  for (const e of entries) {
   const p = join(dir, e.name);
   if (e.isDirectory()) {
    if (!SKIP_DIRS.has(e.name)) visit(p);
   } else if (e.isFile() && FILE_NAMES.has(e.name)) {
    found.push(p);
   }
  }
 };
 visit(rootDir);
 return found.sort();
}

function convertEntries(servers, label, report) {
 const out = {};
 const warns = [];
 for (const [name, entry] of Object.entries(servers)) {
  const r = convertServer(name, entry);
  if (r.error) {
   report.push(`DROP   ${label}: server "${name}" — ${r.error}`);
   continue;
  }
  for (const w of r.warns) warns.push(`WARN   ${label} ${name}: ${w}`);
  out[name] = r.value;
 }
 return { out, warns };
}

function convertFile(path, rootDir, write, report) {
 const label = relative(rootDir, path) || path;
 let parsed;
 try {
  parsed = JSON.parse(readFileSync(path, "utf8"));
 } catch (e) {
  report.push(`SKIP   ${label}: not valid JSON (${e.message})`);
  return false;
 }
 const servers = parsed?.mcpServers;
 if (!servers || typeof servers !== "object") return false;
 if (!Object.values(servers).some(isAdapterEntry)) return false; // already pi-native

 const { out, warns } = convertEntries(servers, label, report);
 const content = JSON.stringify({ ...parsed, mcpServers: out }, null, 2) + "\n";
 for (const w of warns) report.push(w);

 if (!write) {
  report.push(`WOULD REWRITE ${label}`);
  report.push(content);
  return true;
 }

 const bak = path + ".bak";
 if (!existsSync(bak)) copyFileSync(path, bak);
 writeFileSync(path, content);
 report.push(`WROTE  ${label} (backup: ${relative(rootDir, bak) || bak})`);
 return true;
}

// -- main ---------------------------------------------------------------------

function main() {
 const argv = process.argv.slice(2);
 if (argv.includes("--self-test")) return runSelfTest();
 const write = argv.includes("--write");
 const dir = argv.find((a) => !a.startsWith("-")) ?? ".";
 if (!existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error(`Not a directory: ${dir}`);
  return 1;
 }

 const report = [];
 const candidates = walkMcpFiles(dir);
 let changed = 0;
 for (const path of candidates) {
  if (convertFile(path, dir, write, report)) changed++;
 }

 for (const line of report) console.log(line);
 const skipped = candidates.length - changed;
 if (!candidates.length) {
  console.log(`No adapter-format mcp config files found under ${dir}.`);
  return 0;
 }
 console.log(
  `\n${changed} file(s) ${write ? "rewritten" : "would be rewritten"}, ${skipped} already pi-native (untouched).` +
  (write ? "" : " Use --write to apply."),
 );
 return 0;
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
 assertEq(t({ url: "u", exposure: "deferred", toolExposure: { z: "hidden" }, timeout: 5, enabled: false }).value,
  { url: "u", exposure: "deferred", toolExposure: { z: "hidden" }, timeout: 5, enabled: false },
  "pi-native entry survives conversion losslessly");
 assertEq(isAdapterEntry({ command: "x", directTools: true }), true, "adapter key detected");
 assertEq(isAdapterEntry({ url: "u", exposure: "deferred" }), false, "pi-native entry not matched as adapter");
 assertEq(isAdapterEntry({ url: "u", auth: { type: "none" } }), false, "auth alone is not an adapter marker (pi has auth too)");
 console.log("self-test: all checks passed");
 return 0;
}

process.exit(main());
