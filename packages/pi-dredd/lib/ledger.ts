/**
 * The violation ledger: one SQLite row per detected issue, even when no steer
 * was sent. Capture and steering are decoupled by design — a muted steer must
 * never mute the record. Stored: what was detected, on which call, at what
 * score, and whether a steer or hold accompanied it.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ViolationRow {
	timestamp: number;
	sessionId: string | null;
	projectRoot: string;
	/** Which guard detected it: "gate", "done", "stuck", "cause", "slop", "security", "screen", "rules", "custom", "policy". */
	guard: string;
	tool: string | null;
	/** The judged sample: command or output excerpt. */
	subject: string;
	/** Short machine-readable finding, e.g. "irreversible:0.93". */
	finding: string;
	score: number | null;
	/** Whether a steer/hold was delivered for this row. */
	steered: boolean;
}

export interface ViolationsDb {
	insert(row: ViolationRow): void;
	/** Most recent first, bounded. */
	recent(projectRoot: string, limit: number): Array<ViolationRow & { id: number }>;
	countsByGuard(projectRoot: string): Record<string, number>;
	close(): void;
}

export function openLedger(dbPath: string): ViolationsDb {
	mkdirSync(dirname(dbPath), { recursive: true });
	const db = new DatabaseSync(dbPath);
	db.exec(`
		CREATE TABLE IF NOT EXISTS violations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp INTEGER NOT NULL,
			session_id TEXT,
			project_root TEXT NOT NULL,
			guard TEXT NOT NULL,
			tool TEXT,
			subject TEXT NOT NULL,
			finding TEXT NOT NULL,
			score REAL,
			steered INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_violations_root_time ON violations(project_root, timestamp DESC);
		CREATE INDEX IF NOT EXISTS idx_violations_guard ON violations(project_root, guard);
	`);
	const insertStmt = db.prepare(
		"INSERT INTO violations (timestamp, session_id, project_root, guard, tool, subject, finding, score, steered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
	);
	const recentStmt = db.prepare(
		"SELECT id, timestamp, session_id AS sessionId, project_root AS projectRoot, guard, tool, subject, finding, score, steered FROM violations WHERE project_root = ? ORDER BY timestamp DESC, id DESC LIMIT ?",
	);
	return {
		insert(row) {
			insertStmt.run(
				row.timestamp,
				row.sessionId,
				row.projectRoot,
				row.guard,
				row.tool,
				row.subject,
				row.finding,
				row.score,
				row.steered ? 1 : 0,
			);
		},
		recent(projectRoot, limit) {
			return recentStmt.all(projectRoot, limit).map(row => {
				const r = row as Record<string, unknown>;
				return {
					id: Number(r.id),
					timestamp: Number(r.timestamp),
					sessionId: (r.sessionId as string | null) ?? null,
					projectRoot: String(r.projectRoot),
					guard: String(r.guard),
					tool: (r.tool as string | null) ?? null,
					subject: String(r.subject),
					finding: String(r.finding),
					score: r.score === null ? null : Number(r.score),
					steered: r.steered === 1,
				};
			});
		},
		countsByGuard(projectRoot) {
			const out: Record<string, number> = {};
			for (const row of db.prepare("SELECT guard, COUNT(*) AS n FROM violations WHERE project_root = ? GROUP BY guard").all(projectRoot)) {
				const r = row as Record<string, unknown>;
				out[String(r.guard)] = Number(r.n);
			}
			return out;
		},
		close() {
			db.close();
		},
	};
}