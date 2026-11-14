# Plan — Continuarea P2 și mobile OCR

## Context

P2 este deja lansat și împins. CI run `39200180463` a eșuat doar la jobul **Compose Integration & Security Gates**, pasul „Audit frontend dependencies”; celelalte trei joburi au trecut, iar pașii Docker/integration au fost săriți. Cauza este consistentă cu alertă Dependabot #76: `braces@3.0.3`, HIGH, fără versiune reparată. `docs/agents`/issue #54 documentează că npm propune un downgrade major incompatibil; politica audit nu trebuie slăbită.

Issue #60 rămâne deschis: patru surse OCR terminale expirate nu au bytes lizibili în storage local sau în backup-ul verificat. Prezența lor remote și istoricul cleanup/migrare nu sunt stabilite. Cleanup-ul de producție este dezactivat.

# 46, #47, #48 și #49 sunt deschise. #47 este fundația UI independentă; #48 are implementarea P2, dar îi lipsesc dovezi de acceptanță; #46 trebuie să livreze contractul persistent de verificare, fără implementare în acel issue; #49 depinde de #46 și #47. Acest plan nu autorizează modificări de producție, activarea retenției sau relaxarea politicii de securitate

## Abordare recomandată

1. Închide clasificarea CI pe baza logului/artefactului și reconfirmă starea alertelor; păstrează auditul strict.
2. Investigează #60 exclusiv read-only și documentează dovezile/necunoscutele. Nu repara istoricul și nu activa cleanup.
3. Continuă separat lucrările mobile: #47 (UI), #48 (acceptanță lipsă) și #46 (contract). Acestea pot avansa independent, cu coordonarea fișierelor comune și fără a repeta implementarea P2.
4. Începe #49 numai după ce contractul #46, fundația #47 și prerechizitele backend identificate sunt rezolvate și integrate.
5. Tratează #50/#51 ca pași ulteriori ai inițiativei părinte #45, nu ca livrabile P2 deja incluse; nu închide #45 fără viewer și gate-ul fizic iPhone cerute de acesta.

## Fișiere și dovezi

- **CI/securitate:** `.github/workflows/ci.yml`, `scripts/check-npm-audit.mjs`, issue #54 și alertă #76.
- **Retenție:** issue #60; `docs/contracts/ocr-source-resume-and-retention.md`; `docs/reviews/p2-save-correctness.md`; evidența protejată din `/root/xpenses-deployments/p2-2e9f8372a5be/` (`state.json`, `OPERATIONS.txt`). Nu copia secrete, path-uri de sursă sau conținut privat în issue/loguri.
- **Contract și integrare:** issue #46, #47, #48, #49; issue părinte #45; contextul #35–#43; `docs/ux/mobile-ios-review/EXECUTION.md`; `docs/adr/0002-at-least-once-expense-recovery.md`, `docs/adr/0004-asynchronous-receipt-capture-and-ocr-staging.md`, `docs/adr/0007-durable-expense-save-idempotency.md`.
- **Posibile modificări ulterioare, doar după aprobarea execuției:** #46 — contract/ADR și prerechizite; #47 — `frontend/app/expenses/ExpensesClient.tsx`, `frontend/components/expenses/ExpenseForm.tsx`, `ReceiptScanner.tsx`, layout/CSS, locale și teste; #48 — doar ce lipsește din `BulkReviewDrawer.tsx`, `BulkUploadZone.tsx`, teste și dovezi; #49 — suprafețele de capture/review, offline queue și API/DTO/backend exact conform contractului.
- **Acum:** singurul fișier creat pentru această propunere este `plans/p2-follow-up.md`. Nu sunt planificate editări de cod în etapa de investigație.

## Reutilizare și constrângeri

