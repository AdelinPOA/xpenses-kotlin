# Internationalization (`frontend/i18n`)

## Overview
Provides Next.js and `next-intl` localization configuration, message bundle loading, fallback/error handling, and client-side locale synchronization for English (`en`) and Romanian (`ro`) across server and client rendering paths.

## Interface
- `[config.ts:LOCALES]`: Exported readonly tuple `["en", "ro"]` of supported locale codes.
- `[config.ts:Locale]`: Exported union type `"en" | "ro"` derived from `LOCALES`.
- `[config.ts:mapLocaleToBcp47]`: Exported `Record<Locale, string>` mapping `"en"` to `"en-EU"` and `"ro"` to `"ro-RO"`.
- `[messages.ts:Messages]`: Exported TypeScript type inferred from `../messages/en.json` (`typeof en`).
- `[messages.ts:default]`: Exported default `Record<Locale, Messages>` mapping `"en"` and `"ro"` to their imported JSON message bundles.
- `[request.ts:default]`: Exported default `next-intl/server` `getRequestConfig` async handler returning `{ locale, messages, timeZone, onError, getMessageFallback }`.
- `[runtime.ts:onError]`: Exported function `(error: Error) => void` handling i18n runtime errors.
- `[runtime.ts:getMessageFallback]`: Exported function `({ error, namespace, key }: { error?: Error; namespace?: string; key: string }) => string` returning English fallback strings or the missing key path.
- `[LocaleProvider.tsx:useLocaleContext]`: Exported React hook returning `{ locale: Locale; setLocale: (locale: Locale) => void }` from `LocaleContext`.
- `[LocaleProvider.tsx:writeLangCookie]`: Exported function `(locale: string) => void` writing the `"lang"` cookie.
- `[LocaleProvider.tsx:default]`: Exported default `"use client"` component `LocaleProvider({ children }: { children: React.ReactNode })` providing `LocaleContext` and `NextIntlClientProvider`.

## Invariants
- `[config.ts:LOCALES]` & `[messages.ts:default]`: Supported locales are restricted to `"en"` and `"ro"`, and both message dictionaries must conform to the `Messages` schema of `en.json`.
- `[request.ts:default]`: Server request locale resolves from the `"lang"` cookie when valid in `LOCALES`, defaulting to `"en"` otherwise; `timeZone` is fixed to `"Europe/Bucharest"`.
- `[runtime.ts:getMessageFallback]`: Traverses dot-delimited `namespace.key` (or `key`) in `enMessages`, returning the resolved value only when `typeof value === "string"`, and otherwise returning the dot-joined path (or `key`).
- `[LocaleProvider.tsx:resolveInitialLocale]`: Initial client locale resolves in priority order: valid `"lang"` cookie in `LOCALES` -> `navigator.language.startsWith("ro")` (`"ro"`) -> `"en"` (defaulting to `"en"` when `window` is undefined).
- `[LocaleProvider.tsx:LocaleProvider]`: Synchronizes locale from `user?.language` when valid in `LOCALES`, falling back to a valid `"lang"` cookie in `LOCALES`; wraps children in `NextIntlClientProvider` with `timeZone="Europe/Bucharest"`.
- `[LocaleProvider.tsx:writeLangCookie]`: Writes the `"lang"` cookie with `encodeURIComponent(locale)`, `Path=/`, `SameSite=Lax`, `Max-Age=31536000`, and appends `; Secure` when `window.location.protocol === "https:"`.

## Side Effects
- `[request.ts:default]`: Reads request cookies via `next/headers` `cookies()` and dynamically imports `../messages/${locale}.json`.
- `[runtime.ts:onError]`: Emits `console.warn("[i18n] Missing key:", error.message)` when `process.env.NODE_ENV === "development"`.
- `[LocaleProvider.tsx:readCookie]` & `[LocaleProvider.tsx:resolveInitialLocale]`: Reads `document.cookie` and `navigator.language`.
- `[LocaleProvider.tsx:writeLangCookie]` & `[LocaleProvider.tsx:setLocale]`: Mutates `document.cookie` (`lang`), updates React state (`setLocaleState`), and mutates `document.documentElement.lang`.
- `[LocaleProvider.tsx:LocaleProvider]`: Runs `useEffect` hooks that synchronize `setLocale`, call `setCurrentLocale(locale)` in `@/lib/format`, and set `document.documentElement.lang = locale`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
