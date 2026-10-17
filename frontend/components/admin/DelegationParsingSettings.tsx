"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { isAxiosError } from "axios";
import { getOcrConfig, updateOcrConfig } from "@/lib/api/admin";
import {
  getDelegationParsingConfig,
  previewDelegationEmail,
  updateDelegationParsingConfig,
} from "@/lib/api/delegationParsing";
import type { OcrConfig } from "@/lib/types/admin";
import type {
  DelegationParsingConfig,
  DelegationPreviewRequest,
} from "@/lib/types/delegationParsing";
import type { EmailSimulationParsed } from "@/lib/types/report";
import { imapKeys, ocrKeys } from "@/lib/queryKeys";

const parsingQueryKey = [...imapKeys.all, "parsing"] as const;
const inputClass =
  "w-full min-w-0 rounded-lg border border-border bg-input px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm";
const buttonClass =
  "min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-card-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = `${buttonClass} bg-primary text-white hover:bg-primary-hover`;

function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ detail?: string }>(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return fallback;
}

/** Email-only settings; receipt prompts and the receipt model chain are never submitted. */
export default function DelegationParsingSettings() {
  const t = useTranslations("delegationParsing");
  const settingsQuery = useQuery({
    queryKey: parsingQueryKey,
    queryFn: getDelegationParsingConfig,
    staleTime: 60_000,
  });
  const modelsQuery = useQuery({
    queryKey: ocrKeys.config(),
    queryFn: getOcrConfig,
    staleTime: 60_000,
  });

  return (
    <section aria-labelledby="delegation-parsing-heading" className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="border-l-4 border-primary pl-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("email_only")}</p>
        <h2 id="delegation-parsing-heading" className="mt-1 text-xl font-bold text-foreground">{t("heading")}</h2>
        <p className="mt-2 text-sm text-muted">{t("description")}</p>
      </div>
      {settingsQuery.data && modelsQuery.data ? (
        <ParsingEditor initialSettings={settingsQuery.data} initialOcrConfig={modelsQuery.data} />
      ) : settingsQuery.isError || modelsQuery.isError ? (
        <div role="alert" className="space-y-2 text-sm text-rose-700 dark:text-rose-300">
          <p>{t("load_failed")}</p>
          <button type="button" className={buttonClass} onClick={() => {
            void settingsQuery.refetch();
            void modelsQuery.refetch();
          }}>{t("retry")}</button>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted">{t("loading")}</p>
      )}
    </section>
  );
}

