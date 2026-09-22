import { describe, expect, test, vi } from "vitest";
import { isDotenvPath } from "../lib/guards/env-protect.ts";

describe("env-protect path matching", () => {
	const blocked = [
		".env",
		".envrc",
		".env.local",
		"server/.env",
		"app.env",
		"fnox.toml",
		".fnox.toml",
		"fnox.local.toml",
		".fnox.local.toml",
		"fnox.production.toml",
		"config/fnox.staging.toml",
	];

	const allowed = [
		".env.example",
		".env.sample",
		".env.template",
		"config/.env.dist",
		"env.ts",
		"environment.json",
		"nox.toml",
		"fennox.toml",
		"README.md",
	];

	test("blocks dotenv and fnox secret files", () => {
		for (const path of blocked) {
			expect(isDotenvPath(path), path).toBe(true);
		}
	});

	test("allows example variants and non-secret files", () => {
		for (const path of allowed) {
			expect(isDotenvPath(path), path).toBe(false);
		}
	});
});
