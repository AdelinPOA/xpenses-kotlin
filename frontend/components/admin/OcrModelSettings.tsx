"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  OcrConfig,
  OcrConfigUpdate,
  OcrModel,
  OcrProvider,
  updateOcrConfig,
  getOcrConfig,
  testOcrModel,
} from "@/lib/api";
import { ocrKeys } from "@/lib/queryKeys";
import { useToast } from "@/components/ToastProvider";

type ChainField = "receipt_model_chain" | "delegation_model_chain";
type TestResult = { success: boolean; message: string };

const cloneConfig = (config: OcrConfig): OcrConfig => ({
  ...config,
  providers: config.providers.map((provider) => ({ ...provider })),
  models: config.models.map((model) => ({ ...model })),
  receipt_model_chain: [...config.receipt_model_chain],
  delegation_model_chain: [...config.delegation_model_chain],
});

const inputClass =
  "w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-card-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50";

export default function OcrModelSettings({
  initialConfig,
}: {
  initialConfig: OcrConfig;
}) {
  const t = useTranslations("admin");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState(() => cloneConfig(initialConfig));
  const [baseline, setBaseline] = useState(() => cloneConfig(initialConfig));
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [providerDraft, setProviderDraft] = useState({
    name: "",
    base_url: "",
    api_key: "",
  });
  const [modelDraft, setModelDraft] = useState({
    provider_id: "",
    model_id: "",
    display_name: "",
  });
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {},
  );
  const [chainSelections, setChainSelections] = useState<
    Record<ChainField, string>
  >({ receipt_model_chain: "", delegation_model_chain: "" });
  const [saveError, setSaveError] = useState<string | null>(null);

  const configDirty = JSON.stringify(config) !== JSON.stringify(baseline);
  const keysDirty = Object.values(apiKeys).some((key) => key.length > 0);
  const isDirty = configDirty || keysDirty;
  const protectDraft = useRef(false);
  const busy = useRef(false);
  // Background query refreshes must not replace a moderator's local edits.
  protectDraft.current =
    isDirty ||
    Object.values(providerDraft).some(Boolean) ||
    Boolean(modelDraft.model_id || modelDraft.display_name);

  useEffect(() => {
    if (protectDraft.current || busy.current) return;
    const next = cloneConfig(initialConfig);
    setConfig(next);
    setBaseline(cloneConfig(next));
    setApiKeys({});
    setChainSelections({ receipt_model_chain: "", delegation_model_chain: "" });
  }, [initialConfig]);
  const providerById = useMemo(
    () => new Map(config.providers.map((provider) => [provider.id, provider])),
    [config.providers],
  );
  const modelById = useMemo(
    () => new Map(config.models.map((model) => [model.id, model])),
    [config.models],
  );

  function applySavedConfig(saved: OcrConfig) {
    const next = cloneConfig(saved);
    setConfig(next);
    setBaseline(cloneConfig(next));
    setApiKeys({});
    setChainSelections({ receipt_model_chain: "", delegation_model_chain: "" });
    queryClient.setQueryData(ocrKeys.config(), saved);
  }

  const saveMutation = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: ocrKeys.config() }),
    mutationFn: (payload: OcrConfigUpdate) => updateOcrConfig(payload),
    onSuccess: (saved) => {
      applySavedConfig(saved);
      setSaveError(null);
      toast.success(t("ocr_config_saved"));
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("ocr_save_failed");
      setSaveError(message);
      toast.error(message);
    },
  });

  const testMutation = useMutation({
    onMutate: () => queryClient.cancelQueries({ queryKey: ocrKeys.config() }),
    mutationFn: async (modelId: string) => {
      const result = await testOcrModel(modelId);
      // Keep the form locked until authoritative test state has been refreshed,
      // including revocation of a previously passed test after a failed retest.
      const saved = await getOcrConfig();
      return { result, saved };
    },
    onSuccess: ({ result, saved }, modelId) => {
      applySavedConfig(saved);
      setTestResults((current) => ({ ...current, [modelId]: result }));
      if (result.success) toast.success(t("ocr_model_test_passed"));
      else toast.error(result.message || t("ocr_model_test_failed"));
    },
    onError: (error: unknown, modelId) => {
      const message =
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("ocr_model_test_failed");
      setTestResults((current) => ({
        ...current,
        [modelId]: { success: false, message },
      }));
      toast.error(message);
    },
  });

  const mutationPending = saveMutation.isPending || testMutation.isPending;
  busy.current = mutationPending;

  function invalidateProviderModels(providerId: string) {
    const invalidate = (model: OcrModel) => model.provider_id === providerId;
    setConfig((current) => ({
      ...current,
      models: current.models.map((model) =>
        invalidate(model) ? { ...model, active: false, tested: false } : model,
      ),
      receipt_model_chain: current.receipt_model_chain.filter((id) =>
        current.models.some((model) => model.id === id && !invalidate(model)),
      ),
      delegation_model_chain: current.delegation_model_chain.filter((id) =>
        current.models.some((model) => model.id === id && !invalidate(model)),
      ),
    }));
    setTestResults((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([id]) => modelById.get(id)?.provider_id !== providerId,
        ),
      ),
    );
  }

  function updateProvider(providerId: string, patch: Partial<OcrProvider>) {
    setConfig((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === providerId ? { ...provider, ...patch } : provider,
      ),
    }));
    if (
      patch.base_url !== undefined &&
      patch.base_url !== providerById.get(providerId)?.base_url
    ) {
      invalidateProviderModels(providerId);
    }
  }

  function updateModel(modelId: string, patch: Partial<OcrModel>) {
    const currentModel = modelById.get(modelId);
    if (!currentModel) return;
    const identityChanged =
      (patch.provider_id !== undefined &&
        patch.provider_id !== currentModel.provider_id) ||
      (patch.model_id !== undefined &&
        patch.model_id !== currentModel.model_id);
    setConfig((current) => {
      const models = current.models.map((model) =>
        model.id === modelId
          ? {
              ...model,
              ...patch,
              ...(identityChanged ? { active: false, tested: false } : {}),
            }
          : model,
      );
      const removeFromChains = (chain: string[]) =>
        identityChanged || patch.active === false
          ? chain.filter((id) => id !== modelId)
          : chain;
      return {
        ...current,
        models,
        receipt_model_chain: removeFromChains(current.receipt_model_chain),
        delegation_model_chain: removeFromChains(
          current.delegation_model_chain,
        ),
      };
    });
    if (identityChanged)
      setTestResults((current) => {
        const next = { ...current };
        delete next[modelId];
        return next;
      });
  }

  function addProvider() {
    const id = crypto.randomUUID();
    const provider: OcrProvider = {
      id,
      name: providerDraft.name.trim(),
      base_url: providerDraft.base_url.trim(),
      api_key_set: false,
    };
    setConfig((current) => ({
      ...current,
      providers: [...current.providers, provider],
    }));
    if (providerDraft.api_key)
      setApiKeys((current) => ({ ...current, [id]: providerDraft.api_key }));
    setProviderDraft({ name: "", base_url: "", api_key: "" });
  }

  function addModel() {
    const providerId = modelDraft.provider_id || config.providers[0]?.id;
    if (!providerId) return;
    const model: OcrModel = {
      id: crypto.randomUUID(),
      provider_id: providerId,
      model_id: modelDraft.model_id.trim(),
      display_name: modelDraft.display_name.trim(),
      active: false,
      tested: false,
    };
    setConfig((current) => ({
      ...current,
      models: [...current.models, model],
    }));
    setModelDraft({ provider_id: providerId, model_id: "", display_name: "" });
  }

  function updateChain(field: ChainField, chain: string[]) {
    setConfig((current) => ({ ...current, [field]: chain }));
  }

  function moveChainModel(field: ChainField, index: number, offset: -1 | 1) {
    const chain = [...config[field]];
    const target = index + offset;
    if (target < 0 || target >= chain.length) return;
    [chain[index], chain[target]] = [chain[target], chain[index]];
    updateChain(field, chain);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationPending) return;
    setSaveError(null);
    const payload: OcrConfigUpdate = {
      ocr_enabled: config.ocr_enabled,
      providers: config.providers.map(({ id, name, base_url }) => ({
        id,
        name,
        base_url,
        api_key: apiKeys[id] ?? "",
      })),
      models: config.models.map(
        ({ id, provider_id, model_id, display_name, active }) => ({
          id,
          provider_id,
          model_id,
          display_name,
          active,
        }),
      ),
      receipt_model_chain: config.receipt_model_chain,
      delegation_model_chain: config.delegation_model_chain,
    };
    saveMutation.mutate(payload);
  }

  const availableModels = config.models.filter(
    (model) => model.active && model.tested,
  );

  function renderChain(title: string, field: ChainField) {
    const chain = config[field];
    const chainable = availableModels.filter(
      (model) => !chain.includes(model.id),
    );
    return (
      <section
        className="space-y-3 rounded-xl border border-border bg-background/40 p-4"
        aria-label={title}
      >
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted">
            {t("ocr_chain_description")}
          </p>
        </div>
        {chain.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            {t("ocr_chain_empty")}
          </p>
        ) : (
          <ol className="space-y-2">
            {chain.map((modelId, index) => {
              const model = modelById.get(modelId);
              if (!model) return null;
              return (
                <li
                  key={modelId}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {model.display_name}
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {model.model_id}
                    </p>
                  </div>
                  {index === 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {t("ocr_primary")}
                    </span>
                  )}
                  {index > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted dark:bg-slate-800">
                      {t("ocr_fallback")}
                    </span>
                  )}
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`${t("ocr_move_up")} ${model.display_name}`}
                    disabled={index === 0}
                    onClick={() => moveChainModel(field, index, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`${t("ocr_move_down")} ${model.display_name}`}
                    disabled={index === chain.length - 1}
                    onClick={() => moveChainModel(field, index, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`${t("ocr_remove_from_chain")} ${model.display_name}`}
                    onClick={() =>
                      updateChain(
                        field,
                        chain.filter((id) => id !== modelId),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {chainable.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={`${t("ocr_add_to_chain")} ${title}`}
              className={`${inputClass} min-w-[12rem] flex-1`}
              value={chainSelections[field]}
              onChange={(event) =>
                setChainSelections((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            >
              <option value="">{t("ocr_select_model")}</option>
              {chainable.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.display_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={buttonClass}
              disabled={!chainSelections[field]}
              onClick={() => {
                const modelId = chainSelections[field];
                if (modelId) updateChain(field, [...chain, modelId]);
                setChainSelections((current) => ({ ...current, [field]: "" }));
              }}
            >
              <Plus className="h-4 w-4" />
              {t("ocr_add_to_chain")}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-5xl"
      aria-busy={mutationPending}
    >
      <fieldset disabled={mutationPending} className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              {t("ocr_heading")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {t("ocr_models_description")}
            </p>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isDirty || saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? t("saving") : t("ocr_save_changes")}
          </button>
        </div>

        {saveError && (
          <div
            role="alert"
            className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
          >
            {saveError}
          </div>
        )}
        {isDirty && (
          <p
            role="status"
            className="border-l-2 border-amber-500 pl-3 text-sm text-amber-800 dark:text-amber-300"
          >
            {t("ocr_unsaved_changes")}
          </p>
        )}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input-border text-blue-600 focus:ring-2 focus:ring-primary/20"
              checked={config.ocr_enabled}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  ocr_enabled: event.target.checked,
                }))
              }
            />
            {t("enable_ocr")}
          </label>
          <p className="ml-7 mt-1 text-xs text-muted">
            {t("ocr_enabled_hint")}
          </p>
        </section>

        <section className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("ocr_providers")}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {t("ocr_providers_hint")}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {config.providers.map((provider) => (
              <div
                key={provider.id}
                className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-2"
              >
                <label className="space-y-1 text-xs font-semibold text-muted">
                  {t("ocr_provider_name")}
                  <input
                    className={inputClass}
                    value={provider.name}
                    onChange={(event) =>
                      updateProvider(provider.id, { name: event.target.value })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted">
                  {t("ocr_base_url")}
                  <input
                    className={`${inputClass} font-mono`}
                    type="url"
                    value={provider.base_url}
                    onChange={(event) =>
                      updateProvider(provider.id, {
                        base_url: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted md:col-span-2">
                  {t("ocr_api_key")}
                  <input
                    className={`${inputClass} font-mono`}
                    type="password"
                    autoComplete="new-password"
                    value={apiKeys[provider.id] ?? ""}
                    placeholder={
                      provider.api_key_set
                        ? t("ocr_key_set_placeholder")
                        : t("ocr_key_optional_placeholder")
                    }
                    onChange={(event) => {
                      const key = event.target.value;
                      setApiKeys((current) => ({
                        ...current,
                        [provider.id]: key,
                      }));
                      if (key.length > 0) invalidateProviderModels(provider.id);
                    }}
                  />
                  <span className="block font-normal text-muted">
                    {provider.api_key_set
                      ? t("ocr_key_set_hint")
                      : t("ocr_key_not_set_hint")}
                  </span>
                </label>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("ocr_add_provider")}
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_provider_name")}
                <input
                  className={inputClass}
                  value={providerDraft.name}
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_base_url")}
                <input
                  className={`${inputClass} font-mono`}
                  type="url"
                  value={providerDraft.base_url}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      base_url: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_api_key")}
                <input
                  className={`${inputClass} font-mono`}
                  type="password"
                  autoComplete="new-password"
                  value={providerDraft.api_key}
                  placeholder={t("ocr_key_optional_placeholder")}
                  onChange={(event) =>
                    setProviderDraft((current) => ({
                      ...current,
                      api_key: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              disabled={
                !providerDraft.name.trim() || !providerDraft.base_url.trim()
              }
              onClick={addProvider}
            >
              <Plus className="h-4 w-4" />
              {t("ocr_add_provider")}
            </button>
          </div>
        </section>

        <section className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("ocr_models")}
              </h2>
              <p className="mt-1 text-xs text-muted">{t("ocr_models_hint")}</p>
            </div>
          </div>
          {config.models.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
              {t("ocr_no_models")}
            </p>
          ) : (
            <div className="space-y-3">
              {config.models.map((model) => {
                const provider = providerById.get(model.provider_id);
                const result = testResults[model.id];
                return (
                  <article
                    key={model.id}
                    className="space-y-3 rounded-lg border border-border bg-background/40 p-4"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1 text-xs font-semibold text-muted">
                        {t("ocr_model_display_name")}
                        <input
                          className={inputClass}
                          value={model.display_name}
                          onChange={(event) =>
                            updateModel(model.id, {
                              display_name: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-muted">
                        {t("ocr_model_provider")}
                        <select
                          className={inputClass}
                          value={model.provider_id}
                          onChange={(event) =>
                            updateModel(model.id, {
                              provider_id: event.target.value,
                            })
                          }
                        >
                          {config.providers.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-muted md:col-span-2">
                        {t("ocr_model_id")}
                        <input
                          className={`${inputClass} font-mono`}
                          value={model.model_id}
                          onChange={(event) =>
                            updateModel(model.id, {
                              model_id: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <input
                            type="checkbox"
                            checked={model.active}
                            disabled={!model.tested}
                            onChange={(event) =>
                              updateModel(model.id, {
                                active: event.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-input-border text-blue-600 focus:ring-2 focus:ring-primary/20"
                          />
                          {t("ocr_model_active")}
                        </label>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${model.tested ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"}`}
                        >
                          {model.tested ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <AlertCircle className="h-3 w-3" />
                          )}
                          {model.tested
                            ? t("ocr_model_tested")
                            : t("ocr_model_needs_test")}
                        </span>
                        {provider && (
                          <span className="text-xs text-muted">
                            {provider.name}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={
                          testMutation.isPending ||
                          isDirty ||
                          !provider ||
                          model.active
                        }
                        onClick={() => testMutation.mutate(model.id)}
                      >
                        {testMutation.isPending &&
                        testMutation.variables === model.id
                          ? t("testing")
                          : model.tested
                            ? t("ocr_retest_model")
                            : t("ocr_test_model")}
                      </button>
                    </div>
                    {result && (
                      <p
                        role="status"
                        className={`flex items-start gap-2 text-xs ${result.success ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        {result.message}
                      </p>
                    )}
                    {model.active && !model.tested && (
                      <p className="text-xs text-rose-600">
                        {t("ocr_model_must_test")}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {t("ocr_add_model")}
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_model_provider")}
                <select
                  className={inputClass}
                  value={
                    modelDraft.provider_id || config.providers[0]?.id || ""
                  }
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      provider_id: event.target.value,
                    }))
                  }
                  disabled={config.providers.length === 0}
                >
                  {config.providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_model_display_name")}
                <input
                  className={inputClass}
                  value={modelDraft.display_name}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      display_name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-muted">
                {t("ocr_model_id")}
                <input
                  className={`${inputClass} font-mono`}
                  value={modelDraft.model_id}
                  onChange={(event) =>
                    setModelDraft((current) => ({
                      ...current,
                      model_id: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              disabled={
                config.providers.length === 0 ||
                !modelDraft.model_id.trim() ||
                !modelDraft.display_name.trim()
              }
              onClick={addModel}
            >
              <Plus className="h-4 w-4" />
              {t("ocr_add_model")}
            </button>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {renderChain(t("ocr_receipt_chain"), "receipt_model_chain")}
          {renderChain(t("ocr_delegation_chain"), "delegation_model_chain")}
        </div>
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isDirty || saveMutation.isPending}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? t("saving") : t("ocr_save_changes")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
