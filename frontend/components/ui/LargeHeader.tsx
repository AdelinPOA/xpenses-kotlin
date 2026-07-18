"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";

interface Props {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function LargeHeader({ title, subtitle, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    setOffsetTop(top);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const progress = Math.min(Math.max((scrollY - offsetTop + 20) / 60, 0), 1);

  const titleScale = 1 - progress * 0.25;
  const titleOpacity = 1 - progress;
  const subtitleOpacity = 1 - progress;
  const translateY = progress * -8;

  return (
    <div ref={ref} className="pt-12 px-4 pb-2 md:pt-0 md:px-0">
      <div className="md:hidden" style={{ height: subtitle ? 88 : 64 }}>
        <motion.h1
          className="ios-large-title text-[var(--ios-label)] origin-bottom-left"
          style={{
            scale: titleScale,
            opacity: titleOpacity,
            y: translateY,
          }}
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            className="text-[15px] text-[var(--ios-secondary-label)] mt-0.5"
            style={{ opacity: subtitleOpacity, y: translateY }}
          >
            {subtitle}
          </motion.p>
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
