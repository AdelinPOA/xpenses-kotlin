"use client";

import { useEffect, useState } from "react";
import api, { API_BASE_URL } from "@/lib/api";

interface AuthorizedImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
}

/**
 * Loads API-protected images through the shared Axios client so expired
 * access tokens transparently trigger single-flight /auth/refresh retries
 * instead of rendering broken 401 thumbnails.
 */
export default function AuthorizedImage({
  src,
  alt = "",
  ...rest
}: AuthorizedImageProps) {
  const needsAuthFetch =
    src.startsWith(`${API_BASE_URL}/`) || src.startsWith("/api/");
  const [objectUrl, setObjectUrl] = useState<string | null>(
    needsAuthFetch ? null : src,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsAuthFetch) {
      setObjectUrl(src);
      setFailed(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    const requestPath = src.startsWith(`${API_BASE_URL}/`)
      ? src.slice(API_BASE_URL.length)
      : src.replace(/^\/api/, "");

    api
      .get<Blob>(requestPath, { responseType: "blob" })
      .then((response) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(response.data);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, needsAuthFetch]);

  if (failed || !objectUrl) {
    return null;
  }

  return <img src={objectUrl} alt={alt} {...rest} />;
}
