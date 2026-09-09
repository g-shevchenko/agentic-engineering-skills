# Contributing

Contributions are welcome! This repository follows the [Anthropic Skills open standard](https://github.com/anthropics/skills).

## Adding a Skill

1. **Fork** the repository
2. **Create a feature branch**: `git checkout -b feat/your-skill-name`
3. **Add your skill** under `skills/your-skill-name/` with at minimum:

```yaml
---
name: your-skill-name
description: Use when [trigger condition]. [What the skill does].
---
```

Followed by Markdown instructions. Optionally bundled with scripts, references, and eval fixtures.

4. **Verify** your skill passes the repo checks:

```bash
bash scripts/doctor.sh
bash scripts/audit-public-surface.sh
```

5. **Open a pull request** with a clear description of what the skill does and why it belongs in this repo.

## Skill Guidelines

- **Self-contained**: no references to private repos, internal infrastructure, or hardcoded credentials
- **Generic**: works in any repo with any agent (Claude Code, Codex, Cursor, Windsurf, Devin)
- **Trigger-based**: clear `description` with trigger conditions for when the skill should activate
- **No side effects on install**: the installer copies files only, no package managers or external services
- **Sanitized**: run `bash scripts/audit-public-surface.sh` before submitting — no private paths, secrets, or internal URLs

## Repo Structure

See [README.md](README.md) for the full repository layout.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
