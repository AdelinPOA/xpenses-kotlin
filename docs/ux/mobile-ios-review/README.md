# Analiză UI/UX mobil — accent iOS

Status: direcția de produs este agreată; acest document descrie fluxul țintă, nu o implementare finalizată.

## Decizii confirmate în discuție

- Prioritizăm experiența mobilă a Technician-ului: captură → verificare → ciornă salvată clar, apoi lista de cheltuieli. Experiența managerului vine ulterior.
- După fotografierea unui bon, fluxul implicit este verificarea imediată a bonului și datelor extrase (sumă, monedă, comerciant), cu posibilitatea corectării înainte de continuare. Captura în serie nu este fluxul implicit.
- Păstrăm automat bonul și datele extrase dacă verificarea este întreruptă. Ciorna este prezentată ca „De verificat”, iar Technician-ul poate relua verificarea. Salvarea automată nu echivalează cu confirmarea datelor sau trimiterea raportului.
- „De verificat” descrie aici comportamentul dorit în UI; reprezentarea sa în model și persistență nu este încă decisă. Nu introducem implicit un nou status de Expense.
- După confirmarea datelor, revenim implicit la lista cheltuielilor și evidențiem cheltuiala tocmai verificată. O acțiune secundară „Confirmă și scanează următorul” permite continuarea capturii.
- Utilizatorul a delegat alegerile de UX rămase către recomandările analizei. Păstrăm paleta, burgerul și navigarea de jos; prioritizăm fluxul Technician-ului, nu un redesign simultan al tuturor rolurilor.

## Flux țintă și recomandări de implementare

1. **Adaugă cheltuială:** toate intrările echivalente duc la aceeași alegere: Fotografiază bon / Alege fișier / Introdu manual. Camera este acțiunea principală pe mobil; navigarea de jos rămâne navigare.
2. **Captură și prelucrare:** feedback distinct pentru păstrarea bonului și extragerea datelor. Nu afișăm „Salvat” înainte să existe confirmarea persistenței relevante. O întrerupere nu trebuie să piardă bonul deja păstrat.
3. **Verificare imediată:** miniatură compactă care deschide bonul pe tot ecranul; sumă și monedă proeminente; comerciant, dată și categorie accesibile fără blocuri decorative înaintea lor. Descrierea și datele fiscale sunt în detalii expandabile. OCR nu înlocuiește validarea existentă.
4. **Ciornă recuperabilă:** salvarea automată și verificarea sunt concepte distincte. „De verificat” rămâne vizibil până la confirmarea explicită; stările locale/offline și erorile nu sunt prezentate ca salvare pe server. La reluare restaurăm datele păstrate, nu doar fotografia.
5. **Confirmare:** acțiune principală „Confirmă datele”, cu revenire la listă și evidențierea cheltuielii. Acțiune secundară „Confirmă și scanează următorul”, fără concurență vizuală egală cu prima. Niciuna nu trimite automat un Report.
6. **Lista cheltuielilor:** titlu compact, o singură acțiune principală, căutare și Filtre cu număr de filtre active. Exportul în meniul secundar. Intrările „De verificat” pot fi identificate și reluate ușor.

### Recuperare și interacțiuni mobile

- Dacă OCR eșuează, păstrăm bonul disponibil și oferim completare manuală sau reîncercare; nu blocăm verificarea într-un spinner fără ieșire.
- Dacă salvarea eșuează, mesaj contextual și reîncercare; nu navigăm ca și cum ar fi reușit. Prevenim acțiunile duplicate cât timp operația relevantă este în curs.
- Dacă utilizatorul abandonează, ciorna rămâne recuperabilă; ștergerea ei este o acțiune explicită, separată de închiderea ecranului.
- Câmpuri editabile de cel puțin 16 px în configurațiile mobile vizate, ținte tactile confortabile, focus vizibil și text de eroare lângă câmp.
- Acțiunea principală rămâne accesibilă fără să acopere câmpul activ; comportamentul cu tastatura și barele Safari se validează pe iPhone, nu se presupune din emulare.
- Viewerul oferă închidere evidentă, revenire la poziția de editare și alternative la gesturi. Nu reutilizăm taburile Details/Receipt dacă acestea ascund contextul confirmării.

### Etapizare

1. Corectitudine și fundație mobilă: erori de salvare vizibile, submit accidental eliminat, câmpuri bulk utilizabile, contrast și traduceri coerente.
2. Fluxul captură → verificare → listă și persistența necesară pentru reluare; apoi simplificarea listei.
3. Uniformizarea viewerului și a prezentării modale; Report și dashboard manager într-o etapă ulterioară.

