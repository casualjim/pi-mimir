import { describe, expect, it } from "vitest";
import { openLedger, type ViolationRow } from "../lib/ledger";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function row(overrides: Partial<ViolationRow> = {}): ViolationRow {
	return {
		timestamp: Date.now(),
		sessionId: "s1",
		projectRoot: "/proj",
		guard: "gate",
		tool: "bash",
		subject: "rm -rf /tmp/x",
		finding: "irreversible:0.93",
		score: 0.93,
		steered: false,
		...overrides,
	};
}

describe("ledger", () => {
	it("inserts and reads back rows in newest-first order", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-ledger-"));
		const db = openLedger(join(dir, "violations.db"));
		try {
			db.insert(row({ timestamp: 1000, subject: "first" }));
			db.insert(row({ timestamp: 2000, subject: "second" }));
			const recent = db.recent("/proj", 10);
			expect(recent).toHaveLength(2);
			expect(recent[0]?.subject).toBe("second");
			expect(recent[1]?.subject).toBe("first");
		} finally {
			db.close();
			rmSync(dir, { recursive: true });
		}
	});

	it("scopes reads to the project root", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-ledger-"));
		const db = openLedger(join(dir, "violations.db"));
		try {
			db.insert(row({ projectRoot: "/a", subject: "a" }));
			db.insert(row({ projectRoot: "/b", subject: "b" }));
			expect(db.recent("/a", 10)).toHaveLength(1);
			expect(db.recent("/a", 10)[0]?.subject).toBe("a");
		} finally {
			db.close();
			rmSync(dir, { recursive: true });
		}
	});

	it("counts by guard", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-ledger-"));
		const db = openLedger(join(dir, "violations.db"));
		try {
			db.insert(row({ guard: "gate", timestamp: 1 }));
			db.insert(row({ guard: "gate", timestamp: 2 }));
			db.insert(row({ guard: "done", timestamp: 3 }));
			expect(db.countsByGuard("/proj")).toEqual({ gate: 2, done: 1 });
		} finally {
			db.close();
			rmSync(dir, { recursive: true });
		}
	});

	it("keeps null score and session, and the steered flag", () => {
		const dir = mkdtempSync(join(tmpdir(), "dredd-ledger-"));
		const db = openLedger(join(dir, "violations.db"));
		try {
			db.insert(row({ score: null, sessionId: null, steered: true, guard: "custom", finding: "migrationRan:0.8" }));
			const r = db.recent("/proj", 1)[0];
			expect(r?.score).toBeNull();
			expect(r?.sessionId).toBeNull();
			expect(r?.steered).toBe(true);
			expect(r?.guard).toBe("custom");
		} finally {
			db.close();
			rmSync(dir, { recursive: true });
		}
	});

	it("creates its directory on first open", () => {
		const dir = join(mkdtempSync(join(tmpdir(), "dredd-ledger-")), "nested", "deeper");
		const db = openLedger(join(dir, "violations.db"));
		try {
			db.insert(row());
			expect(db.recent("/proj", 1)).toHaveLength(1);
		} finally {
			db.close();
			rmSync(dir, { recursive: true });
		}
	});
});