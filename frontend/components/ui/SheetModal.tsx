"use client";

import { useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function SheetModal({ open, onClose, children, title }: Props) {
  const dragY = useRef(0);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.y > threshold || info.velocity.y > 400) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            style={{ touchAction: "none" }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--ios-card-bg)] rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-xl will-change-transform"
          >
            {/* Drag handle */}
            <div className="flex items-center justify-between px-5 py-3 shrink-0">
              <div className="w-9" />
              <div className="w-9 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600 mx-auto" />
              {title ? (
                <button onClick={onClose} className="text-[var(--ios-blue)] text-[17px] font-semibold w-9 text-right">
                  Done
                </button>
              ) : (
                <div className="w-9" />
              )}
            </div>

            {title && (
              <div className="px-5 pb-3 shrink-0">
                <h2 className="text-[18px] font-semibold text-[var(--ios-label)]">{title}</h2>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
