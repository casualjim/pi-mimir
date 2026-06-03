import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import registerBackgroundTasksExtension from "../lib/background-tasks/extension.js";

export default function heimdallBackgroundTasks(pi: ExtensionAPI) {
	registerBackgroundTasksExtension(pi);
}
