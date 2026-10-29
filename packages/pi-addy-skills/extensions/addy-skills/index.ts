import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAddySkillsRoles } from "./roles.js";

export default function (pi: ExtensionAPI) {
  registerAddySkillsRoles(pi);
}
