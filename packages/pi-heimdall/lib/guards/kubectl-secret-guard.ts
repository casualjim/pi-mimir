/**
 * kubectl-secret-guard
 *
 * Blocks risky kubectl invocations:
 *   1. kubectl get secrets
 *   2. kubectl patch ... finalizers
 *   3. kubectl exec into pods accessing sensitive data
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SEG = "(?:[^;|&\\n]|\\\\\\n)";

export const KUBECTL_BLOCKED = new RegExp(
	`\\bkubectl\\b${SEG}*\\b(?:(get\\b${SEG}*\\bsecrets?\\b)|(patch\\b${SEG}*finalizers)|(exec\\b${SEG}*(?:app\\.ini|/var/run/secrets|\\bprintenv\\b|\\benv\\b)))`,
);

export function getKubectlBlockReason(command: string): string | null {
	const m = KUBECTL_BLOCKED.exec(command);
	if (!m) return null;

	const trailer =
		`This is protected by pi-heimdall/kubectl-secret-guard. ` +
		`Ask the user to run this command directly in their terminal if needed. ` +
		`Never attempt to bypass this protection or ask the user to disable it.`;

	if (m[1]) {
		return `Blocked: command would execute "kubectl get secret". ${trailer}`;
	}
	if (m[2]) {
		return (
			`Blocked: command would patch finalizers. ` +
			`Removing finalizers bypasses Kubernetes deletion safeguards and can cause resource leaks. ` +
			trailer
		);
	}
	return (
		`Blocked: command would exec into a pod and access sensitive data ` +
		`(app.ini, /var/run/secrets, or environment variables). ` +
		trailer
	);
}

export function registerKubectlSecretGuard(pi: ExtensionAPI, disabledSet: Set<string>): void {
	pi.on("tool_call", async (event, ctx) => {
		if (disabledSet.has("kubectl-secret-guard")) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;
		if (typeof command !== "string") return undefined;

		const reason = getKubectlBlockReason(command);
		if (!reason) return undefined;

		if (ctx.hasUI) {
			ctx.ui.notify("heimdall: blocked risky kubectl command", "warning");
		}

		return { block: true, reason };
	});
}
