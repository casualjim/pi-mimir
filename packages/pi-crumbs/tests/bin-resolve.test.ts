import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCrumbsBin, hasCrumbs, resetCrumbsBinCache, resolveCrumbsBin } from "../extensions/crumbs/bin-resolve.js";

describe("crumbs bin resolution", () => {
	const oldPath = process.env.PATH;
	const oldOverride = process.env.PI_CRUMBS_BIN;
	const oldHome = process.env.HOME;
	let sandbox: string;

	beforeEach(() => {
		sandbox = mkdtempSync(join(tmpdir(), `pi-crumbs-bin-${Date.now()}-`));
		process.env.PATH = sandbox;
		process.env.HOME = sandbox;
		delete process.env.PI_CRUMBS_BIN;
		resetCrumbsBinCache();
	});

	afterEach(() => {
		process.env.PATH = oldPath;
		if (oldHome === undefined) delete process.env.HOME;
		else process.env.HOME = oldHome;
		if (oldOverride === undefined) delete process.env.PI_CRUMBS_BIN;
		else process.env.PI_CRUMBS_BIN = oldOverride;
		resetCrumbsBinCache();
		rmSync(sandbox, { recursive: true, force: true });
	});

	it("resolves crumbs from PATH", () => {
		const fake = join(sandbox, "crumbs");
		writeFileSync(fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		expect(resolveCrumbsBin()).toBe(fake);
		expect(hasCrumbs()).toBe(true);
		expect(getCrumbsBin()).toBe(fake);
	});

	it("returns undefined when crumbs is absent from PATH", () => {
		expect(resolveCrumbsBin()).toBeUndefined();
		expect(hasCrumbs()).toBe(false);
		expect(getCrumbsBin()).toBeUndefined();
	});

	it("honours PI_CRUMBS_BIN override above PATH", () => {
		const fake = join(sandbox, "custom-crumbs");
		writeFileSync(fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		process.env.PI_CRUMBS_BIN = fake;
		resetCrumbsBinCache();
		expect(resolveCrumbsBin()).toBe(fake);
		expect(hasCrumbs()).toBe(true);
	});

	it("caches the resolution until reset", () => {
		const fake = join(sandbox, "crumbs");
		writeFileSync(fake, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		expect(getCrumbsBin()).toBe(fake);
		// Remove the binary; cached value should still be returned until reset.
		rmSync(fake, { force: true });
		expect(getCrumbsBin()).toBe(fake);
		resetCrumbsBinCache();
		expect(getCrumbsBin()).toBeUndefined();
	});
});
