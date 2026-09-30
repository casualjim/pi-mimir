import { describe, expect, it } from "vitest";
import {
	buildGeneratedConfig,
	buildResolvers,
	injectTagsIntoInit,
	installFetchTagInjection,
	resolveProjectLabel,
	resolveTemplate,
} from "../extensions/hindsight/core.js";

describe("resolveProjectLabel", () => {
	it("uses parent of .git common dir for a regular repo", () => {
		const label = resolveProjectLabel("/x/y/repo", ((cmd: string, args: string[]) => {
			expect(cmd).toBe("git");
			expect(args[0]).toBe("rev-parse");
			return "/x/y/repo/.git\n";
		}) as never);
		expect(label).toBe("repo");
	});

	it("uses the common dir itself for a bare repo", () => {
		const label = resolveProjectLabel("/x/y/repo.git", (() => "/srv/git/repo.git\n") as never);
		expect(label).toBe("repo.git");
	});

	it("falls back to cwd basename when git probe fails", () => {
		const label = resolveProjectLabel("/x/y/notrepo", (() => {
			throw new Error("not a git repo");
		}) as never);
		expect(label).toBe("notrepo");
	});
});

describe("resolveTemplate", () => {
	const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "Pi-Mimir" });

	it("resolves known placeholders", () => {
		expect(resolveTemplate("project:{gitProject}", resolvers)).toBe("project:Pi-Mimir");
		expect(resolveTemplate("project:{gitProjectLower}", resolvers)).toBe("project:pi-mimir");
		expect(resolveTemplate("{harness}:{project}", resolvers)).toBe("pi:r");
		expect(resolveTemplate("{channel}/{user}", resolvers)).toBe("default/anonymous");
	});

	it("emits unknown instead of a bogus tag for unknown placeholders", () => {
		expect(resolveTemplate("project:{bogus}", resolvers)).toBe("project:unknown");
	});
});

describe("buildGeneratedConfig", () => {
	it("strips wrapper keys and bakes resolved tags into recallOptions", () => {
		const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "repo" });
		const { config, recallTags, recallTagsMatch, warnings } = buildGeneratedConfig(
			{
				bankId: "omp",
				retainTags: ["project:{gitProject}"],
				recallTags: ["project:{gitProjectLower}"],
				recallTagsMatch: "any_strict",
			},
			resolvers,
		);
		expect(config).toEqual({
			bankId: "omp",
			retainTags: ["project:{gitProject}"], // official plugin resolves these itself
			recallOptions: { tags: ["project:repo"], tags_match: "any_strict" },
		});
		expect(recallTags).toEqual(["project:repo"]);
		expect(recallTagsMatch).toBe("any_strict");
		expect(warnings).toEqual([]);
	});

	it("defaults recallTagsMatch to any and keeps other keys untouched", () => {
		const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "repo" });
		const { config, recallTags, recallTagsMatch } = buildGeneratedConfig(
			{ apiUrl: "http://x", recallTags: ["a:{gitProject}", "b:{gitProject}", "a:{gitProject}"] },
			resolvers,
		);
		expect(config.apiUrl).toBe("http://x");
		expect(recallTags).toEqual(["a:repo", "b:repo"]); // deduplicated, order kept
		expect(recallTagsMatch).toBe("any");
		expect((config.recallOptions as Record<string, unknown>).tags_match).toBe("any");
	});

	it("does not override explicit recallOptions.tags, and warns", () => {
		const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "repo" });
		const { config, recallTags, warnings } = buildGeneratedConfig(
			{
				recallTags: ["project:{gitProject}"],
				recallOptions: { tags: ["static"], budget: "high" },
			},
			resolvers,
		);
		expect(recallTags).toEqual(["project:repo"]);
		expect(config.recallOptions).toEqual({ tags: ["static"], budget: "high" });
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("recallOptions.tags wins");
	});

	it("pre-resolves {gitProjectLower} in retainTags (official plugin has no such placeholder)", () => {
		const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "Repo" });
		const { config } = buildGeneratedConfig(
			{
				retainTags: ["project:{gitProjectLower}", "session:{sessionId}", "plain"],
				recallTags: ["project:{gitProjectLower}"],
			},
			resolvers,
		);
		expect(config.retainTags).toEqual(["project:repo", "session:{sessionId}", "plain"]);
		expect((config.recallOptions as Record<string, unknown>).tags).toEqual(["project:repo"]);
	});

	it("produces no recallOptions tags without recallTags", () => {
		const resolvers = buildResolvers({ harness: "pi", repoDir: "/r", projectLabel: "repo" });
		const { config, recallTags } = buildGeneratedConfig({ bankId: "omp" }, resolvers);
		expect(recallTags).toEqual([]);
		expect(config.recallOptions).toEqual({ tags: [], tags_match: "any" });
	});
});

