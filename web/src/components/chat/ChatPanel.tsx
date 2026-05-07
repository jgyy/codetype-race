"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatEntry } from "@/lib/machines/roomMachine";

interface Props {
  messages: ChatEntry[];
  onSend: (text: string) => void;
}

const MAX_LEN = 280;

export function ChatPanel({ messages, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, MAX_LEN));
    setDraft("");
  }

  return (
    <aside className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
      <h3 className="mb-2 text-xs uppercase text-neutral-500">Chat</h3>
      <ol
        ref={listRef}
        className="max-h-60 space-y-1 overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <li className="text-xs text-neutral-500">No messages yet.</li>
        )}
        {messages.map((m) => (
          <li key={`${m.ts}-${m.display_name}`} className="break-words">
            <span className="font-mono text-emerald-400">{m.display_name}</span>
            <span className="text-neutral-500"> · </span>
            <span>{m.text}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
          placeholder="say something…"
          maxLength={MAX_LEN}
          className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <p className="mt-1 text-right text-xs text-neutral-600">
        {draft.length}/{MAX_LEN}
      </p>
    </aside>
  );
}