### Verificări de acceptare

- Din fiecare intrare de adăugare, Technician-ul recunoaște același flux; există și introducere manuală fără bon.
- După extragere, se deschide verificarea, nu camera următoare.
- O ciornă păstrată și neconfirmată poate fi reluată după navigare/reîncărcare, cu starea de verificare corectă.
- Confirmarea revine la listă; acțiunea secundară confirmă înainte de a deschide următoarea captură.
- OCR eșuat, upload eșuat, salvare eșuată și lipsa conexiunii au feedback distinct și recuperare verificată; niciun succes fals.
- La 375 px, suma și moneda sunt lizibile integral, iar controalele nu se suprapun. Testăm română/engleză și light/dark.
- Pe iPhone real, câmpul activ și confirmarea rămân accesibile cu tastatura deschisă; testăm Safari, standalone și VoiceOver.

**De investigat tehnic înainte de implementarea fluxului:** cum persistăm verificarea explicită separat de statusul financiar al Expense-ului; când este bonul efectiv recuperabil în raport cu OCR; ce garantează coada offline pentru bon și modificări. Acestea nu se rezolvă printr-un badge local sau printr-un mesaj de succes optimist.

## Metodă și limite

- Sursa frontend din working tree, pornită separat pe `http://localhost:3100`.
- Browser WebKit prin Playwright, profil iPhone 13; viewport-uri 390×844, 375×667 și 844×390. Nu este un iPhone real.
- Date sintetice din `frontend/tests/shared/mocks.ts`; cererile către backend interceptate în browser. Nicio scriere în date reale, nicio schimbare a autentificării aplicației.
- Inspecție vizuală: dashboard Technician și manager, Expenses, New Expense, Capture, Reports, detaliu Report, Profile, sidebar și bulk review.
- Verificări suplimentare: română + dark mode pentru Expenses/New Expense/Reports; axe WCAG A/AA pe aceste trei ecrane; upload bulk cu răspuns simulat HTTP 500.
- Niciun overflow orizontal al documentului în ecranele măsurate. Asta **nu** garantează utilizabilitatea: câmpurile bulk sunt comprimate intern.
- Nu am verificat pe dispozitiv tastatura iOS, barele Safari dinamice, camera/HEIC, VoiceOver, pinch-to-zoom, PWA standalone sau safe-area fizică. Nu am executat întregul test suite, OCR real ori salvări reale.
- Valorile numerice din fixtures nu sunt coerente între toate răspunsurile; diferențele de total din capturi nu constituie dovezi de erori de calcul.
- Capturile atașate sunt redimensionate pentru documentare. Indicatorul Next dev a fost ascuns numai în browserul de audit, fără modificarea sursei.

## Concluzie

Fundația merită păstrată: burger, navigare de jos cu etichete, paleta slate/orange, fontul de sistem, suportul light/dark. Problema principală este distribuirea atenției: prea multe acțiuni și filtre înaintea conținutului, căi diferite pentru aceeași intenție și feedback insuficient despre ce s-a salvat.

## Probleme prioritare

### 1. Revizuirea bulk nu este utilizabilă confortabil pe telefon

**Confirmat în browser:** la 375 px câmpul sumei măsoară **18 px lățime**, moneda 64 px și data 80,5 px. Suma nu se poate citi, data este tăiată. La 390 px suma are tot numai 20 px.

Sursă: `frontend/components/expenses/BulkReviewDrawer.tsx:236–344`. Thumbnail, formular în două coloane și ștergere concurează pe același rând, după două niveluri de padding.

Propunere: antet cu miniatură/comerciant/meniu; apoi câmpuri pe lățimea disponibilă, cu un rând proiectat explicit pentru sumă + monedă. Pentru loturi mari, explorat un bon pe ecran cu „Următorul”, fără a impune această alegere înainte de clarificarea utilizării.

![Bulk review la 375 px](bulk-375.png)

### 2. Erorile bulk arată ca o încheiere normală

**Confirmat în browser:** HTTP 500 la upload produce „0 draft expense(s) created”, „No expenses created”, „All expenses are saved as draft” și „Done reviewing”. Nu explică eroarea și nu oferă retry.

**Confirmat în cod:** erorile de editare/ștergere sunt înghițite; câmpurile cu `defaultValue` pot păstra vizual o modificare nesalvată. Antetul spune „edit before saving”, deși modificările sunt salvate la blur.

Sursă: `frontend/components/expenses/BulkReviewDrawer.tsx:41–93, 194–218, 265–330`.

Propunere: diferențiere explicită între încărcare eșuată, ciornă creată, modificare în curs și modificare nesalvată; retry contextual și text care descrie momentul real al salvării.

