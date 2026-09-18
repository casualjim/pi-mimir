# pi-headroom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@casualjim/pi-headroom` — a pi-mimir port of the noheadroom Pi bridge that keeps its tool-result compression behavior and fixes the CCR retrieval gap with a real `headroom_retrieve` tool.

**Architecture:** Pi extension hooks the `context` event, sends the outgoing wire payload to a configured Headroom proxy (`POST /v1/compress`), and applies back compressed text to `toolResult` messages only (roles/tool ids/tool-call names preserved). Tool calls are renamed to `pi_tool_result` in the compression payload so Headroom's `DEFAULT_EXCLUDE_TOOLS` does not skip `read`/`grep` results. Headroom CCR markers keep their hash and name a new `headroom_retrieve` tool (TypeBox schema) that fetches `GET /v1/retrieve/<hash>` and returns `original_content`. The proxy is never spawned or managed; unset/unreachable proxy degrades to a no-op with a one-time warning.

**Tech Stack:** TypeScript (NodeNext, ESM), pnpm workspace, vitest, typebox, Pi extension API (`@earendil-works/pi-coding-agent` 0.85.1, `@earendil-works/pi-tui`).

**Spec:** `SPEC.md` (§G, §C, §I, §V40–V45, §T T54–T61). Source lineage: `~/github/raquezha/nothing/packages/noheadroom/extensions/` (MIT, fork of `@ryan_nookpi/pi-extension-headroom` by Jonghakseo). Correctness reference: `~/github/casualjim/dsh-plugins/dsh-headroom/src/` (working retrieve behavior).

## Global Constraints

- pnpm workspace package under `packages/*`; ESM; tests vitest; typecheck `tsc --noEmit`.
- Pi install surface is `package.json` → `pi.extensions` only; no skills/prompts.
- Compression mutates `toolResult` content only; user/assistant text, tool-call ids/names stay unchanged in the Pi session (V40).
- Markers keep hash + name `headroom_retrieve`; `<<ccr:...>>` machine markers byte-intact (V41).
- `headroom_retrieve` accepts `[a-f0-9]{12,24}`; prefers `original_content`; 404 → TTL hint; never throws (V42).
- No proxy process management (V43); `~/.pi/agent/headroom/settings.json` path preserved (V44).
- Loop guards stay: reentrancy, 3 s throttle, input/output/candidate fingerprints, 512-hash FIFO (V45).
- **Repo commit rule:** commit only when the user explicitly asks. In this plan, treat every "Commit" step as deferred — run it only on that explicit request, and stage only the paths named in the task (the working tree has unrelated pre-existing modifications).
- Attribution: README + LICENSE must carry the noheadroom/Jonghakseo fork lineage.

---

### Task 1: Scaffold `packages/pi-headroom` and port sources

**Files:**
- Create: `packages/pi-headroom/package.json`, `packages/pi-headroom/tsconfig.json`, `packages/pi-headroom/vitest.config.ts`, `packages/pi-headroom/README.md`, `packages/pi-headroom/LICENSE`
- Create (copied): `packages/pi-headroom/extensions/headroom.ts` (from `index.ts`), `extensions/bridge.ts`, `extensions/client.ts`, `extensions/config.ts`, `extensions/types.ts`

**Interfaces:**
- Produces: package `@casualjim/pi-headroom` with `pi.extensions: ["./extensions/headroom.ts"]`; extension default export `headroomExtension(pi: ExtensionAPI)`.

- [x] **Step 1: Copy sources and rename the entry**

```bash
cd /home/ivan/github/casualjim/pi-mimir
mkdir -p packages/pi-headroom/extensions packages/pi-headroom/tests
SRC=~/github/raquezha/nothing/packages/noheadroom
cp "$SRC"/extensions/{bridge.ts,client.ts,config.ts,types.ts} packages/pi-headroom/extensions/
cp "$SRC"/extensions/index.ts packages/pi-headroom/extensions/headroom.ts
cp "$SRC"/LICENSE packages/pi-headroom/LICENSE
```

Do **not** copy `proxy-manager.ts` (V43 removes process management).

- [x] **Step 2: Write `packages/pi-headroom/package.json`**

