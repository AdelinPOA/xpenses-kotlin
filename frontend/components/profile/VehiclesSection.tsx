"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Car, Pencil, Plus, Star, Trash2 } from "lucide-react";
import api, {
  type FuelType,
  type UserVehicle,
  type UserVehicleCreatePayload,
  type UserVehicleUpdatePayload,
} from "@/lib/api";
import { vehicleKeys } from "@/lib/queryKeys";
import { parseLocaleNumber } from "@/lib/format";

const FUEL_TYPES: FuelType[] = ["petrol", "diesel", "hybrid", "electric", "lpg"];

const FUEL_TYPE_LABEL_KEYS: Record<
  FuelType,
  "fuel_petrol" | "fuel_diesel" | "fuel_hybrid" | "fuel_electric" | "fuel_lpg"
> = {
  petrol: "fuel_petrol",
  diesel: "fuel_diesel",
  hybrid: "fuel_hybrid",
  electric: "fuel_electric",
  lpg: "fuel_lpg",
};

const INPUT_CLASS =
  "w-full min-h-11 text-base sm:text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-input dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-300";

export default function VehiclesSection() {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<UserVehicle | null>(null);
  const [plateNumber, setPlateNumber] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [fuelType, setFuelType] = useState<FuelType | "">("");
  const [fuelConsumption, setFuelConsumption] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: vehicles = [], isLoading } = useQuery<UserVehicle[]>({
    queryKey: vehicleKeys.me(),
    queryFn: async () => {
      const res = await api.get<UserVehicle[]>("/users/me/vehicles");
      return res.data;
    },
  });

  const resetForm = () => {
    setFormOpen(false);
    setEditingVehicle(null);
    setPlateNumber("");
    setMakeModel("");
    setFuelType("");
    setFuelConsumption("");
    setIsDefault(false);
    setFormError(null);
  };

  const openAddForm = () => {
    setStatusMsg(null);
    setErrorMsg(null);
    setEditingVehicle(null);
    setPlateNumber("");
    setMakeModel("");
    setFuelType("");
    setFuelConsumption("");
    setIsDefault(vehicles.length === 0);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (vehicle: UserVehicle) => {
    setStatusMsg(null);
    setErrorMsg(null);
    setEditingVehicle(vehicle);
    setPlateNumber(vehicle.plate_number);
    setMakeModel(vehicle.make_model ?? "");
    setFuelType(vehicle.fuel_type ?? "");
    setFuelConsumption(
      vehicle.fuel_consumption_l_per_100km != null
        ? String(vehicle.fuel_consumption_l_per_100km)
        : "",
    );
    setIsDefault(vehicle.is_default);
    setFormError(null);
    setFormOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: UserVehicleCreatePayload) =>
      api.post<UserVehicle>("/users/me/vehicles", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.me() });
      resetForm();
      setErrorMsg(null);
      setStatusMsg(t("vehicle_saved"));
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setStatusMsg(null);
      setFormError(detail ?? t("vehicle_save_failed"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UserVehicleUpdatePayload }) =>
      api.patch<UserVehicle>(`/users/me/vehicles/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.me() });
      resetForm();
      setErrorMsg(null);
      setStatusMsg(t("vehicle_saved"));
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setStatusMsg(null);
      setFormError(detail ?? t("vehicle_save_failed"));
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) =>
      api.patch<UserVehicle>(`/users/me/vehicles/${id}`, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.me() });
      setErrorMsg(null);
      setStatusMsg(t("vehicle_saved"));
    },
    onError: () => {
      setStatusMsg(null);
      setErrorMsg(t("vehicle_save_failed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/me/vehicles/${id}`),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: vehicleKeys.me() });
      if (editingVehicle?.id === deletedId) {
        resetForm();
      }
      setErrorMsg(null);
      setStatusMsg(t("vehicle_deleted"));
    },
    onError: () => {
      setStatusMsg(null);
      setErrorMsg(t("vehicle_delete_failed"));
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setStatusMsg(null);
    setErrorMsg(null);

    const trimmedPlate = plateNumber.trim();
    if (!trimmedPlate) {
      setFormError(t("vehicle_plate_required"));
      return;
    }

    const trimmedConsumption = fuelConsumption.trim();
    let parsedConsumption: number | null = null;
    if (trimmedConsumption !== "") {
      const parsed = parseLocaleNumber(trimmedConsumption);
      if (
        !/^\d+([.,]\d{1,2})?$/.test(trimmedConsumption) ||
        !Number.isFinite(parsed) ||
        parsed < 0.01 ||
        parsed > 50
      ) {
        setFormError(t("vehicle_consumption_invalid"));
        return;
      }
      parsedConsumption = parsed;
    }

    const trimmedMakeModel = makeModel.trim();

    if (editingVehicle) {
      const payload: UserVehicleUpdatePayload = {
        plate_number: trimmedPlate,
        is_default: isDefault,
      };
      if (trimmedMakeModel) {
        payload.make_model = trimmedMakeModel;
      } else {
        payload.clear_make_model = true;
      }
      if (fuelType) {
        payload.fuel_type = fuelType;
      } else {
        payload.clear_fuel_type = true;
      }
      if (parsedConsumption !== null) {
        payload.fuel_consumption_l_per_100km = parsedConsumption;
      } else {
        payload.clear_fuel_consumption = true;
      }
      updateMutation.mutate({ id: editingVehicle.id, payload });
    } else {
      const payload: UserVehicleCreatePayload = {
        plate_number: trimmedPlate,
        make_model: trimmedMakeModel || null,
        fuel_type: fuelType || null,
        fuel_consumption_l_per_100km: parsedConsumption,
        is_default: isDefault,
      };
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (vehicle: UserVehicle) => {
    if (!window.confirm(t("vehicle_confirm_delete"))) return;
    setStatusMsg(null);
    setErrorMsg(null);
    deleteMutation.mutate(vehicle.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="bg-card rounded-xl shadow-sm p-6 mb-6 border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Car className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            {t("vehicles_section")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t("vehicles_subtitle")}
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openAddForm}
            className="min-h-11 px-3 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {t("add_vehicle")}
          </button>
        )}
      </div>

      {errorMsg && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">
          {errorMsg}
        </p>
      )}
      {statusMsg && (
        <p role="status" aria-live="polite" className="text-sm text-green-600 dark:text-green-400 mb-3">
          {statusMsg}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 p-4 rounded-lg border border-border bg-slate-50/60 dark:bg-slate-900/40 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {editingVehicle ? t("edit_vehicle") : t("add_vehicle")}
          </h3>

          <div>
            <label
              htmlFor="vehicle-plate-number"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              {t("plate_number")}
            </label>
            <input
              id="vehicle-plate-number"
              name="plate_number"
              type="text"
              required
              maxLength={32}
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              placeholder={t("plate_placeholder")}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="vehicle-make-model"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              {t("make_model")}
            </label>
            <input
              id="vehicle-make-model"
              name="make_model"
              type="text"
              maxLength={120}
              value={makeModel}
              onChange={(e) => setMakeModel(e.target.value)}
              placeholder={t("make_model_placeholder")}
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="vehicle-fuel-type"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                {t("fuel_type")}
              </label>
              <select
                id="vehicle-fuel-type"
                name="fuel_type"
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType | "")}
                className={INPUT_CLASS}
              >
                <option value="">{t("fuel_type_none")}</option>
                {FUEL_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {t(FUEL_TYPE_LABEL_KEYS[ft])}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="vehicle-fuel-consumption"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                {t("fuel_consumption")}
              </label>
              <input
                id="vehicle-fuel-consumption"
                name="fuel_consumption_l_per_100km"
                type="text"
                inputMode="decimal"
                value={fuelConsumption}
                onChange={(e) => setFuelConsumption(e.target.value)}
                placeholder="7.5"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
            {t("fuel_consumption_hint")}
          </p>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="vehicle-is-default"
              checked={isDefault}
              disabled={editingVehicle?.is_default === true}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-primary h-4 w-4 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="vehicle-is-default"
              className="text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("set_as_default")}
            </label>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 px-4 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSaving ? t("saving") : tCommon("save")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="min-h-11 px-4 py-2 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              {tCommon("cancel")}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{tCommon("loading")}</p>
      ) : vehicles.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("vehicles_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.id}
              className="rounded-lg border border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {vehicle.plate_number}
                  </span>
                  {vehicle.is_default && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                      {t("default_badge")}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {vehicle.make_model && <span>{vehicle.make_model}</span>}
                  {vehicle.fuel_type && (
                    <span>{t(FUEL_TYPE_LABEL_KEYS[vehicle.fuel_type])}</span>
                  )}
                  {vehicle.fuel_consumption_l_per_100km != null ? (
                    <span>{`${vehicle.fuel_consumption_l_per_100km} l/100km`}</span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">
                      {t("fuel_consumption_global_fallback")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {!vehicle.is_default && (
                  <button
                    type="button"
                    onClick={() => setDefaultMutation.mutate(vehicle.id)}
                    disabled={setDefaultMutation.isPending}
                    className="min-h-11 px-3 py-1.5 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors"
                  >
                    {t("set_as_default")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEditForm(vehicle)}
                  className="min-h-11 px-3 py-1.5 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  {tCommon("edit")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(vehicle)}
                  disabled={deleteMutation.isPending}
                  className="min-h-11 px-3 py-1.5 border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 text-red-600 dark:text-red-400 text-xs font-medium rounded-lg transition-colors inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {tCommon("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
