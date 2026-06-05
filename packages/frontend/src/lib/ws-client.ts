import type { WSServerMessage, WSClientMessage } from "@agenthub/shared";
import { getWebSocketUrl } from "./runtime-config";
import { useAuthStore } from "../stores/auth-store";

export type WSEventHandler = (msg: WSServerMessage) => void;
type SafeWebSocket = { addEventListener: WebSocket["addEventListener"]; readyState: number; send: WebSocket["send"]; close: WebSocket["close"] };

let _globalSend: ((msg: WSClientMessage) => void) | null = null;

export function setGlobalSend(send: (msg: WSClientMessage) => void) {
  _globalSend = send;
}

export function getGlobalSend(): (msg: WSClientMessage) => void {
  return _globalSend ?? (() => { console.warn("[WS] No global send registered"); });
}

export function createAgentSocket(serverUrl?: string, token?: string) {
  if (typeof window === "undefined") {
    const noop = () => {};
    return {
      ws: null as unknown as SafeWebSocket,
      send: noop,
      onEvent: noop,
      close: noop,
      onReady: (_cb: () => void) => {},
    };
  }
  const url = serverUrl ?? getWebSocketUrl();
  const ws = new WebSocket(url);
  const handlers: WSEventHandler[] = [];
  const sendQueue: WSClientMessage[] = [];
  let readyCallback: (() => void) | null = null;
  let isAuthenticated = false;

  const flushQueue = () => {
    if (ws.readyState !== WebSocket.OPEN || !isAuthenticated) return;
    while (sendQueue.length > 0) {
      const queued = sendQueue.shift();
      if (queued) ws.send(JSON.stringify(queued));
    }
  };

  // Send auth message on connection open
  ws.addEventListener("open", () => {
    if (token) {
      ws.send(JSON.stringify({ type: "auth", token }));
    }
  }, { once: true });

  ws.addEventListener("message", (raw) => {
    try {
      const data = JSON.parse(raw.data);
      // "connected" message means auth succeeded
      if (data.type === "connected") {
        isAuthenticated = true;
        readyCallback?.();
        flushQueue();
        return;
      }
      for (const h of handlers) h(data as WSServerMessage);
    } catch {}
  });

  ws.addEventListener("error", () => {
    console.warn("[WS] Connection error");
  });

  ws.addEventListener("close", (event) => {
    if (event.code === 4001) {
      console.warn("[WS] Auth failed, redirecting to login");
      try {
        useAuthStore.getState().logout();
      } catch {
        localStorage.removeItem("agenthub-auth-token");
      }
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
  });

  const sendFn = (msg: WSClientMessage) => {
    if (ws.readyState === WebSocket.OPEN && isAuthenticated) {
      ws.send(JSON.stringify(msg));
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING || (ws.readyState === WebSocket.OPEN && !isAuthenticated)) {
      sendQueue.push(msg);
      return;
    }
    console.warn("[WS] Dropped message because socket is closed", msg.type);
  };

  setGlobalSend(sendFn);

  return {
    ws,
    send: sendFn,
    onEvent(handler: WSEventHandler) { handlers.push(handler); },
    onReady(cb: () => void) {
      if (isAuthenticated) { cb(); return; }
      readyCallback = cb;
    },
    close() { handlers.length = 0; ws.close(); },
  };
}
