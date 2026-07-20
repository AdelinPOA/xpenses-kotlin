# xpenses-kotlin: Agent Routing & Protocol

This file serves as the Layer 1 Protocol for AI agents working in this repository. It routes tasks to specific personas and contains project-wide workflow rules. 

## Routing & Personas (Layer 2)
When working on specific parts of the codebase, you MUST activate the appropriate skill/persona to load non-discoverable context and landmines:

- **Frontend tasks**: Load `.agents/skills/frontend-dev/SKILL.md`
- **Backend tasks**: Load `.agents/skills/backend-dev/SKILL.md`

## Workflow (OpenSpec)
**Always use OpenSpec for feature work** — `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Available as both CLI commands and slash-commands (`.claude/commands/opsx/`).

Testing order: `code changes` → `./gradlew test` (backend) / `npx tsc --noEmit && npm run lint` (frontend) → `docker compose build`.

## CI pipeline (must pass CI-checks locally)
```yaml
# backend:  ./gradlew test bootJar --no-daemon
# frontend: npm ci → npx tsc --noEmit → npm run lint → npm run build
# docker:   docker compose build
```

## Test accounts (when `SEED_DEMO_USERS=true`)
| User | Password | Role |
|------|----------|------|
| `tech1` | `tech1` | Technician |
| `manager1` | `manager1` | Manager |
| `cfo1` | `cfo1` | Chef of Finances |
| `mod1` | `mod1` | Moderator |
