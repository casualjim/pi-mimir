import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAlign } from "./align.js";
import { registerCommands } from "./commands.js";
import { registerEvents } from "./events.js";
import { PiJjRuntime } from "./runtime.js";
import { registerTools } from "./tools.js";

export default function (pi: ExtensionAPI) {
  const runtime = new PiJjRuntime(pi);
  registerEvents(pi, runtime);
  registerCommands(pi, runtime);
  registerTools(pi, runtime);
  registerAlign(pi);
}
