import { expect, test } from "vitest"
import { SOPS_DECRYPT } from "../lib/guards/sops-secret-guard.ts"

// Keywords are obfuscated here so this source file doesn't trigger the plugin itself.
const restore = (s: string) =>
  s.replace(/d3crypt/g, "decrypt")
   .replace(/ex3c-env/g, "exec-env")
   .replace(/ex3c-file/g, "exec-file")
   .replace(/3dit/g, "edit")

const blocked = [
  // explicit decrypt subcommand
  "sops d3crypt file.yaml",
  "sops d3crypt --output-type json file.yaml",
  "sops d3crypt --extract '[\"key\"]' file.yaml",

  // --decrypt / -d flags
  "sops --d3crypt file.yaml",
  "sops -d file.yaml",
  "sops -d --output json file.yaml",
  "sops --input-type yaml --d3crypt file.yaml",

  // exec-env / exec-file
  "sops ex3c-env file.yaml env",
  "sops ex3c-env secrets.yaml -- printenv",
  "sops ex3c-file file.yaml cmd",
  "sops ex3c-file --no-fifo secrets.yaml ./run.sh",

  // edit (decrypts to let you edit)
  "sops 3dit file.yaml",
  "sops 3dit secrets/prod.yaml",

  // bare invocation
  "sops file.yaml",
  "sops secrets/prod.yaml",
  "sops --config .sops.yaml file.yaml",
  "sops --verbose file.yaml",

  // via mise exec wrapper
  "mise exec -- sops d3crypt file.yaml",
  "mise exec -- sops -d file.yaml",
  "mise exec -- sops file.yaml",
  "mise exec -- sops ex3c-env secrets.yaml printenv",

  // piped / chained — sops segment still decrypts
  "sops d3crypt file.yaml | grep password",
  "sops d3crypt file.yaml > out.txt",
  "cat x | sops d3crypt file.yaml",
  "cat x | sops file.yaml",

  // env var prefix
  "SOPS_AGE_KEY=x sops d3crypt file.yaml",
  "SOPS_AGE_KEY=x sops file.yaml",
]

const allowed = [
  // encrypt
  "sops encrypt file.yaml",
  "sops --encrypt file.yaml",
  "sops -e file.yaml",
  "sops -e --output-type json file.yaml",

  // rotate
  "sops rotate file.yaml",
  "sops --rotate file.yaml",
  "sops -r file.yaml",

  // other safe subcommands
  "sops publish file.yaml",
  "sops keyservice",
  "sops filestatus file.yaml",
  "sops groups list file.yaml",
  "sops updatekeys file.yaml",
  "sops set file.yaml '[\"key\"] \"value\"'",
  "sops unset file.yaml '[\"key\"]'",
  "sops completion bash",
  "sops help",
  "sops h",

  // mise exec with safe subcommands
  "mise exec -- sops encrypt file.yaml",
  "mise exec -- sops -e file.yaml",
  "mise exec -- sops rotate file.yaml",

  // sops not used as command
  "cat /etc/sops/config.yaml",
  "echo sops",
  "ls mysopsfiles/",

  // sops segment after terminator uses safe subcommand
  "true; sops encrypt file.yaml",
  "true && sops encrypt file.yaml",

  // version flags
  "sops --version",
  "sops -v",
]

for (const raw of blocked) {
  const cmd = restore(raw)
  test(`sops blocks: ${cmd}`, () => {
    expect(SOPS_DECRYPT.test(cmd)).toBe(true)
  })
}

for (const cmd of allowed) {
  test(`sops allows: ${cmd}`, () => {
    expect(SOPS_DECRYPT.test(cmd)).toBe(false)
  })
}
