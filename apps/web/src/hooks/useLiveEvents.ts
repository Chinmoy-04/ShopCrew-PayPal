import { useEffect } from "react";

type Handler = (event: { type: string; [key: string]: unknown }) => void;
const handlers = new Set<Handler>();

export function onLive(handler: Handler) {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function useLiveEvents() {
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        handlers.forEach((handler) => handler(event));
      } catch (error) {
        console.warn("Bad SSE payload", error);
      }
    };
    source.onerror = () => {
      /* browser reconnects; don't throw into React */
    };
    return () => source.close();
  }, []);
}
