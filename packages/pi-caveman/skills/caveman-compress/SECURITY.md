# Security

## Snyk High Risk Rating

`caveman-compress` receives a Snyk High Risk rating due to static analysis heuristics. This document explains what the skill does and does not do.

### What triggers the rating

1. **subprocess usage**: The helper calls the Pi CLI via `subprocess.run()` to ask the user's configured Pi model/provider to compress prose. The subprocess call uses a fixed argument list — no shell interpolation occurs. User file content is passed via stdin, not as a shell argument.

2. **File read/write**: The skill reads the file the user explicitly points it at, compresses it, and writes the result back to the same path. A `.original.md` backup is saved alongside it. No files outside the user-specified path are read or written.

### What the skill does NOT do

- Does not execute user file content as code
- Does not call provider SDKs directly
- Does not invoke non-Pi model CLIs
- Does not access files outside the path the user provides
- Does not use shell=True or string interpolation in subprocess calls
- Does not collect or transmit any data beyond the file being compressed

### Auth behavior

The helper uses `pi --print`, inheriting the user's Pi model/provider configuration. Provider authentication stays owned by Pi settings and environment. This package does not ship provider-specific auth logic.

### File size limit

Files larger than 500KB are rejected before any model call is made.

### Reporting a vulnerability

If you believe you've found a genuine security issue, please open a GitHub issue with the label `security`.
