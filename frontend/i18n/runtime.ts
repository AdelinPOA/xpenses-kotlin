import enMessages from "../messages/en.json";

export function onError(error: Error) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[i18n] Missing key:", error.message);
  }
}

export function getMessageFallback({
  namespace,
  key,
}: {
  error?: Error;
  namespace?: string;
  key: string;
}): string {
  try {
    const path = namespace ? `${namespace}.${key}` : key;
    const value = path.split(".").reduce((obj: unknown, k: string) => {
      if (obj && typeof obj === "object" && k in (obj as Record<string, unknown>)) {
        return (obj as Record<string, unknown>)[k];
      }
      return undefined;
    }, enMessages as unknown);
    if (typeof value === "string") return value;
  } catch {
    // fall through
  }
  return namespace ? `${namespace}.${key}` : key;
}