```json
{
  "name": "@casualjim/pi-headroom",
  "version": "0.1.0",
  "description": "Headroom context compression for pi with a working headroom_retrieve tool",
  "keywords": ["pi-package", "headroom", "context-compression"],
  "license": "MIT",
  "author": "casualjim",
  "repository": {
    "type": "git",
    "url": "https://github.com/casualjim/pi-mimir"
  },
  "type": "module",
  "files": ["extensions/", "README.md", "LICENSE"],
  "engines": { "node": ">=22.0.0" },
  "publishConfig": { "access": "public" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "check:pack": "pnpm pack --dry-run",
    "test": "vitest run"
  },
  "pi": {
    "extensions": ["./extensions/headroom.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  },
  "devDependencies": {
    "@earendil-works/pi-ai": "^0.85.1",
    "@earendil-works/pi-coding-agent": "^0.85.1",
    "@earendil-works/pi-tui": "^0.85.1",
    "@types/node": "^24.13.4",
    "typebox": "^1.3.30",
    "typescript": "^7.0.2",
    "vitest": "^5.0.0"
  }
}
```

- [x] **Step 3: Write `tsconfig.json` and `vitest.config.ts` (verbatim from `packages/pi-caveman`)**

`packages/pi-headroom/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node", "vitest"]
  },
  "include": ["extensions/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

`packages/pi-headroom/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [x] **Step 4: Write `README.md`**

```markdown
# @casualjim/pi-headroom

Headroom context compression for pi. Compresses oversized tool results through a
local [Headroom](https://github.com/headroomlabs-ai/headroom) proxy and exposes a
`headroom_retrieve` tool so compressed originals stay recoverable.

Fork lineage: `@raquezha/noheadroom` → `@ryan_nookpi/pi-extension-headroom`
(Jonghakseo), MIT.

## Install

```bash
pi install /path/to/pi-mimir/packages/pi-headroom
```

Run a Headroom proxy yourself (never spawned by this package):

```bash
headroom proxy --port 8788
```

Settings live in `~/.pi/agent/headroom/settings.json`
(`baseUrl`, `enabled`, `mode`, `minContextTokens`, `minMessageChars`,
`timeoutMs`, `allowRemote`, `renameToolCalls`).

## Retrieve

Compressed results carry a hash marker, e.g.
`[400 items compressed to 10. Retrieve more: hash=abc…]` or `<<ccr:abc…>>`.
Call `headroom_retrieve(hash="abc…")` to get the full original from the
proxy's CCR store (TTL 1800 s).

`/headroom status|on|off|health|stats|mode <normal|quiet|silent>`
```

- [x] **Step 5: Install and typecheck**

Run: `pnpm install && pnpm -C packages/pi-headroom typecheck`
Expected: PASS — copied sources compile against the declared dev dependencies.

- [x] **Step 6: Commit (deferred — only when user asks)**

```bash
git add packages/pi-headroom/package.json packages/pi-headroom/tsconfig.json packages/pi-headroom/vitest.config.ts packages/pi-headroom/README.md packages/pi-headroom/LICENSE packages/pi-headroom/extensions pnpm-lock.yaml
git commit -m "feat(pi-headroom): scaffold package from noheadroom sources"
```

---

### Task 2: `headroom_retrieve` HTTP client

**Files:**
- Modify: `packages/pi-headroom/extensions/client.ts`
- Test: `packages/pi-headroom/tests/client.test.ts`

**Interfaces:**
- Produces: `HeadroomHttpClient.retrieve(hash: string, signal?: AbortSignal): Promise<RetrieveResult>` where `RetrieveResult = { ok: true; content: string } | { ok: false; status?: number; error: string }`; exported type `RetrieveResult`.

- [x] **Step 1: Write the failing test**

`packages/pi-headroom/tests/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeadroomHttpClient } from '../extensions/client.js';

function client() {
  return new HeadroomHttpClient({ baseUrl: 'http://127.0.0.1:8788/', timeoutMs: 1000 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HeadroomHttpClient.retrieve', () => {
  it('prefers original_content from the proxy envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      hash: 'abc123abc123',
      original_content: 'the full original',
      original_tokens: 42,
    }), { status: 200 })));

    const result = await client().retrieve('abc123abc123');
    expect(result).toEqual({ ok: true, content: 'the full original' });
  });

  it('accepts a bare string body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify('bare original'), { status: 200 })));
    const result = await client().retrieve('abc123abc123');
    expect(result).toEqual({ ok: true, content: 'bare original' });
  });

  it('maps 404 to an expiry hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":"Entry not found (CCR TTL: 1800 seconds)"}', { status: 404 })));
    const result = await client().retrieve('abc123abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toContain('TTL');
    }
  });

  it('returns an error result on network failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));
    const result = await client().retrieve('abc123abc123');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ECONNREFUSED');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/pi-headroom test -- tests/client.test.ts`
