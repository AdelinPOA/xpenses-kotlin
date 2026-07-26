"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api, { SearchResult } from "@/lib/api";
import { searchKeys } from "@/lib/queryKeys";
import { Search, FileText, Receipt, ChevronRight } from "lucide-react";
import { formatEur } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import clsx from "clsx";

interface SearchDropdownProps {
  className?: string;
}

export default function SearchDropdown({ className }: SearchDropdownProps) {
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
  ] : [];

  const handleSelect = useCallback((result: typeof results[0]) => {
    setIsOpen(false);
    setTerm("");
    if (result.type === "report") {
      router.push(`/reports/${result.id}`);
    } else {
      router.push(`/expenses/${result.id}`);
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

  return (
    <div className={clsx("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search reports & expenses..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-4 py-2 bg-input border border-input-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-base sm:text-sm"
          aria-label="Global search"
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
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{debouncedTerm}&rdquo;
            </div>
          ) : (
            <>
              <div className="overflow-y-auto max-h-[340px]">
                {data && data.reports.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">
                      Reports ({data.report_count})
                    </div>
                    {data.reports.slice(0, 5).map((report) => {
                      const idx = results.findIndex(r => r.type === "report" && r.id === report.id);
                      return (
                        <button
                          key={`report-${report.id}`}
                          onClick={() => handleSelect({ type: "report", id: report.id, title: report.title, subtitle: report.user_display_name || "", amount: report.expenses.reduce((s, e) => s + e.amount_eur, 0) || report.total_amount, status: report.status })}
                          className={clsx(
                            "w-full px-3 py-2.5 flex items-center gap-3 hover:bg-card-hover transition-colors text-left",
                            idx === selectedIndex && "bg-card-hover"
                          )}
                          role="option"
                          aria-selected={idx === selectedIndex}
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <FileText className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{report.title}</div>
                            <div className="text-xs text-muted-foreground truncate">{report.user_display_name || "—"}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-foreground">{formatEur(report.expenses.reduce((s, e) => s + e.amount_eur, 0) || report.total_amount)}</div>
                            <Badge status={report.status} />
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {data && data.expenses.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/50">
                      Expenses ({data.expense_count})
                    </div>
                    {data.expenses.slice(0, 5).map((expense) => {
                      const idx = results.findIndex(r => r.type === "expense" && r.id === expense.id);
                      return (
                        <button
                          key={`expense-${expense.id}`}
                          onClick={() => handleSelect({ type: "expense", id: expense.id, title: expense.merchant || "—", subtitle: expense.category_name || "", amount: expense.amount_eur, status: expense.status })}
                          className={clsx(
                            "w-full px-3 py-2.5 flex items-center gap-3 hover:bg-card-hover transition-colors text-left",
                            idx === selectedIndex && "bg-card-hover"
                          )}
                          role="option"
                          aria-selected={idx === selectedIndex}
                        >
                          <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                            <Receipt className="w-4 h-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-foreground truncate">{expense.merchant || "—"}</div>
                            <div className="text-xs text-muted-foreground truncate">{expense.category_name || "Uncategorized"}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-foreground">{formatEur(expense.amount_eur)}</div>
                            <Badge status={expense.status} />
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {(data && (data.report_count > 5 || data.expense_count > 5 || (data.report_count + data.expense_count) > 10)) && (
                <button
                  onClick={handleSeeAll}
                  className="w-full px-4 py-3 text-sm font-medium text-primary hover:bg-card-hover border-t border-border transition-colors flex items-center justify-center gap-2"
                >
                  See all results
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
