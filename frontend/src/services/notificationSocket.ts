import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { API_ORIGIN } from "./apiClient";

let socket: Socket | null = null;
let refCount = 0;

function getToken() {
  return localStorage.getItem("collegeos_token");
}

export function acquireNotificationSocket() {
  refCount += 1;
  if (!socket) {
    socket = io(`${API_ORIGIN}/notifications`, {
      transports: ["websocket", "polling"],
      auth: { token: getToken() },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  } else if (!socket.connected) {
    socket.auth = { token: getToken() };
    socket.connect();
  }
  return socket;
}

export function releaseNotificationSocket() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socket) {
    socket.disconnect();
    socket = null;
  }
}

export function useNotificationSocket(
  enabled: boolean,
  handlers: {
    onNew?: (n: any) => void;
    onUnread?: (payload: { unreadCount: number }) => void;
  },
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const s = acquireNotificationSocket();
    const onNew = (n: any) => handlersRef.current.onNew?.(n);
    const onUnread = (p: any) => handlersRef.current.onUnread?.(p);
    s.on("notification:new", onNew);
    s.on("notification:unread", onUnread);
    const onConnect = () => {
      s.auth = { token: getToken() };
    };
    s.on("connect_error", () => {});
    s.on("reconnect_attempt", onConnect);
    return () => {
      s.off("notification:new", onNew);
      s.off("notification:unread", onUnread);
      s.off("reconnect_attempt", onConnect);
      releaseNotificationSocket();
    };
  }, [enabled]);
}