Expected: FAIL — `client().retrieve is not a function`.

- [x] **Step 3: Add the method to `extensions/client.ts`**

Add below the existing `compress` method inside class `HeadroomHttpClient`:

```ts
	async retrieve(hash: string, signal?: AbortSignal): Promise<RetrieveResult> {
		try {
			const response = await fetch(`${this.baseUrl}/v1/retrieve/${hash}`, {
				signal: buildSignal(this.timeoutMs, signal),
			});
			if (!response.ok) {
				const detail = await response.text().catch(() => "");
				return {
					ok: false,
					status: response.status,
					error:
						response.status === 404
							? "Entry not found in Headroom's CCR store (TTL 1800s) — the compressed content expired."
							: `Headroom /v1/retrieve failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
				};
			}
			const body = (await response.json()) as unknown;
			if (typeof body === "string") return { ok: true, content: body };
			if (
				body !== null &&
				typeof body === "object" &&
				typeof (body as { original_content?: unknown }).original_content === "string"
			) {
				return { ok: true, content: (body as { original_content: string }).original_content };
			}
			return { ok: true, content: JSON.stringify(body, null, 2) };
		} catch (error) {
			return {
				ok: false,
				error: `Headroom /v1/retrieve failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
```

Add above the class:

```ts
export type RetrieveResult = { ok: true; content: string } | { ok: false; status?: number; error: string };
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm -C packages/pi-headroom test -- tests/client.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Commit (deferred)**

```bash
git add packages/pi-headroom/extensions/client.ts packages/pi-headroom/tests/client.test.ts
git commit -m "feat(pi-headroom): add /v1/retrieve client method"
```

---

### Task 3: Marker naturalization, awareness hint, rename knob

**Files:**
- Modify: `packages/pi-headroom/extensions/bridge.ts`
- Test: `packages/pi-headroom/tests/bridge.test.ts`

**Interfaces:**
- Produces (exported from `bridge.ts`): `naturalizeHeadroomMarkers(text: string): string`; `buildCompressionPayload(messages: AgentMessage[], minMessageChars: number, options?: { renameToolCalls?: boolean }): CompressionPayload`.
- Consumes: `injectCompressionAwareness(messages)` (already exported), `applyCompressionResult(...)` (already exported).

- [x] **Step 1: Write the failing test**

`packages/pi-headroom/tests/bridge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ContextEvent } from '@earendil-works/pi-coding-agent';
import {
  buildCompressionPayload,
  injectCompressionAwareness,
  naturalizeHeadroomMarkers,
} from '../extensions/bridge.js';

type AgentMessage = ContextEvent['messages'][number];

function payloadMessages(messages: AgentMessage[]): ReturnType<typeof buildCompressionPayload> {
  return buildCompressionPayload(messages, 2000);
}

const readTurn = [
  { role: 'user', content: [{ type: 'text', text: 'read the file' }] },
  {
    role: 'assistant',
    content: [
      { type: 'text', text: '' },
      { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'x.ts' } },
    ],
  },
  {
    role: 'toolResult',
    toolCallId: 'call_1',
    toolName: 'read',
    content: [{ type: 'text', text: 'x'.repeat(3000) }],
  },
] as unknown as AgentMessage[];

describe('naturalizeHeadroomMarkers', () => {
  it('keeps the hash and names headroom_retrieve for legacy markers', () => {
    const out = naturalizeHeadroomMarkers(
      '[400 items compressed to 10. Retrieve more: hash=2b1f97138886d3c56c3e28de]',
    );
    expect(out).toContain('headroom_retrieve');
    expect(out).toContain('hash=2b1f97138886d3c56c3e28de');
    expect(out).not.toContain('offset');
  });

  it('rewrites Retrieve original markers (read lifecycle)', () => {
    const out = naturalizeHeadroomMarkers(
      '[Read content stale: Retrieve original: hash=abcdef123456]',
    );
    expect(out).toContain('headroom_retrieve');
    expect(out).toContain('hash=abcdef123456');
  });

  it('leaves <<ccr:...>> machine markers byte-intact', () => {
    const json = '{"_ccr_dropped":"<<ccr:abc123abc123 3900_rows_offloaded>>"}';
    expect(naturalizeHeadroomMarkers(json)).toBe(json);
  });
});

