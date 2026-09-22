import { expect, test } from "vitest";
import { FNOX_RESOLVE, getFnoxBlockReason } from "../lib/guards/fnox-secret-guard.ts";

// Values come out of fnox only via get/exec/sync (docs: "secrets are only
// accessible via fnox get"); set/provider/init/config-files stay safe.
const blocked = [
	"fnox get DATABASE_URL",
	"fnox get DATABASE_URL --profile production",
	"FNOX_PROFILE=prod fnox get TOKEN",
	"fnox exec -- npm start",
	"fnox exec --profile staging -- ./deploy.sh",
	"fnox sync",
	"fnox sync --force",
	"echo hi; fnox get TOKEN",
	"fnox get A && fnox get B",
	"git push && fnox exec -- ./deploy.sh",
	"command -v fnox >/dev/null && fnox get TOKEN",
];

const allowed = [
	"fnox set MY_TOKEN --provider age",
	"fnox set DATABASE_URL --global",
	"fnox provider add aws aws --global",
	"fnox provider list",
	"fnox init",
	"fnox init --global",
	"fnox config-files",
	"fnox --version",
	"fnox --help",
	"ls fnox.toml",
	"cat README.md && grep fnox file.txt",
	"fnoxx get TOKEN",
];

test("blocks value-resolving fnox commands", () => {
	for (const command of blocked) {
		expect(getFnoxBlockReason(command), command).toBeTruthy();
		expect(FNOX_RESOLVE.test(command), command).toBe(true);
	}
});

test("allows non-resolving fnox commands and lookalikes", () => {
	for (const command of allowed) {
		expect(getFnoxBlockReason(command), command).toBeNull();
	}
});
