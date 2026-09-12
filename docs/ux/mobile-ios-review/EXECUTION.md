# Predare pentru execuție — Mobile Technician UX

## Punct de intrare

**GitHub Issues sunt sursa de adevăr:** [#45 — Mobile Technician UX](https://github.com/AdelinPOA/xpenses-kotlin/issues/45).

Acest fișier este ghidul local de pornire. Issues sunt autosuficiente pentru un agent într-un checkout care nu are încă acest director. Capturile din [analiză](README.md) sunt dovezi suplimentare, nu o dependență obligatorie de implementare.

**Stare:** plan de execuție publicat, nu implementare finalizată. Taskurile independente pot începe acum; integrarea persistenței are un gate tehnic explicit. Nu declarăm întregul proiect gata pentru execuție AFK înainte de închiderea acelui gate.

## Contractul aprobat

Technician: **fotografie → ciornă păstrată automat → verificare imediată → confirmare explicită → lista cheltuielilor**, cu cheltuiala evidențiată.

- Opțiune secundară: „Confirmă și scanează următorul”. Nu captura în serie ca flux implicit.
- Verificarea întreruptă poate fi reluată; bonul și datele păstrate nu dispar la navigare/reîncărcare.
- Salvarea, verificarea și statusul financiar sunt concepte distincte. „De verificat” nu este un nou status financiar introdus implicit.
- Nicio trimitere automată de Report și nicio nouă regulă de blocare a trimiterii raportului fără o decizie explicită.
- Fotografie, alegere fișier și introducere manuală rămân disponibile. Nu pierdem contextul unui Report din care utilizatorul a început adăugarea.
- Păstrăm slate/orange, fontul de sistem, burgerul și navigarea de jos specifică rolului.
- **Îmbunătățirea vizibilă a frontendului mobil este obligatorie.** Refactorizarea și backendul singure nu satisfac cererea.

## Ordine și dependențe

| Issue | Livrabil | Poate începe | Dependențe |
| --- | --- | --- | --- |
| [#47](https://github.com/AdelinPOA/xpenses-kotlin/issues/47) | Formular/listă compacte, ierarhie vizuală și navigare lizibilă | **Da — primul rezultat vizibil** | Niciuna tehnică; coordonare fișiere comune |
| [#48](https://github.com/AdelinPOA/xpenses-kotlin/issues/48) | Bulk lizibil și feedback corect la erori | Da | Coordonare locale/fișiere comune |
| [#46](https://github.com/AdelinPOA/xpenses-kotlin/issues/46) | Contract concret de persistență/verificare/integrare OCR | Da, în paralel | Investigație, nu rescriere backend |
| [#49](https://github.com/AdelinPOA/xpenses-kotlin/issues/49) | Flux complet de verificare imediată și reluare | Nu încă | #46 + #47 + orice prerechizite backend identificate în #46 |
| [#50](https://github.com/AdelinPOA/xpenses-kotlin/issues/50) | Viewer fullscreen și lifecycle modal accesibil | După fundația UI | #47 + #48; designul poate fi pregătit în paralel |
| [#51](https://github.com/AdelinPOA/xpenses-kotlin/issues/51) | Dovezi finale și validare fizică iPhone | După implementare | #47 + #48 + #49 + #50; necesită persoană cu iPhone |

Dependențele sunt publicate nativ în GitHub și repetate în corpurile issues. #46/#47/#48 au `ready-for-agent`. #49/#50/#51 au `needs-triage` până când prerechizitele și specificația concretă sunt integrate. #51 devine `ready-for-human` când implementarea este gata. #45 este tracking, nu un task de implementat monolitic.

Un singur agent poate începe cu #47, continua #48, apoi executa investigația #46 înainte de #49. Cu mai mulți agenți, #47 și #46 sunt cele mai potrivite pentru paralelizare; coordonați modificările EN/RO și fișierele comune înainte de #48.

## Cum trebuie să arate îmbunătățirea

### Lista — 375×667, fără tastatură/bannere de eroare

```text
[burger]           Xpenses          [profil]
Cheltuieli                         [+ Adaugă]
[Caută…                         ] [Filtre 2]
--------------------------------------------
Comerciant                         123,45 EUR
Dată · status financiar
--------------------------------------------
Comerciant                          56,78 EUR
Dată · status financiar
...
[navigare de jos păstrată]
```

Exportul și importul bulk rămân în acțiuni secundare. Categoria/statusurile complete nu ocupă permanent primul ecran. Nu eliminăm date sau funcționalități doar ca să obținem capturi mai curate.

### Verificarea — structură țintă, semantica vine în #49

```text
Verifică cheltuiala
[miniatură bon] [Vezi bonul]       De verificat

Sumă                           Monedă
[123,45                   ]    [EUR]
Comerciant
[                                ]
Dată                         Categorie
[                ]           [        ]
[Detalii suplimentare ▾]

[Confirmă datele]
 Confirmă și scanează următorul
```

În #47 se implementează compoziția compactă peste comportamentul actual. Nu afișăm stări de verificare inventate înainte de existența persistenței și nu redenumim salvarea actuală ca „Confirmă” fără semantica aferentă.

### Măsurători obligatorii

Cu aceleași fixtures reprezentative, minimum trei cheltuieli, fără tastatură/bannere:

- La 375×667, prima cheltuială începe la **y ≤ 300**, cu minimum **două rânduri obișnuite complete** vizibile deasupra navigării de jos.
- În New Expense la 375×667, câmpul sumei începe la **y ≤ 300**, față de ≈478 în audit.
- Bulk la 375/390: câmp sumă **≥96 px**, monedă **≥80 px**; valoare `1234.56` și dată lizibile. Stivuim/incrementăm spațiul dacă formatul localizat cere mai mult.
- Câmpuri editabile mobile **≥16 px**, inclusiv în landscape la 844 px; regiuni tactile țintă **≥44 CSS px**.
- Contrast text normal de navigare **≥4,5:1**, inclusiv dark mode.
- Zero overflow de document, dar verificăm și clipping-ul intern, nu doar `scrollWidth`.

Dimensiunile sunt criterii pentru fixture-ul definit, nu o promisiune că toate mesajele de eroare sau orice text mărit vor încăpea într-un singur ecran. La text mărit se păstrează reflow și accesibilitate, nu se micșorează fonturile pentru a păstra densitatea.

## Gate tehnic — ce știm deja

1. `capture/page.tsx` așteaptă `scanReceipt` înainte de `saveNewExpense`. Persistența internă a celui din urmă nu protejează automat intervalul dinaintea apelului.
2. `expenseSaving.ts` și `offlineQueue.ts` gestionează crearea și atașarea de Receipts; recordul este eliminat după sincronizare. Nu constituie singure un registru permanent de verificare.
3. Editarea Expense-ului existent în `ExpenseForm.tsx` refuză offline. Reluarea corecturilor necesită o extensie explicită și teste, nu doar un badge.
4. Modelul Expense inspectat nu are un câmp explicit de verificare a Technician-ului. #46 decide reprezentarea, compatibilitatea istoricului, cazul manual, corecturile după confirmare și conflictele de versiune.
5. #35–#43 specifică promovarea idempotentă de către OcrJob într-un Expense și Receipt. UI nu trebuie să creeze separat încă un Expense după promovare. Închiderea unui issue de planificare nu dovedește că backendul aferent este implementat.
6. ADR 0004 și #35 descriu implicit captură continuă/stay-on-camera. Alegerea actuală este verificarea imediată. #46 aliniază explicit partea de navigare, fără a slăbi procesarea de fundal, retenția și izolarea pe proprietar.
7. ADR 0002 acceptă at-least-once pentru salvarea normală până la idempotency backend; nu promitem exact-once global doar pentru că fluxul OcrJob are alte garanții.
8. ADR 0005 privește pornirea offline și cache-ul. Testele cu service worker blocat nu validează acele garanții. Evicția storage-ului și perioada dinainte de commit trebuie explicate onest.

#46 produce contractul selectat, DTO/API/migrații necesare, matricea de tranziții/eșecuri și teste concrete, apoi completează #49 cu prerechizitele identificate. Nu presupunem rezolvate aceste întrebări.

## Coordonare și protejarea lucrărilor existente

- Citiți `AGENTS.md`, `frontend/AGENTS.md`, `CONTEXT.md` și ADR-urile relevante. Înainte de cod Next, citiți ghidurile instalate relevante cerute de frontend/AGENTS.
- Refaceți `git status --short` și citiți issues curente. În timpul predării au apărut modificări paralele în backend OCR, `CONTEXT.md`, audituri, pagini frontend, traduceri și teste.
- [#44](https://github.com/AdelinPOA/xpenses-kotlin/issues/44) deține download-ul din Expense detail, unele touch targets și guard-ul Report creation. Nu îl dublați. `type="button"` din ExpenseForm este un caz separat, inclus în #47.
- [#23](https://github.com/AdelinPOA/xpenses-kotlin/issues/23) documentează manager workflow; nu revenim peste navigarea specifică rolului. [#22](https://github.com/AdelinPOA/xpenses-kotlin/issues/22) și [#35](https://github.com/AdelinPOA/xpenses-kotlin/issues/35) sunt context de integrare, nu invitații la refactorizare suplimentară.
- Fără `git add .`, reset/checkout global ori includerea codului altui agent în commit. Stage numai fișierele/hunks proprii. Nu modificați migrarea OCR concurentă ca scurtătură pentru verificarea Expense-ului.
- Acest handoff nu autorizează deploy sau scrieri în date reale.

## Verificare executabilă

Din `frontend/`, după verificarea configului curent și alegerea unui port liber:

```bash
npx tsc --noEmit
npm run lint
npm run i18n:check

# Spec adăugat de #47; rulați după ce există.
PLAYWRIGHT_PORT=3100 PLAYWRIGHT_ORIGIN=http://localhost:3100 \
  npx playwright test tests/expenses/mobile-layout.spec.ts \
  --project=mobile-chromium --project=mobile-webkit

# Regresii existente; aceleași setări de port/origin dacă le suprascrieți.
PLAYWRIGHT_PORT=3100 PLAYWRIGHT_ORIGIN=http://localhost:3100 \
  npx playwright test tests/expenses/list.spec.ts \
  tests/expenses/fx-editor.spec.ts tests/offline/offline-queue.spec.ts \
  tests/navigation/sidebar.spec.ts tests/responsive/overflow.spec.ts \
  --project=mobile-chromium --project=mobile-webkit --project=desktop
```

- #48 adaugă `tests/expenses/bulk-review.spec.ts`; #49 adaugă `tests/expenses/capture-review.spec.ts` și extinde offline; #50 adaugă `tests/expenses/receipt-viewer.spec.ts`.
- Projects mobile au implicit 412×849 în configul inspectat. Noile teste setează explicit **375×667** și **390×844**, plus **844×390** și **1280×800** pentru verificările relevante.
- Refolosiți `tests/shared/mocks.ts`, cu API interceptat și date deterministe. Delayed/rejected mutation tests trebuie să verifice feedback-ul, nu doar request count.
- `test:e2e:mobile` include fluxuri autentificate care pot crea Expense-uri. Nu îl rulați pe producție și nu ocoliți autentificarea. Folosiți conturi/date izolate.
- `serviceWorkers: "block"` este default în suite. Testarea pornirii offline necesită separat context cu service worker activ și environment izolat; precizați exact ce a fost testat.
- Dacă se schimbă backendul, #46/#49 precizează testele de module, controller, migrare și concurență; rulați-le cu `./gradlew test --tests ...` din `backend-kotlin-jpa`, apoi regresiile relevante. Nu inventați nume de teste înainte de a inspecta implementarea.
- Atașați comenzi, rezultate, capturi înainte/după și limite. Erorile preexistente sunt raportate separat, nu ascunse și nu „reparate” prin schimbări fără legătură.

## Definition of done

Fiecare task UI livrează comportament testat **și capturi comparabile**, nu doar CSS ori snapshots regenerate. Parent #45 nu se închide cu backend-only changes.

#51 consolidează dovezile și marchează separat testele fizice Safari/PWA, tastatură, cameră, safe-area, VoiceOver, text mărit și revenire după întrerupere. Fără iPhone disponibil: **Not tested / gate deschis**, nu „iOS verified”.

## Prompt de pornire pentru alt agent

> Execută issue #47 din AdelinPOA/xpenses-kotlin ca primul milestone vizibil al #45. Citește mai întâi #45, #47 și #44, instrucțiunile repo și statusul working tree; păstrează modificările paralele. Livrează formular/listă mai compacte și nav lizibilă cu testele și capturile înainte/după cerute. Nu aștepta backendul și nu inventa verificare/autosave. Separat, #46 rezolvă contractul de persistență înainte de #49. GitHub Issues sunt sursa de adevăr; docs/ux/mobile-ios-review este auditul suplimentar dacă este disponibil.