function ParsingEditor({
  initialSettings,
  initialOcrConfig,
}: {
  initialSettings: DelegationParsingConfig;
  initialOcrConfig: OcrConfig;
}) {
  const t = useTranslations("delegationParsing");
  const tr = useTranslations("reports");
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(() => ({ ...initialSettings }));
  const [settingsBaseline, setSettingsBaseline] = useState(() => ({ ...initialSettings }));
  const [chain, setChain] = useState(() => [...initialOcrConfig.delegation_model_chain]);
  const [chainBaseline, setChainBaseline] = useState(() => [...initialOcrConfig.delegation_model_chain]);
  const [selectedModel, setSelectedModel] = useState("");
  const [body, setBody] = useState("");
  const [parser, setParser] = useState<"ai" | "local">("ai");
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(settingsBaseline);
  const chainDirty = JSON.stringify(chain) !== JSON.stringify(chainBaseline);
  const settingsProtected = useRef(false);
  const chainProtected = useRef(false);

  const saveSettings = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: parsingQueryKey }),
    mutationFn: updateDelegationParsingConfig,
    onSuccess: (saved) => {
      setSettings({ ...saved });
      setSettingsBaseline({ ...saved });
      queryClient.setQueryData(parsingQueryKey, saved);
    },
  });
  const saveChain = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: ocrKeys.config() }),
    // A partial update is essential: never resubmit a stale receipt chain or catalog.
    mutationFn: (modelChain: string[]) => updateOcrConfig({ delegation_model_chain: modelChain }),
    onSuccess: (saved) => {
      setChain([...saved.delegation_model_chain]);
      setChainBaseline([...saved.delegation_model_chain]);
      queryClient.setQueryData(ocrKeys.config(), saved);
      void queryClient.invalidateQueries({ queryKey: imapKeys.config() });
    },
  });
  const preview = useMutation({
    mutationFn: async (request: DelegationPreviewRequest) => ({
      fingerprint: JSON.stringify(request),
      result: await previewDelegationEmail(request),
    }),
  });

  settingsProtected.current = settingsDirty || saveSettings.isPending;
  chainProtected.current = chainDirty || saveChain.isPending || Boolean(selectedModel);
  useEffect(() => {
    if (settingsProtected.current) return;
    setSettings({ ...initialSettings });
    setSettingsBaseline({ ...initialSettings });
  }, [initialSettings]);
  useEffect(() => {
    if (chainProtected.current) return;
    setChain([...initialOcrConfig.delegation_model_chain]);
    setChainBaseline([...initialOcrConfig.delegation_model_chain]);
  }, [initialOcrConfig]);

  const request: DelegationPreviewRequest = {
    body_text: body,
    parser,
    settings,
    model_chain: chain,
  };
  const previewStale = Boolean(preview.data && preview.data.fingerprint !== JSON.stringify(request));
  const availableModels = initialOcrConfig.models.filter((model) => model.active && model.tested);
  const chainable = availableModels.filter((model) => !chain.includes(model.id));
  const chainInvalid = chain.some((id) => !availableModels.some((model) => model.id === id));
  const saving = saveSettings.isPending || saveChain.isPending;

  function changeSetting(field: keyof DelegationParsingConfig, value: string) {
    setSettings((current) => ({ ...current, [field]: value }));
    saveSettings.reset();
  }

  function changeChain(next: string[]) {
    setChain(next);
    saveChain.reset();
  }

  function moveModel(index: number, offset: number) {
    const next = [...chain];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    changeChain(next);
  }

  return (
    <div className="space-y-6">
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <legend className="mb-3 text-sm font-semibold text-foreground">{t("guidance_heading")}</legend>
        <p className="text-xs text-muted">{t("contract_hint")}</p>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>{t("instructions")}</span>
          <textarea className={inputClass} rows={5} maxLength={12000} value={settings.instructions} onChange={(event) => changeSetting("instructions", event.target.value)} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>{t("examples")}</span>
          <textarea className={`${inputClass} font-mono`} rows={5} maxLength={20000} value={settings.examples} onChange={(event) => changeSetting("examples", event.target.value)} aria-describedby="delegation-examples-hint" />
        </label>
        <p id="delegation-examples-hint" className="text-xs text-muted">{t("examples_hint")}</p>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>{t("output_instructions")}</span>
          <textarea className={inputClass} rows={3} maxLength={6000} value={settings.output_instructions} onChange={(event) => changeSetting("output_instructions", event.target.value)} />
        </label>
        {settingsDirty && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("guidance_unsaved")}</p>}
        {saveSettings.isError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(saveSettings.error, t("save_failed"))}</p>}
        {saveSettings.isSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t("guidance_saved")}</p>}
        <button type="button" className={primaryClass} disabled={!settingsDirty || saving} onClick={() => saveSettings.mutate({ ...settings })}>
          {saveSettings.isPending ? t("saving") : t("save_guidance")}
        </button>
      </fieldset>

      <fieldset disabled={saving} className="min-w-0 space-y-3 border-t border-border pt-5">
        <legend className="text-sm font-semibold text-foreground">{t("chain_heading")}</legend>
        <p className="text-xs text-muted">{t("chain_hint")}</p>
        <Link href="/admin/ocr" className="inline-block text-sm font-medium text-primary hover:underline">{t("manage_models")}</Link>
        {!initialOcrConfig.ocr_enabled && <p className="text-sm text-amber-800 dark:text-amber-300">{t("ai_disabled")}</p>}
        {chainInvalid && <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">{t("chain_invalid")}</p>}
        {chain.length ? (
          <ol className="space-y-2" aria-label={t("chain_heading")}>
            {chain.map((id, index) => {
              const model = initialOcrConfig.models.find((item) => item.id === id);
              const name = model?.display_name ?? id;
              return (
                <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="break-words text-sm font-medium text-foreground">{name}</p>
                    <p className="text-xs text-muted">{index === 0 ? t("primary") : t("fallback")}</p>
                  </div>
                  <button type="button" className={buttonClass} disabled={index === 0} aria-label={t("move_up_model", { name })} onClick={() => moveModel(index, -1)}>↑</button>
                  <button type="button" className={buttonClass} disabled={index === chain.length - 1} aria-label={t("move_down_model", { name })} onClick={() => moveModel(index, 1)}>↓</button>
                  <button type="button" className={buttonClass} aria-label={t("remove_model", { name })} onClick={() => changeChain(chain.filter((item) => item !== id))}>{t("remove")}</button>
                </li>
              );
            })}
          </ol>
        ) : <p className="text-sm text-muted">{t("chain_empty")}</p>}
        {chainable.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-1.5 text-sm font-medium text-foreground">
              <span>{t("model_to_add")}</span>
              <select className={inputClass} value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                <option value="">{t("select_model")}</option>
                {chainable.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}
              </select>
            </label>
            <button type="button" className={buttonClass} disabled={!chainable.some((model) => model.id === selectedModel)} onClick={() => {
              changeChain([...chain, selectedModel]);
              setSelectedModel("");
            }}>{t("add_model")}</button>
          </div>
        )}
        {chainDirty && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("chain_unsaved")}</p>}
        {saveChain.isError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(saveChain.error, t("save_failed"))}</p>}
        {saveChain.isSuccess && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{t("chain_saved")}</p>}
        <button type="button" className={buttonClass} disabled={!chainDirty || chainInvalid || saving} onClick={() => saveChain.mutate([...chain])}>
          {saveChain.isPending ? t("saving") : t("save_chain")}
        </button>
      </fieldset>

      <div className="space-y-4 border-t border-border pt-5">
        <h3 className="text-base font-semibold text-foreground">{t("preview_heading")}</h3>
        <p id="delegation-preview-hint" className="rounded-lg bg-primary/5 p-3 text-sm text-foreground">{t("preview_hint")}</p>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>{t("parser")}</span>
          <select className={inputClass} value={parser} onChange={(event) => setParser(event.target.value === "local" ? "local" : "ai")}>
            <option value="ai">{t("ai_parser")}</option>
            <option value="local">{t("local_parser")}</option>
          </select>
        </label>
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>{t("sample_email")}</span>
          <textarea className={`${inputClass} font-mono`} rows={9} maxLength={50000} value={body} onChange={(event) => setBody(event.target.value)} aria-describedby="delegation-preview-hint" />
        </label>
        <button type="button" className={primaryClass} disabled={!body.trim() || preview.isPending || saving} onClick={() => preview.mutate(request)}>
          {preview.isPending ? t("previewing") : t("run_preview")}
        </button>
        {preview.isError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(preview.error, t("preview_failed"))}</p>}
        {preview.data && (
          <div aria-live="polite" className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
            {previewStale && <p role="status" className="border-l-2 border-amber-500 pl-3 text-sm text-amber-800 dark:text-amber-300">{t("preview_stale")}</p>}
            <p className="text-xs font-semibold text-muted">{t("result_parser", { parser: preview.data.result.active_parser === "ai" ? t("ai_parser") : t("local_parser") })}</p>
            {!preview.data.result.success ? (
              <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{preview.data.result.error || t("preview_failed")}</p>
            ) : preview.data.result.parsed ? (
              <PreviewFields parsed={preview.data.result.parsed} />
            ) : <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t("preview_failed")}</p>}
            {preview.data.result.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
              {preview.data.result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>}
          </div>
        )}
      </div>
      <p className="border-t border-border pt-4 text-xs text-muted">{t("existing_reports_hint")} {tr("delegation_order_nr")}: Auftrag / Kundenauftrag.</p>
    </div>
  );
}

function PreviewFields({ parsed }: { parsed: EmailSimulationParsed }) {
  const t = useTranslations("delegationParsing");
  const tr = useTranslations("reports");
  const fields = [
    [tr("delegation_order_nr"), parsed.kundenauftrag],
    [t("title"), parsed.title],
    [t("date_from"), parsed.date_from],
    [t("date_to"), parsed.date_to],
    [t("result_description"), parsed.description],
    [tr("delegation_order_type"), parsed.auftragsart],
    [tr("delegation_task"), parsed.positionstyp],
    [tr("delegation_operation"), parsed.vorgang],
    [tr("delegation_location"), parsed.technplatz_raw],
    [tr("delegation_customer_nr"), parsed.kunde_code],
    [tr("delegation_customer"), parsed.kunde_name],
    [tr("delegation_address"), parsed.adresse],
    [tr("delegation_workplace"), parsed.arbeitsplatz],
    [tr("delegation_technician"), parsed.techniker],
  ];
  return (
    <dl className="space-y-3 text-sm">
      {fields.filter(([, value]) => Boolean(value)).map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
          <dt className="font-medium text-muted">{label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