describe("installFetchTagInjection", () => {
	type Recorded = { url: string; init?: RequestInit };
	function makeRecorder() {
		const calls: Recorded[] = [];
		const impl = async (input: unknown, init?: unknown) => {
			calls.push({
				url: typeof input === "string" ? input : String((input as Request)?.url ?? input),
				init: init as RequestInit | undefined,
			});
			return { ok: true };
		};
		return { impl, calls };
	}

	it("injects tags into recall and reflect bodies", async () => {
		const { impl, calls } = makeRecorder();
		const wrapped = installFetchTagInjection(impl, ["project:repo"], "any");
		const url = "http://h:8888/v1/default/banks/omp/memories/recall";
		await wrapped(url, { method: "POST", body: JSON.stringify({ query: "q", types: ["observation"] }) });
		const reflectUrl = "http://h:8888/v1/default/banks/omp/reflect";
		await wrapped(reflectUrl, { method: "POST", body: JSON.stringify({ query: "why" }) });
		expect(calls).toHaveLength(2);
		const first = JSON.parse(calls[0].init?.body as string);
		expect(first.tags).toEqual(["project:repo"]);
		expect(first.tags_match).toBe("any");
		const second = JSON.parse(calls[1].init?.body as string);
		expect(second.tags).toEqual(["project:repo"]);
	});

	it("leaves bodies that already carry tags untouched", async () => {
		const { impl, calls } = makeRecorder();
		const wrapped = installFetchTagInjection(impl, ["project:repo"], "any");
		await wrapped("http://h/v1/default/banks/b/memories/recall", {
			method: "POST",
			body: JSON.stringify({ query: "q", tags: ["mine"] }),
		});
		expect(JSON.parse(calls[0].init?.body as string).tags).toEqual(["mine"]);
	});

	it("ignores other endpoints, non-string bodies and empty tag lists", async () => {
		const { impl, calls } = makeRecorder();
		const wrappedNone = installFetchTagInjection(impl, [], "any");
		await wrappedNone("http://h/v1/default/banks/b/memories/recall", {
			method: "POST",
			body: JSON.stringify({ query: "q" }),
		});
		expect(JSON.parse(calls[0].init?.body as string).tags).toBeUndefined();

		const stream = new ReadableStream();
		const wrapped = installFetchTagInjection(impl, ["t"], "any");
		await wrapped("http://h/v1/default/banks/b/memories/recall", { method: "POST", body: stream });
		await wrapped("http://h/v1/default/banks/b/documents", { method: "POST", body: JSON.stringify({ a: 1 }) });
		expect(calls).toHaveLength(3);
		expect(calls[1].init?.body).toBe(stream);
		expect(JSON.parse(calls[2].init?.body as string).tags).toBeUndefined();
	});

	it("is idempotent and tolerates garbage input", async () => {
		const { impl } = makeRecorder();
		const wrapped = installFetchTagInjection(impl, ["t"], "any");
		expect(installFetchTagInjection(wrapped, ["t"], "any")).toBe(wrapped);
		// Garbage input must pass through untouched without throwing.
		await wrapped(new Date("nope") as never, { method: "POST", body: "not json {" });
	});
});

describe("injectTagsIntoInit", () => {
	it("does not mutate the original init", () => {
		const init: RequestInit = { method: "POST", body: JSON.stringify({ query: "q" }) };
		injectTagsIntoInit("http://h/x/reflect", init, ["t"], "all");
		expect(JSON.parse(init.body as string).tags).toBeUndefined();
	});
});