describe('injectCompressionAwareness', () => {
  it('injects a hint naming the retrieve tool once', () => {
    const once = injectCompressionAwareness([] as unknown as AgentMessage[]);
    const twice = injectCompressionAwareness(once);
    expect(once[0]).toMatchObject({ role: 'system' });
    expect(String((once[0] as { content: string }).content)).toContain('headroom_retrieve');
    expect(twice.length).toBe(once.length);
  });
});

describe('buildCompressionPayload rename knob', () => {
  it('renames tool calls to pi_tool_result by default', () => {
    const payload = payloadMessages(readTurn);
    const assistant = payload.messages.find((m) => m.role === 'assistant');
    expect(assistant && 'tool_calls' in assistant ? assistant.tool_calls?.[0]?.function.name : undefined)
      .toBe('pi_tool_result');
    expect(payload.candidateCount).toBe(1);
  });

  it('keeps original tool names when renameToolCalls is false', () => {
    const payload = buildCompressionPayload(readTurn, 2000, { renameToolCalls: false });
    const assistant = payload.messages.find((m) => m.role === 'assistant');
    expect(assistant && 'tool_calls' in assistant ? assistant.tool_calls?.[0]?.function.name : undefined)
      .toBe('read');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/pi-headroom test -- tests/bridge.test.ts`
Expected: FAIL — `naturalizeHeadroomMarkers` is not exported / rename option ignored.

- [x] **Step 3: Replace `naturalizeHeadroomMarkers` in `extensions/bridge.ts`**

Replace the whole existing function (the one whose body returns the `'read' tool with 'offset' and 'limit'` hint) with:

```ts
export function naturalizeHeadroomMarkers(text: string): string {
	// Headroom's bracket markers carry the CCR hash. Keep the hash and name the
	// Pi tool that redeems it; `<<ccr:...>>` machine markers stay byte-intact
	// (they sit inside JSON payloads and must not be rewritten).
	return text
		.replace(
			/\[(.*?(?:compressed|omitted).*?)\.?\s*Retrieve (?:more|original): hash=([a-f0-9]{12,24})\]/gi,
			"[$1. Retrieve the full original with the `headroom_retrieve` tool using hash=$2.]",
		)
		.replace(
			/Retrieve original: hash=([a-f0-9]{12,24})/gi,
			"Retrieve the full original with the `headroom_retrieve` tool using hash=$1",
		);
}
```

- [x] **Step 4: Replace the hint text in `injectCompressionAwareness`**

Replace the `const hintText = ...` string with:

```ts
	const hintText = "Environment Hint: Some tool results in this context have been automatically compressed by Headroom to optimize tokens. When a compressed result shows a marker with a hash — e.g. `[N items compressed to M. Retrieve more: hash=abc123]`, `Retrieve original: hash=abc123`, or a `<<ccr:abc123 ...>>` machine marker — call the `headroom_retrieve` tool with that exact hash to get the full original content back. Do NOT re-read whole files or guess at compressed content.";
```

Keep the existing dedupe guard (only injects once, appends to a leading system message or unshifts a system message).

- [x] **Step 5: Thread `renameToolCalls` through `buildCompressionPayload`**

Change the signature and pass the option to the tool-call conversion:

```ts
export function buildCompressionPayload(
	messages: AgentMessage[],
	minMessageChars: number,
	options: { renameToolCalls?: boolean } = {},
): CompressionPayload {
```

Then, where the assistant message is converted (the call that produces `tool_calls`), replace the direct `convertToolCall(toolCall)` usage with `convertToolCall(toolCall, options.renameToolCalls !== false)` and update `convertToolCall`:

```ts
function convertToolCall(toolCall: ToolCall, renameToolCalls: boolean): OpenAIToolCall {
	return {
		id: toolCall.id,
		type: "function",
		function: {
			// Headroom protects exact tool names (read, grep, ...) in its
			// DEFAULT_EXCLUDE_TOOLS; a neutral name keeps large reads compressible.
			name: renameToolCalls ? "pi_tool_result" : toolCall.name,
			arguments: renameToolCalls
				? JSON.stringify({ originalToolName: toolCall.name })
				: JSON.stringify(toolCall.arguments ?? {}),
		},
	};
}
```

- [x] **Step 6: Run test to verify it passes**

Run: `pnpm -C packages/pi-headroom test -- tests/bridge.test.ts`
Expected: PASS (6 tests).

- [x] **Step 7: Commit (deferred)**

```bash
git add packages/pi-headroom/extensions/bridge.ts packages/pi-headroom/tests/bridge.test.ts
git commit -m "feat(pi-headroom): redeemable CCR markers + rename knob"
```

---

### Task 4: Register the retrieve tool, drop proxy management

**Files:**
- Modify: `packages/pi-headroom/extensions/headroom.ts`
- Modify: `packages/pi-headroom/extensions/types.ts` (remove `proxyStarting`, `proxyStartAttempted`, `autoStart`, `command`)
- Test: `packages/pi-headroom/tests/extension.test.ts`

**Interfaces:**
- Consumes: `HeadroomHttpClient.retrieve` (Task 2); `buildCompressionPayload` options (Task 3).
- Produces: registered tool `headroom_retrieve`; extension no longer imports `./proxy-manager.js`.

- [x] **Step 1: Write the failing test**

`packages/pi-headroom/tests/extension.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import headroomExtension from '../extensions/headroom.js';

interface Captured {
  tools: Array<{ name: string; execute: (...args: unknown[]) => Promise<unknown> }>;
  commands: string[];
}

function stubPi(): { pi: ExtensionAPI; captured: Captured } {
  const captured: Captured = { tools: [], commands: [] };
  const pi = {
    on: vi.fn(),
    registerCommand: (name: string) => { captured.commands.push(name); },
    registerTool: (def: Captured['tools'][number]) => { captured.tools.push(def); },
  } as unknown as ExtensionAPI;
  return { pi, captured };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('headroom extension', () => {
  it('registers headroom_retrieve plus the /headroom commands', () => {
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    expect(captured.tools.map((t) => t.name)).toEqual(['headroom_retrieve']);
    expect(captured.commands).toContain('headroom');
  });

  it('rejects malformed hashes without calling the proxy', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { pi, captured } = stubPi();
    headroomExtension(pi);
    const result = await captured.tools[0].execute('call_1', { hash: 'nope' }, undefined, undefined, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain('Invalid hash');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/pi-headroom test -- tests/extension.test.ts`
Expected: FAIL — `captured.tools` is empty.

- [x] **Step 3: Add the tool registration and remove proxy management in `extensions/headroom.ts`**

1. Imports: delete `import { startPersistentHeadroomProxy } from "./proxy-manager.js";` and add:

```ts
import { Type } from "typebox";
```

2. After the `pi.registerCommand("headroom-health", ...)` block, register the tool:

```ts
	pi.registerTool({
		name: "headroom_retrieve",
		label: "Headroom Retrieve",
		description:
			"Retrieve the full original content that Headroom compressed. Use the exact hash from a compression marker " +
			"(e.g. `Retrieve more: hash=...`, `Retrieve original: hash=...`) or from a `<<ccr:hash ...>>` machine marker in a tool result.",
		parameters: Type.Object({
			hash: Type.String({ description: "The exact hash from the compression marker (12-24 hex characters)" }),
		}),
		async execute(_toolCallId, params, signal) {
			const hash = String((params as { hash?: unknown }).hash ?? "").trim().toLowerCase();
			if (!/^[a-f0-9]{12,24}$/.test(hash)) {
				return {
					content: [{ type: "text" as const, text: JSON.stringify({ error: "Invalid hash format. Expected 12-24 hex characters." }) }],
					details: { hash },
				};
			}
			const result = await runtime.client.retrieve(hash, signal);
			return {
				content: [{ type: "text" as const, text: result.ok ? result.content : JSON.stringify({ error: result.error, hash }) }],
				details: { hash, ok: result.ok },
			};
		},
	});
```

3. Delete `ensureProxy`/`ensureProxyInBackground`-style auto-start logic: remove the `proxyStarting`/`proxyStartAttempted` state fields and the `ensureProxy` runtime member; `session_start` keeps `runtime.refreshStatus(ctx)` + `void runtime.updateHealth(ctx)` (health probe only). `updateHealthState` stays as-is (health → probe).

4. In the runtime type/state interfaces, drop `proxyStarting`, `proxyStartAttempted`, and the `ensureProxy` member.

5. Remove `proxyStartAttempted`/`proxyStarting` writes in `waitForProxyHealth`; if `waitForProxyHealth` becomes unused, delete it.

6. Thread the config into the payload build: `buildCompressionPayload(event.messages, runtime.config.minMessageChars, { renameToolCalls: runtime.config.renameToolCalls })`.

7. In `extensions/types.ts`, remove `autoStart` and `command` from `HeadroomConfig`, and `proxyStarting`/`proxyStartAttempted` from the runtime state type.

- [x] **Step 4: Run tests + typecheck**

Run: `pnpm -C packages/pi-headroom test && pnpm -C packages/pi-headroom typecheck`
Expected: PASS — extension test green; no reference to `proxy-manager` remains (`grep -r proxy-manager packages/pi-headroom/extensions` is empty).

- [x] **Step 5: Commit (deferred)**

```bash
git add packages/pi-headroom/extensions/headroom.ts packages/pi-headroom/extensions/types.ts packages/pi-headroom/tests/extension.test.ts
git commit -m "feat(pi-headroom): register headroom_retrieve, drop proxy management"
```

---

### Task 5: Config surface (`renameToolCalls`, no autoStart)

**Files:**
- Modify: `packages/pi-headroom/extensions/config.ts`
- Test: `packages/pi-headroom/tests/config.test.ts`

**Interfaces:**
- Produces: `loadHeadroomConfig(env, settings)` returns `{ enabled, baseUrl, allowRemote, mode, minContextTokens, minMessageChars, timeoutMs, renameToolCalls }`.

- [x] **Step 1: Write the failing test**

`packages/pi-headroom/tests/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isRemoteBlocked, loadHeadroomConfig } from '../extensions/config.js';

describe('loadHeadroomConfig', () => {
  it('defaults renameToolCalls to true and drops autoStart/command', () => {
    const config = loadHeadroomConfig({} as NodeJS.ProcessEnv, {});
    expect(config.renameToolCalls).toBe(true);
    expect('autoStart' in config).toBe(false);
    expect('command' in config).toBe(false);
    expect(config.baseUrl).toBe('http://127.0.0.1:8788');
  });

  it('settings beat env, env beats defaults', () => {
    const env = { PI_HEADROOM_URL: 'http://127.0.0.1:9999', PI_HEADROOM_RENAME_TOOL_CALLS: '0' } as NodeJS.ProcessEnv;
    const fromEnv = loadHeadroomConfig(env, {});
    expect(fromEnv.baseUrl).toBe('http://127.0.0.1:9999');
    expect(fromEnv.renameToolCalls).toBe(false);

    const fromSettings = loadHeadroomConfig(env, { baseUrl: 'http://127.0.0.1:8777/', renameToolCalls: true });
    expect(fromSettings.baseUrl).toBe('http://127.0.0.1:8777');
    expect(fromSettings.renameToolCalls).toBe(true);
  });

  it('blocks remote URLs unless allowRemote', () => {
    expect(isRemoteBlocked({ baseUrl: 'https://example.com', allowRemote: false })).toBe(true);
    expect(isRemoteBlocked({ baseUrl: 'http://127.0.0.1:8788', allowRemote: false })).toBe(false);
    expect(isRemoteBlocked({ baseUrl: 'https://example.com', allowRemote: true })).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/pi-headroom test -- tests/config.test.ts`
Expected: FAIL — `renameToolCalls` undefined / `autoStart` still present.

- [x] **Step 3: Update `extensions/config.ts`**

1. `HeadroomSettings`: delete `autoStart` and `command`; add `renameToolCalls?: boolean | string;`.
2. `loadHeadroomConfig` return object: delete the `autoStart:` and `command:` lines; add:

```ts
		renameToolCalls: parseBoolean(
			settings.renameToolCalls,
			parseBoolean(env.PI_HEADROOM_RENAME_TOOL_CALLS, true),
		),
```

3. Keep `DEFAULT_BASE_URL = "http://127.0.0.1:8788"`, the settings path constants, `isRemoteBlocked`, and all parse helpers unchanged.

- [x] **Step 4: Run tests + typecheck**

Run: `pnpm -C packages/pi-headroom test && pnpm -C packages/pi-headroom typecheck`
Expected: PASS (all suites).

- [x] **Step 5: Commit (deferred)**

```bash
git add packages/pi-headroom/extensions/config.ts packages/pi-headroom/tests/config.test.ts
git commit -m "feat(pi-headroom): config surface without proxy autostart"
```

---

### Task 6: Live end-to-end verification and plugin swap

**Files:**
- Modify: `~/.pi/agent/settings.json` (user config, outside repo)
- Delete: `~/.pi/agent/headroom/settings.json` untouched (path preserved, V44)

**Interfaces:**
- Consumes: everything above; running Headroom proxy at `http://127.0.0.1:8788`.

- [x] **Step 1: Live proxy round trip (proves client + marker + retrieval against the real proxy)**

```bash
node -e '
const line = (i) => `2026-09-18T10:${String(i % 60).padStart(2,"0")}:00Z INFO worker-${i % 8} batch ${i} status=${i % 11 ? "ok" : "retry"}`;
const log = Array.from({ length: 8000 }, (_, i) => line(i)).join("\n");
const messages = [
  { role: "system", content: "agent" },
  { role: "user", content: "why retries?" },
  { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "pi_tool_result", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c1", content: log },
];
const post = await fetch("http://127.0.0.1:8788/v1/compress", {
  method: "POST", headers: { "Content-Type": "application/json", "X-Headroom-Stack": "pi-extension" },
  body: JSON.stringify({ messages, model: "gpt-4o" }),
}).then((r) => r.json());
const out = post.messages?.[3]?.content ?? "";
const hash = out.match(/Retrieve more: hash=([a-f0-9]{12,24})/i)?.[1];
if (!hash) throw new Error("no marker hash produced");
const body = await fetch(`http://127.0.0.1:8788/v1/retrieve/${hash}`).then((r) => r.json());
console.log("marker hash:", hash, "retrieved bytes:", body.original_content.length);
'
```

Expected: prints marker hash + retrieved byte count (≈736 KB). If the proxy returns no marker, re-run with a bigger log — do not weaken the assertion.

- [x] **Step 2: Swap the installed plugin** (destructive to user config — confirm with the user before running)

```bash
pi uninstall npm:@raquezha/noheadroom
pi install ../../github/casualjim/pi-mimir/packages/pi-headroom
pi list | grep -i headroom
```

Expected: `@raquezha/noheadroom` gone; `@casualjim/pi-headroom` listed.

- [x] **Step 3: In-session check**

Restart pi, run `/headroom status` (expect backend URL + enabled), then produce a large log-shaped tool result and confirm the model can call `headroom_retrieve` with the marker hash and receives the full original.

- [x] **Step 4: Rollback path (documented, not executed)**

```bash
pi uninstall ../../github/casualjim/pi-mimir/packages/pi-headroom
pi install npm:@raquezha/noheadroom
```

---

### Task 7: Docs + SPEC status flips

**Files:**
- Modify: `packages/pi-headroom/README.md` (only if live behavior differs from Task 1 draft)
- Modify: `SPEC.md` §T (flip `T54`–`T61` status `.` → `~` → `x` as tasks complete; flip the retrieve contract lines only if implementation changed them)

- [x] **Step 1: Flip completed task rows**

Mark each finished row `x`; leave the row in place (IDs are monotonic, never reused).

- [x] **Step 2: Final verification**

Run: `pnpm -r --if-present typecheck && pnpm -r --if-present test && pnpm -r --if-present check:pack`
Expected: workspace green, `@casualjim/pi-headroom` included.

- [x] **Step 3: Commit (deferred)**

```bash
git add SPEC.md packages/pi-headroom/README.md
git commit -m "docs(pi-headroom): README + SPEC task status"
```

---

## Self-Review

- **Spec coverage:** §C/V40/V45 → Tasks 1, 3, 4; V41 → Task 3; V42 → Tasks 2, 4; V43 → Tasks 4, 5; V44 → Tasks 1, 6; §I tool/cmd/file lines → Tasks 2–5; §T T54–T61 → Tasks 1–7. All covered.
- **Placeholder scan:** no TBD/TODO; every code step carries the literal code or the exact source path for verbatim copy; commit steps are explicitly deferred per repo rule.
- **Type consistency:** `RetrieveResult` (Task 2) is consumed unchanged in Task 4's execute; `buildCompressionPayload(messages, minMessageChars, { renameToolCalls })` signature defined in Task 3 matches the Task 4 call site; `renameToolCalls` config key (Task 5) matches Task 4's threading.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended by the skill)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute the tasks in this session with checkpoints.