- Folosește `gh run view` și artefactul `compose-integration-evidence` pentru CI; issue #54 indică politica și motivul pentru care nu se aplică downgrade-ul sugerat.
- Folosește issue #60 și evidența existentă de deploy/backup; contractul existent definește eligibilitatea terminal-only, protecția joburilor active/shared și comportamentul la eșec.
- Folosește criteriile deja publicate în issues. Nu presupune că issue-urile închise #35–#43 dovedesc singure disponibilitatea API-urilor în cod.
- Înainte de orice cod: citește instrucțiunile repo, verifică `git status` și păstrează modificările locale preexistente. Nu folosi staging global, reset, stash sau deploy din checkout-ul murdar.
- Pentru #60: nu afișa credențiale; nu citi/descărca imagini; nu șterge, repara sau curăța date. Orice remediere/activare necesită dovezi de backup și aprobare explicită separată.

## Pași

- [x] **CI:** obține logul/artefactul jobului și confirmă că auditul a respins lanțul dev-only `@next/eslint-plugin-next → fast-glob → micromatch → braces`; notează că `npm audit --omit=dev` era curat, iar full audit rămâne blocat până la un remediu compatibil. Nu slăbi checkerul, nu ascunde alerta și nu aplica downgrade major.
- [x] **#60:** verifică providerul real și istoricul migrare/cleanup, apoi reconciliază referințele cu storage/backup prin verificări sigure de metadate. Separă clar dovezile directe de presupuneri; menține `OCR_SOURCE_CLEANUP_ENABLED=false`.
- [x] **#47:** confirmă ce implementare/capturi există deja; completează doar criteriile lipsă pentru layout mobil și regresie. Nu inventa stări de verificare înainte de contract.
- [x] **#48:** verifică implementarea existentă și probele de acceptanță; acoperă erori/valori nesalvate, dimensiuni mobile și EN/RO × light/dark. Nu rescrie codul P2 deja livrat fără defect reproductibil.
- [x] **#46:** inspectează implementarea curentă și contextul #35–#43; finalizează matricea stărilor, persistența verificării/corrections, comportamentul offline, compatibilitatea istoricului, versiuni/conflicte și punctele de retry/idempotency. Documentează alinierea navigării imediate cu ADR 0004 fără să slăbească procesarea durabilă; actualizează #49 cu prerechizite concrete. Fără implementare în #46.
- [x] **#49:** după închiderea gate-urilor, implementează fluxul conform contractului: OCR/Receipt/Expense IDs autoritative, reluare fără duplicate, corecturi și confirmare durabile, izolare pe owner și erori recuperabile. Creează issue-uri backend separate dacă #46 identifică API-uri lipsă.
- [x] **Închidere:** raportează rezultate, limite și probe; actualizează doar issues/documentația relevante. #60 rămâne deschis dacă proveniența/recoverabilitatea nu este demonstrată. Planifică separat #50/#51 înainte de închiderea #45.

### Checkpoint 2026-10-19

# 49 nu a început: dependențele live #47, #61 și #62 sunt încă deschise. #46 este închis, dar fundația UI #47 este încă neintegrată, iar implementările #61/#62 au rămas necomise în worktree-ul izolat `agent/p2-backend-prereqs` bazat pe `9d0277c`. Conform gate-ului „resolved and integrated”, pasul #49 rămâne necompletat până la integrarea acestor schimbări. Statusul și probele au fost adăugate la issues #49, #61 și #62. Nicio modificare de cod sau deploy nu s-a făcut în această continuare; #60 rămâne deschis, cleanup-ul OCR este dezactivat, iar #50/#51 rămân planuri separate înainte de închiderea #45

## Verificare

- CI: identifică jobul/step-ul și audit finding-ul exact; nu considera „green” un rerun care omite sau relaxează verificarea.
- #60: confirmă printr-o verificare read-only că cleanup rămâne oprit, nu s-au șters/modificat surse și nu s-au expus date private.
- Frontend: `npm run typecheck`, `npm run i18n:check` și testele Playwright vizate, serial/worker unic pe acest host; capturi comparabile la 375×667 și 390×844, EN/RO și light/dark, plus landscape/desktop unde cere issue-ul. WebKit emulat nu este validare pe iPhone.
- Backend, numai pentru schimbări contractate: teste țintite cu `./gradlew test --tests <ClassName> --no-daemon`, fără suite multi-container ample pe hostul de producție.
- Înainte de orice test/deploy cu resurse, verifică `free -h` și `df -h /`; nu folosi `docker compose down`, nu șterge volume și nu restaura DB peste scrieri live.
