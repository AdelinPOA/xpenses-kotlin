"use client";

import { useEffect, useRef, useCallback } from "react";

interface Props {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

/**
 * iOS-style large title header that collapses on scroll.
 *
 * Perf-optimized: uses refs + direct DOM manipulation instead of
 * setState on scroll. No React re-renders during scroll.
 */
export default function LargeHeader({ title, subtitle, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const rafRef = useRef<number>(0);
  const offsetTopRef = useRef(0);

  // Measure offset once after mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    offsetTopRef.current = el.getBoundingClientRect().top + window.scrollY;
  }, []);

  // rAF-throttled scroll handler — NO setState, direct style mutation
  const updateTransforms = useCallback(() => {
    const scrollY = window.scrollY;
    const progress = Math.min(
      Math.max((scrollY - offsetTopRef.current + 20) / 60, 0),
      1
    );

    const scale = 1 - progress * 0.25;
    const opacity = 1 - progress;
    const translateY = progress * -8;

    if (titleRef.current) {
      titleRef.current.style.transform = `scale(${scale}) translateY(${translateY}px)`;
      titleRef.current.style.opacity = String(opacity);
    }
    if (subtitleRef.current) {
      subtitleRef.current.style.transform = `translateY(${translateY}px)`;
      subtitleRef.current.style.opacity = String(opacity);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current) return; // Already scheduled
      rafRef.current = requestAnimationFrame(() => {
        updateTransforms();
        rafRef.current = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateTransforms]);

  return (
    <div ref={containerRef} className="pt-12 px-4 pb-2 md:pt-0 md:px-0">
      <div className="md:hidden" style={{ height: subtitle ? 88 : 64 }}>
        <h1
          ref={titleRef}
          className="ios-large-title text-[var(--ios-label)] origin-bottom-left will-change-[transform,opacity]"
          style={{ transform: "scale(1) translateY(0px)", opacity: 1 }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            ref={subtitleRef}
            className="text-[15px] text-[var(--ios-secondary-label)] mt-0.5 will-change-[transform,opacity]"
            style={{ transform: "translateY(0px)", opacity: 1 }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && (
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
