# Admin Components

## Overview
Admin configuration UI components for managing LLM OCR providers, model test execution, receipt/delegation model fallback chains, and delegation email parsing rules with live simulation previews.

## Interface
- `[DelegationParsingSettings.tsx:"use client"]` — Client component module.
- `[DelegationParsingSettings.tsx:DelegationParsingSettings]` — Default-exported component `DelegationParsingSettings()` (no props); queries `parsingQueryKey` (`[...imapKeys.all, "parsing"]`) via `getDelegationParsingConfig` and `ocrKeys.config()` via `getOcrConfig` (`staleTime: 60_000`), and consumes `useTranslations("delegationParsing")`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` — Internal component `ParsingEditor({ initialSettings, initialOcrConfig }: { initialSettings: DelegationParsingConfig; initialOcrConfig: OcrConfig })` handling guidance editing, delegation model chain editing, email preview simulation, and navigation to `/admin/ocr`.
- `[DelegationParsingSettings.tsx:PreviewFields]` — Internal component `PreviewFields({ parsed }: { parsed: EmailSimulationParsed })` rendering parsed delegation email fields in a `<dl>`.
- `[OcrModelSettings.tsx:"use client"]` — Client component module.
- `[OcrModelSettings.tsx:OcrModelSettings]` — Default-exported component `OcrModelSettings({ initialConfig }: { initialConfig: OcrConfig })` for configuring OCR providers, models, and fallback chains.
- `[OcrModelSettings.tsx:ChainField]` — Internal union type `"receipt_model_chain" | "delegation_model_chain"`.
- `[OcrModelSettings.tsx:TestResult]` — Internal type `{ success: boolean; message: string }`.

## Invariants
- `[DelegationParsingSettings.tsx:DelegationParsingSettings]` Renders `ParsingEditor` only when both `settingsQuery.data` and `modelsQuery.data` are truthy; renders an error alert with retry when either query has `isError`, and a loading status otherwise.
- `[DelegationParsingSettings.tsx:ParsingEditor]` `settingsDirty` and `chainDirty` are derived via `JSON.stringify` comparison against `settingsBaseline` and `chainBaseline`; `useEffect` resyncs from props only when `!settingsProtected.current` (`settingsDirty || saveSettings.isPending`) and `!chainProtected.current` (`chainDirty || saveChain.isPending || Boolean(selectedModel)`).
- `[DelegationParsingSettings.tsx:ParsingEditor]` `availableModels` is restricted to `initialOcrConfig.models` with `model.active && model.tested`; `chainable` excludes IDs already in `chain`; `chainInvalid` is true if any ID in `chain` is missing from `availableModels`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` Guidance and chain `<fieldset>` elements are disabled while `saving` (`saveSettings.isPending || saveChain.isPending`); guidance save requires `settingsDirty && !saving`; chain save requires `chainDirty && !chainInvalid && !saving`; preview requires `Boolean(body.trim()) && !preview.isPending && !saving`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` Textarea `maxLength` bounds are `12000` (`instructions`), `20000` (`examples`), `6000` (`output_instructions`), and `50000` (`body`); `previewStale` is true when `preview.data.fingerprint !== JSON.stringify(request)`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` `saveChain` submits only `{ delegation_model_chain: modelChain }` to `updateOcrConfig` so receipt prompts and `receipt_model_chain` are not overwritten.
- `[DelegationParsingSettings.tsx:PreviewFields]` Renders only entries in `fields` whose value in `parsed` is truthy.
- `[OcrModelSettings.tsx:OcrModelSettings]` `isDirty` is `configDirty || keysDirty` (`JSON.stringify(config) !== JSON.stringify(baseline)` or any non-empty entry in `apiKeys`); `useEffect` skips resetting local state from `initialConfig` whenever `protectDraft.current` (`isDirty || Object.values(providerDraft).some(Boolean) || Boolean(modelDraft.model_id || modelDraft.display_name)`) or `busy.current` (`saveMutation.isPending || testMutation.isPending`) is true.
- `[OcrModelSettings.tsx:OcrModelSettings]` Changing a provider's `base_url` or entering a non-empty `api_key` calls `invalidateProviderModels(providerId)`, setting `active: false, tested: false` on that provider's models, stripping them from `receipt_model_chain` and `delegation_model_chain`, and clearing their `testResults`.
- `[OcrModelSettings.tsx:OcrModelSettings]` `updateModel` resets `active: false, tested: false` and deletes `testResults[modelId]` when `provider_id` or `model_id` changes, and removes `modelId` from both `receipt_model_chain` and `delegation_model_chain` when identity changes or `active === false`.
- `[OcrModelSettings.tsx:OcrModelSettings]` Model `active` checkbox is disabled when `!model.tested`; `availableModels` for chains requires `model.active && model.tested`; test/retest button is disabled when `testMutation.isPending || isDirty || !provider || model.active`.
- `[OcrModelSettings.tsx:OcrModelSettings]` Add Provider requires non-empty trimmed `name` and `base_url`; Add Model requires `config.providers.length > 0` and non-empty trimmed `model_id` and `display_name` (defaulting `provider_id` to `config.providers[0]?.id`).
- `[OcrModelSettings.tsx:OcrModelSettings]` Entire `<fieldset>` is disabled while `mutationPending` (`saveMutation.isPending || testMutation.isPending`); submit buttons are disabled when `!isDirty || saveMutation.isPending` and `submit` returns early if `mutationPending`.

## Side Effects
- `[DelegationParsingSettings.tsx:DelegationParsingSettings]` Executes React Query GET requests via `getDelegationParsingConfig` (`parsingQueryKey`) and `getOcrConfig` (`ocrKeys.config()`), and refetches both on Retry.
- `[DelegationParsingSettings.tsx:ParsingEditor]` `saveSettings` cancels `parsingQueryKey` queries, calls `updateDelegationParsingConfig`, updates local `settings`/`settingsBaseline`, and writes `queryClient.setQueryData(parsingQueryKey, saved)`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` `saveChain` cancels `ocrKeys.config()` queries, calls `updateOcrConfig({ delegation_model_chain: modelChain })`, updates local `chain`/`chainBaseline`, writes `queryClient.setQueryData(ocrKeys.config(), saved)`, and invalidates `imapKeys.config()`.
- `[DelegationParsingSettings.tsx:ParsingEditor]` `preview` invokes `previewDelegationEmail(request)` with `{ body_text, parser, settings, model_chain }`.
- `[OcrModelSettings.tsx:OcrModelSettings]` `saveMutation` cancels `ocrKeys.config()` queries, calls `updateOcrConfig(payload)` (including `api_key: apiKeys[id] ?? ""` per provider), updates local state and `queryClient.setQueryData(ocrKeys.config(), saved)` via `applySavedConfig`, and triggers `toast.success` or `toast.error`.
- `[OcrModelSettings.tsx:OcrModelSettings]` `testMutation` cancels `ocrKeys.config()` queries, runs `testOcrModel(modelId)` followed by `getOcrConfig()`, calls `applySavedConfig(saved)`, updates `testResults[modelId]`, and triggers `toast.success` or `toast.error`.
- `[OcrModelSettings.tsx:OcrModelSettings]` `addProvider` and `addModel` generate client-side UUIDs via `crypto.randomUUID()`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
