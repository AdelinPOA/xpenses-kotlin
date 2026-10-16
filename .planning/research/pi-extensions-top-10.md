# Pi ecosystem: top 10 pachete/extensii recente

**Snapshot:** 2026-09-16 (UTC). **Scope:** primele 10 pachete terțe afișate pe [galeria oficială pi.dev/packages](https://pi.dev/packages), nu o afirmație absolută despre calitate. Ordinea este cea a galeriei la momentul cercetării; pagina afișa și activitate relativă (de exemplu `1d`, `5d`) și utilizare lunară. Versiunile și datele de publicare de mai jos vin din registry-ul npm, iar repo-urile din manifestele npm/pi.dev.

## Metodologie și limitări

Am verificat pagina oficială pi.dev, manifestul versiunii `latest` din [npm registry](https://registry.npmjs.org/), URL-ul de repository declarat de pachet și câmpurile `engines`, `dependencies`, `peerDependencies` și `pi`. Pentru compatibilitate am comparat cerințele declarate cu Pi local `0.85.1` și Node local `22.23.1`. Un pachet Pi poate conține simultan extensii, skills și prompt templates; „package” înseamnă distribuția instalabilă, iar „extension” înseamnă cod încărcat de Pi. Nu am instalat niciun candidat și nu am evaluat comportamentul runtime, calitatea codului sau siguranța serverelor terțe.

## Top 10 verificat

| # | Pachet (clasificarea pi.dev) | Versiune npm / publicare | Repo | Ce aduce | Compatibilitate și risc principal |
|---:|---|---|---|---|---|
| 1 | [`pi-mcp-adapter`](https://www.npmjs.com/package/pi-mcp-adapter) — extension | `2.34.0`, 2026-09-14 | [`nicobailon/pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) | Adaptor MCP pentru Pi; manifestul declară extension + skills. | Node `>=20`; multe dependențe MCP/keyring. MCP poate executa/invoca servere și poate expune date sau credențiale; instalează doar după audit și configurează serverele explicit. |
| 2 | [`pi-web-access`](https://www.npmjs.com/package/pi-web-access) — extension | `0.29.0`, 2026-09-10 | [`nicobailon/pi-web-access`](https://github.com/nicobailon/pi-web-access) | Căutare web, fetch URL, clone GitHub, PDF, YouTube și video local; suportă mai mulți provideri. | Fără `engines` declarate; peer deps Pi 0. Instalația poate necesita chei/API externe; conținutul web este neîncrezător și poate introduce prompt injection. Cel mai relevant candidat pentru cercetare web. |
| 3 | [`pi-subagents`](https://www.npmjs.com/package/pi-subagents) — package (extension + skills + prompts) | `0.68.0`, 2026-09-15 | [`nicobailon/pi-subagents`](https://github.com/nicobailon/pi-subagents) | Delegare single-agent și workflow-uri multi-agent scriptate. | Peer deps Pi; dependențe `jiti`, `yaml`, `undici`, `acorn`. Se suprapune direct cu `pi-fork` și `pi-minimal-subagent` instalate local; nu le combina fără test de conflict și alegere clară a unui singur orchestrator. |
| 4 | [`@companion-ai/feynman`](https://www.npmjs.com/package/@companion-ai/feynman) — package (extension + skills + prompts) | `0.3.47`, 2026-08-26 | [`companion-inc/feynman`](https://github.com/companion-inc/feynman) | Agent CLI orientat pe research, construit pe Pi și alphaXiv. | Node `>=22.22.0 <26`; multe dependențe grele (3D/biologie/PDF/OTel). Poate fi disproporționat pentru coding Kotlin/Next; footprint și suprafață de supply-chain mari. |
| 5 | [`@juicesharp/rpiv-ask-user-question`](https://www.npmjs.com/package/@juicesharp/rpiv-ask-user-question) — extension | `2.10.1`, 2026-09-13 | [`juicesharp/rpiv-mono`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) | Chestionar structurat pe care modelul îl poate folosi înainte să ghicească; opțiuni tipizate. | Peer deps Pi + `@juicesharp/rpiv-i18n`; risc redus relativ, dar necesită testarea UI/TUI și a interacțiunii în RPC/print. Recomandat dacă vrei mai puține presupuneri ale agentului. |
| 6 | [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) — extension | `2.10.1`, 2026-09-13 | [`juicesharp/rpiv-mono`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-todo) | Todo live overlay care supraviețuiește `/reload` și compaction. | Peer deps Pi + `@juicesharp/rpiv-i18n`; poate concura cu fluxurile repo-ului bazate pe issue tracker/`todo.md`. Instalează-l doar dacă accepți ca modelul să gestioneze un al doilea sistem de stare. |
| 7 | [`pi-lens`](https://www.npmjs.com/package/pi-lens) — extension (și skills) | `4.1.6`, 2026-09-10 | [`apmantza/pi-lens`](https://github.com/apmantza/pi-lens) | Feedback în timp real din LSP, lintere, formattere, type-checking și analiză structurală. | Node `>=22.19.0`; distribuie `dist/index.js`, depinde de ast-grep și JSON-RPC. Pentru repo-ul acesta poate fi util, dar trebuie verificate toolchain-ul Kotlin/Gradle și frontend-ul; altfel adaugă zgomot și procese de fundal. |
| 8 | [`pi-background-tasks`](https://www.npmjs.com/package/pi-background-tasks) — extension | `2.5.0`, 2026-09-04 | [`ismailsaleekh/pi-background-tasks`](https://github.com/ismailsaleekh/pi-background-tasks) | Task-uri shell durabile, delegare read-only și workflow-uri prin procese Pi copil. | Node `>=22.19.0`; rulează shell/procese copil. Se suprapune cu fork/subagent și crește riscul de procese uitate sau task-uri care ating workspace-ul; folosește scope read-only/allowlist. |
| 9 | [`billion-context`](https://www.npmjs.com/package/billion-context) — package/extension | `0.1.116`, 2026-09-16 | [`ranxianglei/billion-context`](https://github.com/ranxianglei/billion-context) | Proxy de compresie context pentru sesiuni foarte lungi; manifestul declară `./dist/agent/pi.js`. | Node `>=20`, fără peer deps; versiune `0.x` și publicare foarte recentă. Se suprapune cu `pi-observational-memory` (compaction/memory); nu le combina înainte de benchmark pe pierdere de context, latență și cost. |
| 10 | [`context-mode`](https://www.npmjs.com/package/context-mode) — package (MCP + extension + skills) | `1.0.169`, 2026-06-29 | [`mksglu/context-mode`](https://github.com/mksglu/context-mode) | Execuție sandbox, knowledge base FTS5 și search orientat pe intenție; distribuie adaptor Pi și skills. | Node `>=22.5.0`; depinde de `better-sqlite3` (addon nativ); licență `Elastic-2.0`. Pachet mai vechi decât restul snapshot-ului, cu risc de instalare nativă/licențiere și suprapunere cu web/context tools. |

### Dovezi de registry decisive

Manifestele npm au furnizat următoarele câmpuri verificabile:

- `pi-mcp-adapter`: `engines.node = >=20`, `pi.extensions = ["./index.ts"]`, plus dependențe MCP/keyring.
- `pi-subagents`: `pi.extensions`, `pi.skills`, `pi.prompts` și peer deps Pi.
- `@companion-ai/feynman`: `engines.node = >=22.22.0 <26`, extensii/skills/prompts și dependențe OpenTelemetry/PostHog.
- `pi-lens`, `pi-background-tasks`, `context-mode`: cerințe Node declarate și entrypoint-urile de extensie din câmpul `pi`.

Surse reproducibile: [npm registry pentru pachetele listate](https://registry.npmjs.org/pi-mcp-adapter), [pi-web-access](https://registry.npmjs.org/pi-web-access), [pi-subagents](https://registry.npmjs.org/pi-subagents), [feynman](https://registry.npmjs.org/@companion-ai%2Ffeynman), [ask-user](https://registry.npmjs.org/@juicesharp%2Frpiv-ask-user-question), [rpiv-todo](https://registry.npmjs.org/@juicesharp%2Frpiv-todo), [pi-lens](https://registry.npmjs.org/pi-lens), [background-tasks](https://registry.npmjs.org/pi-background-tasks), [billion-context](https://registry.npmjs.org/billion-context), [context-mode](https://registry.npmjs.org/context-mode).

## Audit local Pi / `xpenses-kotlin`

Verificare locală efectuată la 2026-09-16:

- Pi `0.85.1`, Node `22.23.1`; `pi --list-models` și startup-ul RPC au reușit.
- Packages globale configurate în `/root/.pi/agent/settings.json`: `git:github.com/elpapi42/pi-fork`, `git:github.com/elpapi42/pi-minimal-subagent` și `npm:pi-observational-memory@3.0.4`. Primele două Git packages nu au ref pinned.
- Extensions globale: `herdr-agent-state.ts` și `orca-agent-status.ts`. Herdr este managed și are `@ts-nocheck`; Orca are un warning de typecheck `TS2367` la linia 115, fără dovadă de failure la startup. Recomand actualizarea prin integrarea Orca, nu editarea manuală a fișierului managed.
- `pi-fork` rulează 80/80 teste și folosește namespace-ul actual `@earendil-works/*`; este alegerea sănătoasă dintre cele două mecanisme de delegare instalate.
- `pi-minimal-subagent` rulează 2/2 teste, dar sursa importă namespace-ul legacy `@mariozechner/*` și nu există agenți configurați în `/root/.pi/agent/agents/` sau `.pi/agents/` pentru acest proiect. Este redundant momentan și prezintă risc de compatibilitate cu Pi actual.
- Observational Memory `3.0.4` se încarcă (`/om:status`, `/om:view`); npm latest verificat este `3.1.3`, deci upgrade-ul trebuie testat separat de orice alt sistem de compaction/context.
- Proiectul are 37 de `SKILL.md` cu frontmatter valid, toate descoperite când proiectul este trusted. `skills-lock.json` are aceleași 37 nume, dar hash-ul SHA-256 al fiecărui fișier local diferă de hash-ul din lockfile; lockfile-ul este stale și trebuie regenerat sau skills trebuie readuse la snapshot-ul lock-uit.
- În sesiunea trusted, Pi expune 42 skill commands distincte: skills globale din `/root/.agents/skills` plus cele 37 project-local, cu shadowing pe nume comune. `frontend/skills/SKILL.md` nu este încărcat automat deoarece nu se află într-o locație Pi standard (`.agents/skills` / `.pi/skills`) și nu este declarat în settings.
- Skills-urile `claude-handoff` și `git-guardrails-claude-code` sunt specifice Claude Code. Mai multe skills Matt Pocock spun „Call the Skill tool”; Pi folosește comenzi `/skill:name`, deci aceste handoff-uri/aliasuri nu sunt Pi-native și ar trebui adaptate sau marcate ca portabile doar pentru Claude/Codex.

## Recomandare pentru `xpenses-kotlin`

1. **Adaugă întâi `pi-web-access`**, dar numai dacă vrei cercetare web repetabilă în Pi; păstrează sursele citate și tratează rezultatul web ca input neîncrezător.
2. **Testează `pi-lens` separat**, deoarece este singurul candidat din top care poate ajuta direct la feedback continuu pe cod; verifică integrarea Gradle/Kotlin și Next.js înainte de activare globală.
3. **Alege un singur sistem de delegare:** păstrează `pi-fork` + `pi-minimal-subagent` sau evaluează `pi-subagents` într-o sesiune izolată. Nu instala toate trei în aceeași configurație fără verificarea conflictelor de tool.
4. **Actualizează separat `pi-observational-memory`**, care nu apare în primele 10 carduri pi.dev, dar este deja instalat local și are versiunea npm `3.1.3` publicată la 2026-09-16; `3.0.4` local este pinned și nu se actualizează automat.
5. **Nu recomand momentan** `billion-context` împreună cu observational memory și nu recomand `context-mode` decât dacă ai nevoie explicită de MCP/SQLite și accepți licența Elastic-2.0.

Instalarea pachetelor Pi execută cod cu acces complet la sistem; documentația oficială avertizează că extensiile pot executa cod arbitrar, iar skills pot instrui modelul să ruleze executabile: [Pi docs — Pi Packages / Security](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md#install-and-manage). Preferă versiuni npm pinned sau tag/commit Git și auditează sursa înainte de `pi install`.

## Acțiuni aplicate după audit — 2026-09-16

- Eliminat global `pi-minimal-subagent` și checkout-ul său; păstrat un singur orchestrator, `pi-fork`, pinned la commitul `e69725c396030cb9e3b119286beca53f47a2305f`.
- Actualizat global `pi-observational-memory` la `3.1.3`.
- Instalat project-local, cu versiuni pinned: `pi-web-access@0.29.0`, `pi-lens@4.1.6` și `@juicesharp/rpiv-ask-user-question@2.10.1`.
- Declarat `frontend/skills` în `.pi/settings.json`; conținutul este deja identic cu skill-ul global `frontend-design`, iar Pi păstrează sursa globală în caz de coliziune de nume.
- Reparat typecheck-ul Orca prin lărgirea tipului constantei `CONFIGURED_HOOK_PATH`; typecheck-ul TypeScript trece.
- Rulat `npx skills update --project --yes`; lockfile-ul a fost actualizat (singura schimbare de conținut raportată a fost hash-ul pentru `retro`).
- Verificat startup Pi și RPC trusted fără erori: comenzile `websearch`, `lens-*`, `om:*` se înregistrează, iar `pi --list-models` trece.
