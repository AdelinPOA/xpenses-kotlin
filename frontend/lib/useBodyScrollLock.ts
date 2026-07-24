"use client";

import { useEffect, useRef } from "react";

let lockCount = 0;
let previousOverflow = "";

export function useBodyScrollLock(locked: boolean) {
  const prevRef = useRef<string>("");

  useEffect(() => {
    if (locked) {
      if (lockCount === 0) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
      }
      lockCount++;
      prevRef.current = document.body.style.overflow;
    }
    return () => {
      if (locked) {
        lockCount--;
        if (lockCount <= 0) {
          document.body.style.overflow = previousOverflow;
          lockCount = 0;
        }
      }
    };
  }, [locked]);
}
