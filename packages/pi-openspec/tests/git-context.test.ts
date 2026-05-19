import { describe, it, expect, beforeEach } from "vitest";
import { clearGitContextCache, resetInjectedMarker, takeGitContextIfChanged, isGitMutatingCommand } from "../extensions/openspec/git-context.js";
import { createHarness } from "./helpers/pi-harness.js";

describe("git-context", () => {
	beforeEach(() => {
		clearGitContextCache();
		resetInjectedMarker();
	});

	describe("isGitMutatingCommand", () => {
		const mutating = [
			"git checkout main",
			"git switch feature",
			"git commit -m test",
			"git merge main",
			"git rebase main",
			"git pull",
			"git reset HEAD~1",
			"git revert abc",
			"git cherry-pick abc",
			"git stash",
			"git worktree add ../other",
			"git am patch.mbox",
		];

		const nonMutating = [
			"git status",
			"git log",
			"git diff",
			"git branch -a",
			"git remote -v",
			"npm test",
			"ls",
		];

		for (const cmd of mutating) {
			it(`detects mutating: ${cmd}`, () => {
				expect(isGitMutatingCommand(cmd)).toBe(true);
			});
		}

		for (const cmd of nonMutating) {
			it(`allows non-mutating: ${cmd}`, () => {
				expect(isGitMutatingCommand(cmd)).toBe(false);
			});
		}
	});

	describe("takeGitContextIfChanged", () => {
		it("returns git context when cache is fresh", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "Test User", stderr: "" },
				},
			});

			const result = await takeGitContextIfChanged(harness.pi);
			expect(result).toContain("Branch: main");
			expect(result).toContain("Commit: abc1234");
			expect(result).toContain("User: Test User");
		});

		it("remaps detached HEAD to 'detached'", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "HEAD", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "User", stderr: "" },
				},
			});

			const result = await takeGitContextIfChanged(harness.pi);
			expect(result).toContain("Branch: detached");
		});

		it("returns null when not in a git repo", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 128, stdout: "", stderr: "fatal: not a git repository" },
					"git rev-parse --short HEAD": { code: 128, stdout: "", stderr: "fatal: not a git repository" },
				},
			});

			const result = await takeGitContextIfChanged(harness.pi);
			expect(result).toBeNull();
		});

		it("returns null on second call when context unchanged (dedup)", async () => {
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "User", stderr: "" },
				},
			});

			const first = await takeGitContextIfChanged(harness.pi);
			expect(first).not.toBeNull();

			const second = await takeGitContextIfChanged(harness.pi);
			expect(second).toBeNull(); // dedup
		});

		it("re-injects after cache clear + signature change", async () => {
			let branchName = "main";
			const harness = createHarness({
				execStubs: {
					"git rev-parse --abbrev-ref HEAD": () =>
						Promise.resolve({ code: 0, stdout: branchName, stderr: "" }),
					"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
					"git config user.name": { code: 0, stdout: "User", stderr: "" },
				},
			});

			const first = await takeGitContextIfChanged(harness.pi);
			expect(first).toContain("Branch: main");

			clearGitContextCache();
			branchName = "feature";
			const second = await takeGitContextIfChanged(harness.pi);
			expect(second).toContain("Branch: feature");
		});

		it("falls back to $USER when git config fails", async () => {
			const originalUser = process.env.USER;
			process.env.USER = "env-user";
			try {
				const harness = createHarness({
					execStubs: {
						"git rev-parse --abbrev-ref HEAD": { code: 0, stdout: "main", stderr: "" },
						"git rev-parse --short HEAD": { code: 0, stdout: "abc1234", stderr: "" },
						"git config user.name": { code: 1, stdout: "", stderr: "" },
					},
				});

				const result = await takeGitContextIfChanged(harness.pi);
				expect(result).toContain("User: env-user");
			} finally {
				if (originalUser !== undefined) process.env.USER = originalUser;
				else delete process.env.USER;
			}
		});
	});
});
