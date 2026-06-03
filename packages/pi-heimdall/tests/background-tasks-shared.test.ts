import { afterEach, describe, expect, it } from "vitest";
import { rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackgroundTaskLogFile, getBackgroundTaskLogDir } from "../lib/background-tasks/shared";

describe("background task log storage", () => {
	const createdRoots: string[] = [];

afterEach(() => {
		for (const root of createdRoots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("creates logs under a private Heimdall runtime directory with restrictive permissions", () => {
		const agentDir = join(tmpdir(), `heimdall-bg-log-${Date.now()}-${Math.random().toString(16).slice(2)}`);
		createdRoots.push(agentDir);

		const logDir = getBackgroundTaskLogDir(agentDir);
		const first = createBackgroundTaskLogFile(Date.now(), "bg-1", agentDir);
		const second = createBackgroundTaskLogFile(Date.now(), "bg-1", agentDir);

		expect(first).toMatch(/^.*heimdall\/background-tasks\/heimdall-bg-bg-1-/);
		expect(second).not.toBe(first);
		expect(first.startsWith(logDir)).toBe(true);

		const dirMode = statSync(logDir).mode & 0o777;
		const fileMode = statSync(first).mode & 0o777;
		expect(dirMode).toBe(0o700);
		expect(fileMode).toBe(0o600);
	});
});
