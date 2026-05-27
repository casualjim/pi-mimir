import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSessionHooks } from "./session-hooks.js";

export default function (pi: ExtensionAPI) {
	registerSessionHooks(pi);
}
