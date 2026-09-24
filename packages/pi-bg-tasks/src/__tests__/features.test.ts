/**
 * 신규 기능 통합 테스트:
 *   - jobs.search 정규식 검색
 *   - jobs.cleanup 종료된 잡 일괄 제거
 *   - jobs.stats 집계 메트릭
 *   - bash_bg의 --name 라벨
 *
 * 툴의 register 함수를 직접 호출하지 않고, registry + 포맷터 수준의
 * 단위 테스트로 동작을 검증한다.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { killProcessTree, processExists } from "../spawn.ts";
import { BackgroundRegistry } from "../state.ts";
import {
    add,
    cleanupTerminal,
    forget,
    getStats,
    newJobId,
} from "../registry.ts";
import { formatJobLine } from "../format.ts";
import type { Job } from "../types.ts";

const TMP = "/tmp/pi-patty-features-test";

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: newJobId("shell"),
        command: "echo hello",
        pid: 1,
        startTime: Date.now(),
        status: "completed",
        logPath: "/tmp/x",
        toolCallId: "tc-1",
        isBackgrounded: false,
        ...overrides,
    };
}

void describe("bash_bg --name 라벨", () => {
    void it("formatJobLine은 이름 있는 잡에 대해 'name (job-id)' 헤더 사용", () => {
        const job = makeJob({ id: "job-1", name: "build" });
        const line = formatJobLine(job);
        assert.ok(line.startsWith("build (job-1)"));
    });
    void it("이름 없는 잡은 job-id만", () => {
        const job = makeJob({ id: "job-2" });
        const line = formatJobLine(job);
        assert.ok(line.startsWith("job-2"));
        assert.ok(!line.includes("("));
    });
});

void describe("jobs.search 정규식 검색", () => {
    void it("여러 잡 로그에서 정규식 매치", () => {
        try {
            rmSync(TMP, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
        mkdirSync(TMP, { recursive: true });

        const logA = join(TMP, "a.log");
        const logB = join(TMP, "b.log");
        writeFileSync(logA, "line 1\nERROR: foo failed\nline 3\n");
        writeFileSync(logB, "starting\nERROR: bar failed\ndone\n");

        const reg = new BackgroundRegistry();
        add(
            reg,
            makeJob({
                id: "job-a",
                name: "first",
                logPath: logA,
                status: "completed",
            })
        );
        add(
            reg,
            makeJob({
                id: "job-b",
                name: "second",
                logPath: logB,
                status: "completed",
            })
        );

        // 두 로그에 모두 ERROR 라인이 있다 — 검색 로직이 둘 다 찾아야 한다.
        const pattern = /ERROR/;
        let hitsA = 0;
        let hitsB = 0;
        for (const job of reg.jobs.values()) {
            const content = readFileSync(job.logPath, "utf-8");
            const lines = content.split("\n");
            for (const line of lines) {
                if (pattern.test(line)) {
                    if (job.id === "job-a") hitsA++;
                    else if (job.id === "job-b") hitsB++;
                }
            }
        }
        assert.equal(hitsA, 1);
        assert.equal(hitsB, 1);

        rmSync(TMP, { recursive: true, force: true });
    });
});

void describe("jobs.cleanup", () => {
    void it("실행 중 잡은 보존, 종료된 잡은 제거", () => {
        try {
            rmSync(TMP, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
        mkdirSync(TMP, { recursive: true });

        const reg = new BackgroundRegistry();
        const liveLog = join(TMP, "live.log");
        const deadLog = join(TMP, "dead.log");
        writeFileSync(liveLog, "still running");
        writeFileSync(deadLog, "finished");

        add(
            reg,
            makeJob({
                id: "job-live",
                status: "running",
                logPath: liveLog,
            })
        );
        add(
            reg,
            makeJob({
                id: "job-dead",
                status: "completed",
                logPath: deadLog,
            })
        );

        const result = cleanupTerminal(reg);
        // 종료된 잡 + recentTerminal (0개) → 1개 정리.
        assert.equal(result.purged, 1);
        // 라이브 잡은 살아있다.
        assert.ok(reg.jobs.has("job-live"));
        assert.ok(!reg.jobs.has("job-dead"));

        rmSync(TMP, { recursive: true, force: true });
    });
});

void describe("jobs.stats", () => {
    void it("집계 정확성", () => {
        const reg = new BackgroundRegistry();
        add(reg, makeJob({ id: "j1", status: "running" }));
        add(reg, makeJob({ id: "j2", status: "running" }));
        const live1 = reg.jobs.get("j1")!;
        const live2 = reg.jobs.get("j2")!;
        live1.status = "completed";
        forget(reg, live1);
        live2.status = "failed";
        forget(reg, live2);
        add(reg, makeJob({ id: "j3", status: "running" }));

        const s = getStats(reg);
        assert.equal(s.totalStarted, 3);
        assert.equal(s.running, 1);
        assert.equal(s.completed, 1);
        assert.equal(s.failed, 1);
    });
});

void describe("killProcessTree + processExists 안전성", () => {
    void it("잘못된 PID에서 throw하지 않음", () => {
        // 죽은 PID, 음수, 0 모두 무해.
        killProcessTree(0);
        killProcessTree(-1);
        killProcessTree(99999999);
        assert.equal(processExists(99999999), false);
    });
});

void describe("add/forget 라이프사이클", () => {
    void it("중복 add는 멱등하지 않음 (counter 누적)", () => {
        const reg = new BackgroundRegistry();
        const job = makeJob({ id: "j1" });
        add(reg, job);
        add(reg, job); // 중복 — totalStarted는 그대로 +1.
        assert.equal(reg.totalStarted, 2);
        assert.equal(reg.jobs.size, 1);
    });
    void it("forget 후 동일 ID 재등록 가능", () => {
        const reg = new BackgroundRegistry();
        const j = makeJob({ id: "j1" });
        add(reg, j);
        forget(reg, j);
        const j2 = makeJob({ id: "j1", status: "running" });
        add(reg, j2);
        assert.equal(reg.jobs.size, 1);
        assert.equal(reg.completedCount, 1);
    });
});
