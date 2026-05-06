"use client";
import { WS_API } from "../config";

export type IncomingHandler = (msg: any) => void;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private lastSentCursor = 0;
  private cursorIntervalMs = 100; // 10 Hz throttle, plan §117
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private code: string,
    private displayName: string,
    private onMessage: IncomingHandler,
  ) {}

  connect() {
    const url = `${WS_API}?code=${encodeURIComponent(
      this.code,
    )}&display_name=${encodeURIComponent(this.displayName)}`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {}
    };
    this.ws.onopen = () => {
      this.heartbeat = setInterval(() => this.send({ action: "ping" }), 5000);
    };
    this.ws.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
    };
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  cursor(progress: number, chars_typed: number, errors: number) {
    const now = Date.now();
    if (now - this.lastSentCursor < this.cursorIntervalMs) return;
    this.lastSentCursor = now;
    this.send({ action: "cursor", progress, chars_typed, errors });
  }

  start() {
    this.send({ action: "start" });
  }

  finish(chars_typed: number, errors: number) {
    this.send({ action: "finish", chars_typed, errors });
  }
}
