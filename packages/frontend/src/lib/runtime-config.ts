const LOCAL_BACKEND_PORT = "3002";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return trimTrailingSlash(configured);

  if (typeof window !== "undefined") {
    const { protocol, hostname, host, port } = window.location;
    if (isLocalHost(hostname) && port !== LOCAL_BACKEND_PORT) {
      return `${protocol}//${hostname}:${LOCAL_BACKEND_PORT}`;
    }
    return `${protocol}//${host}`;
  }

  return `http://localhost:${LOCAL_BACKEND_PORT}`;
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function getWebSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (configured) return configured;

  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith("https://")) {
    return `wss://${apiBase.slice("https://".length)}/api/ws`;
  }
  if (apiBase.startsWith("http://")) {
    return `ws://${apiBase.slice("http://".length)}/api/ws`;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/api/ws`;
  }

  return `ws://localhost:${LOCAL_BACKEND_PORT}/api/ws`;
}
