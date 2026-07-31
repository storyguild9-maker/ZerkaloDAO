const ASSET_PREFIXES = ["/models/", "/images/", "/videos/", "/vendor-assets/"];

export function assetUrl(url: string) {
  const baseUrl = process.env.NEXT_PUBLIC_ASSET_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl || !url) return url;

  if (url.startsWith("/")) {
    return ASSET_PREFIXES.some((prefix) => url.startsWith(prefix)) ? `${baseUrl}${url}` : url;
  }

  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(url, window.location.origin);
      if (
        parsed.origin === window.location.origin &&
        ASSET_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))
      ) {
        return `${baseUrl}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return url;
    }
  }

  return url;
}

