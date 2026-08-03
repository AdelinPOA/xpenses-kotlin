"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api, { InventoryItem, InventoryItemCreate, InventoryItemUpdate, InventoryRequest, InventoryRequestCreate, InventoryRejectBody } from "@/lib/api";
import { inventoryKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ToastProvider";
import { Plus, Pencil, Trash2, Wrench, Package, Send, Check, X, HelpCircle, ClipboardList } from "lucide-react";
import { formatAmount } from "@/lib/format";
import { useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  retired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  transferred: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const requestStatusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

export default function InventoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [showAll, setShowAll] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteId, setShowDeleteId] = useState<number | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isPrivileged = user?.role === "chef_finance" || user?.role === "mod";
  const isManager = user?.role === "manager" || isPrivileged;

  // Item form state
  const [formName, setFormName] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPurchaseDate, setFormPurchaseDate] = useState("");
  const [formPurchaseValue, setFormPurchaseValue] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Request form state
  const [reqItemName, setReqItemName] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqQuantity, setReqQuantity] = useState("1");

  const { data: items, isLoading } = useQuery<InventoryItem[]>({
    queryKey: inventoryKeys.list({ all: showAll }),
    queryFn: () =>
      api.get("/inventory", { params: { all: showAll } }).then((r) => r.data),
  });

  const { data: allRequests, isLoading: reqsLoading } = useQuery<InventoryRequest[]>({
    queryKey: inventoryKeys.requests(),
    queryFn: () =>
      api.get("/inventory/requests", {
        params: isManager ? { status: "pending" } : { mine: true },
      }).then((r) => r.data),
  });

  const myRequests = allRequests?.filter((r) => r.user_id === user?.id) ?? [];
  const pendingRequests = isManager ? (allRequests ?? []) : [];

  // Item mutations
  const createItem = useMutation({
    mutationFn: (payload: InventoryItemCreate) => api.post("/inventory", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("item_added"));
      resetItemForm();
    },
    onError: () => toast.error(t("add_failed")),
  });

  const updateItem = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: InventoryItemUpdate }) =>
      api.patch(`/inventory/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("item_updated"));
      resetItemForm();
    },
    onError: () => toast.error(t("update_failed")),
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/inventory/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("item_removed"));
    },
    onError: () => toast.error(t("remove_failed")),
  });

  // Request mutations
  const createRequest = useMutation({
    mutationFn: (payload: InventoryRequestCreate) => api.post("/inventory/requests", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("request_submitted"));
      resetRequestForm();
    },
    onError: () => toast.error(t("request_submit_failed")),
  });

  const approveRequest = useMutation({
    mutationFn: (id: number) => api.post(`/inventory/requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("request_approved"));
    },
    onError: () => toast.error(t("approve_failed")),
  });

  const rejectRequest = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/inventory/requests/${id}/reject`, { reason } as InventoryRejectBody),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: inventoryKeys.all });
      toast.success(t("request_rejected"));
      setRejectingId(null);
      setRejectReason("");
    },
    onError: () => toast.error(t("reject_failed")),
  });

  function resetItemForm() {
    setShowForm(false);
    setEditingItem(null);
    setFormName("");
    setFormSerial("");
    setFormCategory("");
    setFormPurchaseDate("");
    setFormPurchaseValue("");
    setFormDescription("");
    setFormNotes("");
  }

  function resetRequestForm() {
    setShowRequestForm(false);
    setReqItemName("");
    setReqDescription("");
    setReqQuantity("1");
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setFormName(item.name);
    setFormSerial(item.serial_number ?? "");
    setFormCategory(item.category ?? "");
    setFormPurchaseDate(item.purchase_date ?? "");
    setFormPurchaseValue(item.purchase_value?.toString() ?? "");
    setFormDescription(item.description ?? "");
    setFormNotes(item.notes ?? "");
    setShowForm(true);
  }

  function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    const payload: InventoryItemCreate = {
      name: formName.trim(),
      serial_number: formSerial.trim() || null,
      category: formCategory.trim() || null,
      purchase_date: formPurchaseDate || null,
      purchase_value: formPurchaseValue ? parseFloat(formPurchaseValue) : null,
      description: formDescription.trim() || null,
      notes: formNotes.trim() || null,
    };
    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, payload });
    } else {
      createItem.mutate(payload);
    }
  }

  function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reqItemName.trim()) return;
    createRequest.mutate({
      item_name: reqItemName.trim(),
      description: reqDescription.trim() || null,
      quantity: parseInt(reqQuantity) || 1,
    });
  }

  function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectReason.trim() || !rejectingId) return;
    rejectRequest.mutate({ id: rejectingId, reason: rejectReason.trim() });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-6 h-6" /> {t("title")}
          </h1>
          <p className="text-muted text-sm mt-1">
            {items?.length ?? 0} {t("items_count")} · {myRequests.length} {t("requests_count")}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {isPrivileged && (
            <button
              onClick={() => setShowAll(!showAll)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                showAll
                  ? "bg-slate-900 border-slate-900 text-white dark:bg-slate-700 dark:border-slate-600"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              {showAll ? t("my_items") : t("all_items")}
            </button>
          )}
          <button
            onClick={() => setShowRequestForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
          >
            <ClipboardList className="w-4 h-4" />
            {t("request_equipment")}
          </button>
          {isPrivileged && (
            <button
              onClick={() => { resetItemForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover"
            >
              <Plus className="w-4 h-4" />
              {t("add_item")}
            </button>
          )}
        </div>
      </div>

      {/* Request Form Modal */}
      {showRequestForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={resetRequestForm} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" /> {t("request_heading")}
                </h2>
                <button onClick={resetRequestForm} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_item_name")}</label>
                  <input
                    required
                    value={reqItemName}
                    onChange={(e) => setReqItemName(e.target.value)}
                    placeholder={t("placeholder_item_name")}
                    className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_quantity")}</label>
                  <input
                    type="number"
                    min="1"
                    value={reqQuantity}
                    onChange={(e) => setReqQuantity(e.target.value)}
                    className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_justification")}</label>
                  <textarea
                    value={reqDescription}
                    onChange={(e) => setReqDescription(e.target.value)}
                    rows={3}
                    placeholder={t("placeholder_justification")}
                    className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetRequestForm} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                    {tc("cancel")}
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700">
                    <Send className="w-3.5 h-3.5 inline mr-1" /> {t("submit_request")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Reject Modal */}
      {rejectingId !== null && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setRejectingId(null); setRejectReason(""); }} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{t("reject_request")}</h2>
                <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleRejectSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_reason")}</label>
                  <textarea
                    required
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder={t("placeholder_reason")}
                    className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setRejectingId(null); setRejectReason(""); }} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                    {tc("cancel")}
                  </button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700">
                    {t("reject")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Item Form Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={resetItemForm} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingItem ? t("edit_item") : t("add_item_heading")}
                </h2>
                <button onClick={resetItemForm} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleItemSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_name")}</label>
                  <input required value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_serial")}</label>
                    <input value={formSerial} onChange={(e) => setFormSerial(e.target.value)} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_category")}</label>
                    <input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder={t("placeholder_category")} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_purchase_date")}</label>
                    <input type="date" value={formPurchaseDate} onChange={(e) => setFormPurchaseDate(e.target.value)} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_purchase_value")}</label>
                    <input type="number" min="0" step="0.01" value={formPurchaseValue} onChange={(e) => setFormPurchaseValue(e.target.value)} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{tc("description")}</label>
                  <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("label_notes")}</label>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-input-border rounded-lg bg-input text-foreground text-base sm:text-sm" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={resetItemForm} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">{tc("cancel")}</button>
                  <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover">{editingItem ? tc("save") : t("add_item")}</button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Pending Requests (manager view) */}
      {isManager && !reqsLoading && pendingRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-500" /> {t("pending_requests")}
          </h2>
          <div className="grid gap-3">
            {pendingRequests.map((req) => (
              <div key={req.id} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground">{req.item_name}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {t("qty")} {req.quantity} · {t("requested_by")} {req.user_display_name || `User ${req.user_id}`}
                  </p>
                  {req.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{req.description}</p>}
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${requestStatusColors["pending"]}`}>{t("pending")}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => approveRequest.mutate(req.id)}
                    disabled={approveRequest.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> {tc("approve")}
                  </button>
                  <button
                    onClick={() => setRejectingId(req.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30 text-xs font-medium rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> {t("reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Requests */}
      {myRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-slate-400" /> {t("my_requests")}
          </h2>
          <div className="space-y-2">
            {myRequests.map((req) => (
              <div key={req.id} className="bg-card rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-medium text-foreground text-sm">{req.item_name}</h4>
                  <p className="text-xs text-muted">{t("qty")} {req.quantity}</p>
                  {req.rejection_reason && req.status === "rejected" && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{t("reason")} {req.rejection_reason}</p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${requestStatusColors[req.status] || ""}`}>
                  {req.status === "pending" ? t("pending") : req.status === "approved" ? tc("approved") : req.status === "rejected" ? tc("rejected") : req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">{t("loading")}</div>
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={Package}
          message={t("no_items")}
          actionLabel={isPrivileged ? t("add_first") : t("request_equipment")}
          onAction={isPrivileged ? () => { resetItemForm(); setShowForm(true); } : () => setShowRequestForm(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="bg-card rounded-xl shadow-sm border border-border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="w-4 h-4 text-slate-400 shrink-0" />
                  <h3 className="font-semibold text-foreground truncate">{item.name}</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColors[item.status] || ""}`}>
                  {item.status === "active" ? tc("active") : item.status}
                </span>
              </div>
              {item.serial_number && <p className="text-xs text-muted-foreground mb-1 font-mono">{t("sn")} {item.serial_number}</p>}
              {item.category && (
                <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs rounded-full mb-2">{item.category}</span>
              )}
              {item.description && <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 line-clamp-2">{item.description}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                {item.purchase_date && <span>{t("purchased")} {item.purchase_date}</span>}
                {item.purchase_value != null && <span>{t("value")} {formatAmount(item.purchase_value, "EUR")}</span>}
              </div>
              {item.user_display_name && showAll && (
                <p className="text-xs text-muted-foreground mb-2">{t("assigned_to")} {item.user_display_name}</p>
              )}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button onClick={() => openEdit(item)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  <Pencil className="w-3 h-3" /> {tc("edit")}
                </button>
                {showDeleteId === item.id ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <button onClick={() => { deleteItem.mutate(item.id); setShowDeleteId(null); }} className="text-xs text-red-600 hover:text-red-700 font-semibold">{tc("confirm")}</button>
                    <button onClick={() => setShowDeleteId(null)} className="text-xs text-slate-400">{tc("cancel")}</button>
                  </div>
                ) : (
                  <button onClick={() => setShowDeleteId(item.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 ml-auto">
                    <Trash2 className="w-3 h-3" /> {tc("delete")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
