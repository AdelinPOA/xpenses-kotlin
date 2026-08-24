"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api, { SearchResult } from "@/lib/api";
import { searchKeys } from "@/lib/queryKeys";
import { Search, FileText, Receipt, ChevronRight, Users, Shield, Wallet } from "lucide-react";
import { formatEur } from "@/lib/format";
import { useTranslations } from "next-intl";
 import Badge from "@/components/ui/Badge";
import clsx from "clsx";

interface SearchDropdownProps {
  className?: string;
}

export default function SearchDropdown({ className }: SearchDropdownProps) {
  const t = useTranslations("search");
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search term
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedTerm(term);
      setSelectedIndex(-1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [term]);

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: searchKeys.query(debouncedTerm),
    queryFn: () =>
      api.get("/search", { params: { q: debouncedTerm } }).then((r) => r.data),
    enabled: debouncedTerm.length >= 2,
    staleTime: 30_000,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const results = data ? [
    ...data.reports.map(r => ({ type: "report" as const, id: r.id, title: r.title, subtitle: r.user_display_name || "", amount: r.expenses.reduce((s, e) => s + e.amount_eur, 0) || r.total_amount, status: r.status })),
    ...data.expenses.map(e => ({ type: "expense" as const, id: e.id, title: e.merchant || "—", subtitle: e.category_name || "", amount: e.amount_eur, status: e.status })),
    ...(data.users ?? []).map(u => ({ type: "user" as const, id: u.id, title: u.display_name || u.username || t("default_user"), subtitle: u.email || u.role || "", amount: null, status: u.role })),
    ...(data.insurance ?? []).map(i => ({ type: "insurance" as const, id: i.id, title: i.title || i.filename || t("default_insurance"), subtitle: i.uploaded_by || "", amount: null, status: null })),
    ...(data.advances ?? []).map(a => ({ type: "advance" as const, id: a.id, reportId: a.report_id, title: a.report_title || t("default_advance"), subtitle: a.description || "", amount: a.amount_eur ?? null, status: a.status })),
  ] : [];

  const handleSelect = useCallback((result: typeof results[0]) => {
    setIsOpen(false);
    setTerm("");
    if (result.type === "report") {
      router.push(`/reports/${result.id}`);
    } else if (result.type === "expense") {
      router.push(`/expenses/${result.id}`);
    } else if (result.type === "user") {
      router.push(`/profile/${result.id}`);
    } else if (result.type === "insurance") {
      router.push("/insurance");
    } else {
      router.push(result.reportId ? `/reports/${result.reportId}/advances` : "/advances");
    }
  }, [router]);

  const handleSeeAll = useCallback(() => {
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(debouncedTerm)}`);
  }, [router, debouncedTerm]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(0, prev));
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      } else if (debouncedTerm) {
        handleSeeAll();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && debouncedTerm.length >= 2;
  const groups = data ? [
    { key: "report" as const, label: t("reports_section"), count: data.report_count, icon: FileText, color: "text-primary", bg: "bg-primary/10", items: results.filter((r) => r.type === "report") },
    { key: "expense" as const, label: t("expenses_section"), count: data.expense_count, icon: Receipt, color: "text-orange-500", bg: "bg-orange-500/10", items: results.filter((r) => r.type === "expense") },
    { key: "user" as const, label: t("users_section"), count: data.user_count ?? data.users?.length ?? 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", items: results.filter((r) => r.type === "user") },
    { key: "insurance" as const, label: t("insurance_section"), count: data.insurance_count ?? data.insurance?.length ?? 0, icon: Shield, color: "text-cyan-500", bg: "bg-cyan-500/10", items: results.filter((r) => r.type === "insurance") },
    { key: "advance" as const, label: t("advances_section"), count: data.advance_count ?? data.advances?.length ?? 0, icon: Wallet, color: "text-violet-500", bg: "bg-violet-500/10", items: results.filter((r) => r.type === "advance") },
  ].filter((group) => group.items.length > 0) : [];

  return (
    <div className={clsx("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder={t("placeholder")}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-4 py-2 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-base sm:text-sm"
          aria-label={t("global_search")}
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="search-listbox"
          role="combobox"
        />
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          id="search-listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-lg z-50 max-h-[400px] overflow-hidden"
          role="listbox"
        >
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("searching")}
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("no_results_for", { term: debouncedTerm })}
            </div>
          ) : (
            <>
              <div className="overflow-y-auto max-h-[340px]">
                {groups.map((group) => {
                  const Icon = group.icon;
                  return (
                  <div key={group.key}>
                    <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">
                      {group.label} ({group.count})
                    </div>
                    {group.items.slice(0, 5).map((item) => {
                      const idx = results.findIndex(r => r.type === item.type && r.id === item.id);
                      return (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => handleSelect(item)}
                          className={clsx(
                            "w-full px-3 py-2.5 flex items-center gap-3 hover:bg-card-hover transition-colors text-left",
                            idx === selectedIndex && "bg-card-hover"
                          )}
                          role="option"
                          aria-selected={idx === selectedIndex}
                        >
                          <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", group.bg)}>
                            <Icon className={clsx("w-4 h-4", group.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.subtitle || "—"}</div>
                          </div>
                          <div className="text-right shrink-0">
                            {typeof item.amount === "number" && (
                              <div className="text-sm font-bold text-foreground">{formatEur(item.amount)}</div>
                            )}
                            {item.status && <Badge status={item.status} />}
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )})}
              </div>

              {(data && results.length > 10) && (
                <button
                  onClick={handleSeeAll}
                  className="w-full px-4 py-3 text-sm font-medium text-primary hover:bg-card-hover border-t border-border transition-colors flex items-center justify-center gap-2"
                >
                  {t("see_all_results")}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
