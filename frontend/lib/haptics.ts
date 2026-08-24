/**
 * Triggers a light haptic feedback on supported mobile devices (iOS / Android browsers).
 * Gracefully no-ops if Vibration API is unavailable or blocked.
 */
export function triggerHaptic(duration: number = 10): void {
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignore environments where vibrate is unsupported or restricted
    }
  }
}
