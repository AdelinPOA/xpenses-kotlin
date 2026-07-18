"use client";

import clsx from "clsx";

interface GroupedListProps {
  children: React.ReactNode;
  className?: string;
  header?: string;
  footer?: string;
}

export default function GroupedList({ children, className, header, footer }: GroupedListProps) {
  return (
    <div className={clsx("ios-grouped-bg", className)}>
      {header && (
        <p className="text-[13px] font-medium text-[var(--ios-tertiary-label)] uppercase tracking-[0.04em] px-4 pt-6 pb-1.5">
          {header}
        </p>
      )}
      <div className="ios-inset-card overflow-hidden">{children}</div>
      {footer && (
        <p className="text-[12px] text-[var(--ios-tertiary-label)] px-4 pt-2 pb-4">
          {footer}
        </p>
      )}
    </div>
  );
}

interface GroupedListItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function GroupedListItem({
  children,
  onClick,
  href,
  className,
  icon,
  trailing,
}: GroupedListItemProps) {
  const Tag = href ? "a" : onClick ? "button" : "div";
  const extraProps = href ? { href } : onClick ? { onClick } : {};

  return (
    <Tag
      {...extraProps}
      className={clsx(
        "flex items-center justify-between px-4 py-3.5 text-[15px] text-[var(--ios-label)] font-medium ios-separator last:border-b-0 active:bg-zinc-200/50 dark:active:bg-zinc-700/50 transition-colors",
        (onClick || href) && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="truncate">{children}</span>
      </div>
      {trailing && <span className="shrink-0 ml-2 text-[var(--ios-tertiary-label)]">{trailing}</span>}
    </Tag>
  );
}
