# Design: Prioritate Manuală pentru Sursele de Prețuri Combustibil

**Data:** 2026-11-21  
**Dimensiune:** Schimbare mică (extinde pattern-ul existent `fx-providers`)

## 1. Scop și Context
Rolurile **moderator** (`mod`) și **CFO** (`chef_finance`) trebuie să poată vizualiza cele 3 surse externe de prețuri combustibil (`PRETCARBURANT_LIVE`, `PRETCARBURANT_DATA`, `EU_WEEKLY_OIL_BULLETIN`) și să le ajusteze manual ordinea de prioritate din pagina de Setări (`/admin/settings`).

## 2. Obiective, Non-obiective și Constrângeri
* **Obiective:**
  * Persistarea ordinii configurate de `mod` și `chef_finance` în `app_settings` (cheia `fuel_provider_priority`).
  * Aplicarea ordinii configurate la health-check (`FuelPriceHealthService`), în statusul afișat în UI, și la rezolvarea prețurilor pentru ziua curentă (`HttpFuelPriceProvider.resolve`).
  * Păstrarea regulii pentru date din trecut (`requestedDate < today`): `PRETCARBURANT_DATA` rămâne automat înaintea `PRETCARBURANT_LIVE`, păstrând poziția relativă a `EU_WEEKLY_OIL_BULLETIN`.
* **Non-obiective:**
  * Nu se modifică fallback-ul manual final (`MANUAL_SETTING`), care rămâne întotdeauna ultima opțiune dacă toate cele 3 surse externe eșuează.
  * Nu se adaugă migrații Flyway noi și nu se schimbă UX-ul cu drag-and-drop (păstrăm butoanele Sus/Jos din UI-ul FX).
* **Anti-obiective:**
  * Permisiunea unui utilizator fără rol `mod` sau `chef_finance` de a modifica prioritatea, sau pierderea uneia dintre cele 3 surse la salvare.

## 3. Abordări Analizate
* **Abordarea A (Aleasă):** Oglindirea pattern-ului `fx-providers` — stocare în `app_settings` (`fuel_provider_priority`), endpoint-uri `GET`/`PATCH /api/settings/fuel-providers` în `AppSettingsController` cu `@PreAuthorize("hasAnyRole('mod', 'chef_finance')")`, și butoane Sus/Jos + Salvare în `FuelPriceHealthCard` (`SettingsClient.tsx`).
* **Abordarea B (Respinsă):** Tabel dedicat printr-o migrație Flyway nouă — supradimensionat pentru 3 valori într-o singură listă globală.
* **Abordarea C (Respinsă):** Reordonare drag-and-drop — inconsistentă cu secțiunea FX din aceeași pagină.

## 4. Arhitectură și Modificări Propuse
* **Backend (`HttpFuelPriceProvider` & `FuelPriceHealthService`):**
  * `HttpFuelPriceProvider` primește `AppSettingRepository` opțional/injectat și expune `getProviderPriority(): List<FuelPriceSource>` și `saveProviderPriority(priority: List<FuelPriceSource>)`, normalizând lista (deduplicare, filtrare la `EXTERNAL_SOURCES`, completare cu sursele lipsă).
  * `FuelPriceHealthService.runHealthCheck()` și `getHealthStatus()` citesc `httpFuelPriceProvider.getProviderPriority()` în locul constantei `EXTERNAL_SOURCES`.
  * `HttpFuelPriceProvider.resolve()` folosește `getProviderPriority()` pentru azi/viitor, iar pentru `requestedDate.isBefore(today)` asigură că `PRETCARBURANT_DATA` apare înaintea `PRETCARBURANT_LIVE`.
* **API (`AppSettingsController` + DTO-uri):**
  * `GET /api/settings/fuel-providers` și `PATCH /api/settings/fuel-providers` protejate cu `@PreAuthorize("hasAnyRole('mod', 'chef_finance')")`, returnând `{ providers, available_providers }`.
* **Frontend (`SettingsClient.tsx`, `lib/api.ts`, `lib/fuelStatus.ts`, mesaje i18n):**
  * `FuelPriceHealthCard` încarcă `GET /api/settings/fuel-providers`, afișează ordinea configurată cu butoane **Sus / Jos** (`ArrowUp` / `ArrowDown`) și buton **Salvează**, invalidând query-urile relevante la succes.

## 5. Rămas la Latitudinea Implementării
* Denumirile exacte ale DTO-urilor (`FuelProvidersOut`, `FuelProvidersUpdate`) și ale cheilor i18n (`ro`/`en`), plus testele unitare/de integrare pentru permisiuni, ordine istorică și UI.
