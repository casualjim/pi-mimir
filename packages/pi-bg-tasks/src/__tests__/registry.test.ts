/**
 * registry.ts / 검색·정리·통계 기능 테스트.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BackgroundRegistry } from "../state.ts";
import {
    add,
    cleanupTerminal,
    findJob,
    forget,
    getStats,
    newJobId,
} from "../registry.ts";
import type { Job } from "../types.ts";

const TMP = "/tmp/pi-patty-test";

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: "job-test-1",
        command: "echo hi",
        pid: 1,
        startTime: Date.now(),
        status: "running",
        logPath: "/tmp/test",
        toolCallId: "tc-1",
        isBackgrounded: false,
        ...overrides,
    };
}

void describe("newJobId", () => {
    void it("kind prefix + 8 random base36 chars (CC's typed task ids)", () => {
        assert.match(newJobId("shell"), /^b[0-9a-z]{8}$/);
        assert.match(newJobId("monitor"), /^m[0-9a-z]{8}$/);
        assert.match(newJobId("agent"), /^a[0-9a-z]{8}$/);
    });
    void it("random — consecutive ids differ", () => {
        assert.notEqual(newJobId("shell"), newJobId("shell"));
    });
});

void describe("findJob", () => {
    void it("정확한 ID 매치", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "job-1" });
        reg.jobs.set("job-1", job);
        assert.equal(findJob(reg, "job-1"), job);
    });
    void it("recentTerminal에서 찾기", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "job-old", status: "completed" });
        reg.recentTerminal.push(job);
        assert.equal(findJob(reg, "job-old"), job);
    });
    void it("unknown id returns undefined", () => {
        const reg = new BackgroundRegistry();
        assert.equal(findJob(reg, "nope"), undefined);
    });
});

void describe("add / forget 카운터", () => {
    void it("add는 totalStarted 증가", () => {
        const reg = new BackgroundRegistry();
        add(reg, makeJob({ id: "job-1" }));
        add(reg, makeJob({ id: "job-2" }));
        assert.equal(reg.totalStarted, 2);
    });
    void it("forget + completed 카운터 증가", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "job-1", status: "completed", exitCode: 0 });
        add(reg, job);
        forget(reg, job);
        assert.equal(reg.completedCount, 1);
        assert.equal(reg.totalStarted, 1); // add에서 증가한 값 유지.
        assert.equal(reg.totalDurationMs >= 0, true);
        assert.equal(reg.jobs.size, 0);
        assert.equal(reg.recentTerminal.length, 1);
    });
    void it("forget + failed 카운터 증가", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "job-2", status: "failed", exitCode: 1 });
        add(reg, job);
        forget(reg, job);
        assert.equal(reg.failedCount, 1);
    });
    void it("forget + killed increments the lifetime killed counter", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "job-3", status: "killed" });
        add(reg, job);
        forget(reg, job);
        assert.equal(reg.killedCount, 1);
        assert.equal(reg.completedCount, 0);
        assert.equal(reg.failedCount, 0);
        assert.equal(getStats(reg).killed, 1);
    });
    void it("recentTerminal 링은 20개에서 멈춤", () => {
        const reg = new BackgroundRegistry();
        for (let i = 0; i < 25; i++) {
            const job = makeJob({ id: `job-${i}`, status: "completed" });
            add(reg, job);
            forget(reg, job);
        }
        assert.equal(reg.recentTerminal.length, 20);
    });
});

void describe("cleanupTerminal", () => {
    void it("종료된 잡 + 로그 파일 제거", () => {
        try {
            rmSync(TMP, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
        mkdirSync(TMP, { recursive: true });
        const logPath = join(TMP, "cleanup.log");
        writeFileSync(logPath, "x".repeat(2048));

        const reg = new BackgroundRegistry();
        const job = makeJob({
            id: "job-cleanup",
            status: "completed",
            logPath,
        });
        add(reg, job);
        reg.jobs.set(job.id, job);

        const result = cleanupTerminal(reg);
        assert.equal(result.purged >= 1, true);
        assert.equal(result.bytesReclaimed >= 2048, true);
        assert.equal(reg.jobs.size, 0);
        assert.equal(reg.recentTerminal.length, 0);

        rmSync(TMP, { recursive: true, force: true });
    });
});

void describe("getStats", () => {
    void it("빈 registry", () => {
        const reg = new BackgroundRegistry();
        const s = getStats(reg);
        assert.equal(s.totalStarted, 0);
        assert.equal(s.running, 0);
        assert.equal(s.completed, 0);
        assert.equal(s.failed, 0);
        assert.equal(s.averageDurationMs, 0);
    });
    void it("집계 정확", () => {
        const reg = new BackgroundRegistry();
        add(reg, makeJob({ id: "j1", status: "completed" }));
        add(reg, makeJob({ id: "j2", status: "completed" }));
        add(reg, makeJob({ id: "j3", status: "failed" }));
        const s = getStats(reg);
        assert.equal(s.totalStarted, 3);
        assert.equal(s.completed, 0); // add 안 한 상태, 다음 forget에서 올라감
        assert.equal(s.failed, 0);
        // running은 map에 남은 것만 카운트.
        forget(reg, reg.jobs.get("j1")!);
        forget(reg, reg.jobs.get("j2")!);
        forget(reg, reg.jobs.get("j3")!);
        const s2 = getStats(reg);
        assert.equal(s2.completed, 2);
        assert.equal(s2.failed, 1);
    });
});