![Upload eșuat, fără explicație](bulk-failure.png)

### 3. Adăugarea unei cheltuieli are căi neuniforme

**Confirmat în cod și interfață:** „New” din dashboard deschide `/expenses/capture`; butonul flotant cu cameră și „Add expense” deschid `/expenses/new`. Primul flux creează automat ciorne și revine la captură; al doilea deschide un formular lung cu salvare explicită.

Surse: `frontend/app/dashboard/DashboardClient.tsx:647–658, 778–794`; `frontend/app/expenses/capture/page.tsx:66–137`; `frontend/app/expenses/ExpensesClient.tsx:352–363`.

Propunere: o intrare predictibilă pentru intenția „Adaugă cheltuială”, cu opțiuni clare Fotografiază / Alege fișier / Introdu manual. Păstrăm posibilitatea capturii succesive existente, dar decidem separat dacă verificarea datelor se face imediat sau ulterior. Nu confundăm salvarea ciornei cu trimiterea unui Report.

![Fluxul Capture existent](capture.png)

### 4. Lista Expenses acordă prea mult spațiu comenzilor

**Confirmat în browser:** la 375×667 se vede aproximativ o singură cheltuială înainte de bara de jos. Antetul, trei acțiuni, șase filtre de status, căutarea și categoria preced lista. Primele două butoane de adăugare concurează cu Export, o acțiune probabil secundară pe teren.

Sursă: `frontend/app/expenses/ExpensesClient.tsx:280–409`.

Propunere: titlu compact, o acțiune principală, căutare + Filtre cu număr de filtre active; exportul în meniul secundar. Categoria și statusurile complete într-un panou de filtre. Rândul de cheltuială: comerciant și sumă, apoi dată/status; descrierea și acțiunile rare în detaliu. Nu micșorăm suprafețele tactile ca să câștigăm densitate.

![Lista Expenses la 375 px](expenses-375.png)

### 5. Formularul nou întârzie accesul la datele importante

**Confirmat în browser:** la 375 px primul câmp, suma, începe la y≈478; comerciantul la y≈729. Înainte apar titlu, taburi, zonă mare de upload și încă un buton de cameră. Mai jos există o a treia intrare de atașare. Tabul Receipt ascunde formularul și implicit acțiunea sa de salvare.

Sursă: `frontend/components/expenses/ExpenseForm.tsx:377–411, 438–574`; `frontend/components/expenses/ReceiptScanner.tsx:93–113`.

Propunere: miniatură compactă, sumă + monedă, comerciant/data/categorie, detalii opționale expandabile, o acțiune principală clară. Verificarea bonului să aibă un viewer mobil dedicat și revenire predictibilă la editare.

**Bug suplimentar din cod, nereprodus prin salvare:** butonul de descărcare a unui Receipt existent nu are `type="button"` în interiorul formularului (`ExpenseForm.tsx:515–518`), deci poate declanșa submit neintenționat.

### 6. Protecțiile iOS sunt incomplete

**Măsurat în browser:** căutarea și categoria din Expenses au font de **12 px**. Câmpurile formularului Expense au 16 px în portrait, dar 14 px la 844 px lățime din cauza `sm:text-sm`.

Surse: `frontend/app/expenses/ExpensesClient.tsx:384–403`; `frontend/components/expenses/ExpenseForm.tsx:438–510`.

Acestea sunt riscuri de lizibilitate și focus zoom pe iOS; **zoom-ul automat nu a fost confirmat pe un iPhone real**. Recomandare: 16 px pentru câmpurile editabile și validare cu tastatura reală.

Safe-area top/bottom există în AppShell; nu recomand eliminarea ei. În landscape, insets laterale și interacțiunea dintre tastatură, salvarea sticky și navigarea fixă necesită testare dedicată.

### 7. Paleta poate rămâne; folosirea ei și tipografia trebuie disciplinate

**Confirmat prin axe:** în dark mode, tabul activ are contrast **3,31:1** (`#c2410c` pe `#151b2b`), sub 4,5:1 pentru textul respectiv de 10 px. Identificat pe Expenses, New Expense și Reports.

Surse: `frontend/app/globals.css:22–38`; `frontend/components/layout/AppShell.tsx:105–106`.

Propunere: token separat pentru text/icon activ în dark mode; nu trebuie schimbat automat fundalul tuturor butoanelor portocalii. Etichete de navigare 11–12 px, fără uppercase/tracking excesiv. Păstrăm fontul de sistem și cifrele tabulare pentru sume. Reducem contururile, umbrele și cardurile imbricate înainte de a adăuga efecte.

