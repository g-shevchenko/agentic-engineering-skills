# Verify Before Install

Run these commands from a fresh clone:

```bash
git status --short --branch
bash scripts/doctor.sh
bash scripts/audit-public-surface.sh
bash scripts/install.sh --dry-run
```

Expected behavior:

- `doctor.sh` confirms required files and skill metadata exist.
- `audit-public-surface.sh` scans for common secrets, private-path references, and placeholders.
- `install.sh --dry-run` prints planned writes without copying files.
- A real install prints the commands to invoke the installed skills.

Expected write paths for a normal install:

- `$HOME/.codex/skills/<skill-name>` by default, or `--target <dir>`.
- `./AGENTS.md` managed block unless `--agent-docs skip`.

Network behavior:

- none during install, doctor, or audit.

API key behavior:

- no API keys required.
- no credential files read.

Forbidden installer patterns:

- no `curl | bash`;
- no remote code execution;
- no package-manager install;
- no hidden background service.

Safety checks:

- refuses `--target /`, `--target "$HOME"`, and `--target .`;
- only writes skill folders under the selected target;
- replaces an existing skill folder through a temporary backup path, not by deleting arbitrary user-provided paths.