**Confirmat vizual în română:** „New Expense”, instrucțiunile de scanare și „Take photo” rămân în engleză între etichete românești. „Upload receipts” este de asemenea hard-coded. Consecvența limbajului face parte din UX, nu doar din traducere.

![Formular dark mode, locale română](new-expense-dark-ro.png)

### 8. Report și dashboard trebuie să prioritizeze starea și următoarea acțiune

**Confirmat vizual:** detaliul Report începe cu exporturi, semnătură și multe date despre delegare; sumele și explicația stării apar ulterior. Pentru mobil, propun rezumat/stare/acțiune următoare înainte de metadate, iar exporturile într-un meniu secundar.

Sursă: `frontend/app/reports/[id]/ReportDetailClient.tsx`.

**Confirmat în cod:** cardul verde „Approved” din dashboard folosește `paidCount`/`paidEur` și trimite la `status=paid`. „Aprobat” și „Plătit” nu trebuie prezentate ca același lucru. Nu este o concluzie extrasă din totalurile fictive.

Sursă: `frontend/app/dashboard/DashboardClient.tsx:711–726`.

**Confirmat în browser și cod:** dashboardul managerului afișează literal `return (` înaintea listei. Antetul explicativ și două intrări „Open Review Queue” împing lista în jos.

Sursă: `frontend/components/dashboard/PendingReportsTable.tsx:347–350`.

### 9. Overlays: comportament comun, nu doar aspect comun

Review drawers declară `aria-modal`, dar nu implementează aceleași reguli de focus/inert ca Sidebar. `useBodyScrollLock` blochează scroll-ul, nu rezolvă focus-ul. Viewerul de Receipt folosește `touch-none` după zoom, fără implementare proprie de pinch.

Surse: `frontend/components/expenses/BulkReviewDrawer.tsx:100–127`; `frontend/components/reports/ReportReceiptsDrawer.tsx:118–138`; `frontend/components/expenses/ReceiptPreview.tsx:76–103`; `frontend/components/layout/Sidebar.tsx:88–129`.

Propunere tehnică, dacă intră în implementare: un **module** pentru prezentarea modală, cu **interface** mică, care deține focus, Escape, scroll lock, revenirea la elementul de deschidere și safe-area. Callers nu ar trebui să repete aceste reguli. Comportamentul VoiceOver și pinch trebuie verificat pe dispozitiv.

## Direcție vizuală propusă, încă neaprobată

„Registru de cheltuieli pentru teren”: conținut lizibil, sume ușor de comparat, stare clară și captură rapidă. Identitatea vine din asocierea miniaturii bonului cu suma și starea salvării, nu din carduri decorative sau grafice omniprezente.

- Păstrăm slate/orange, light/dark, burger și taburile de navigare.
- Un singur accent principal pe ecran; stările financiare au culori consecvente și etichete explicite.
- Separăm navigarea de acțiuni: nu transformăm un tab într-un buton de cameră mascat.
- Densitate prin eliminarea redundanței, nu prin reducerea fonturilor ori a țintelor tactile.
- Nu imităm Liquid Glass doar pentru a „arăta iOS”. Prioritare sunt interacțiunile predictibile și lizibilitatea.

## Ordine recomandată pentru discuție

1. Clarificăm fluxul mobil prioritar și momentul verificării OCR.
2. Remediem bulk layout/feedback, submit-ul accidental, contrastul și etichetele greșite.
3. Unificăm intrarea în captură și simplificăm formularul/lista.
4. Reordonăm Report și dashboard, apoi uniformizăm overlays.
5. Validăm pe iPhone real: Safari + PWA, tastatură, fotografie/fișiere, landscape, VoiceOver, text mărit și conexiune întreruptă.

Nu a fost modificat codul aplicației. Nu a fost creat un ADR: nu avem încă o decizie arhitecturală aprobată. Nu a fost schimbat glosarul de domeniu.

## Surse de design consultate

- [Apple HIG — Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars): navigare, nu acțiuni; etichete scurte; stabilitate între ecrane.
- [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): ierarhie, feedback la apăsare, ținte tactile confortabile; recomandarea de 44×44 pt este pentru platforma nativă, nu o certificare automată a CSS-ului web.
- [Apple HIG — Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data): minimizarea introducerii manuale, valori implicite, validare contextuală.
- [Apple HIG — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility): contrast, text mărit, gesturi alternative, VoiceOver.
- [Playwright — Emulation](https://playwright.dev/docs/emulation): verificări prin profil de dispozitiv; nu înlocuiește testarea fizică iOS.
