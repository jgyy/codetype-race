<script lang="ts">
  import Typer from '$lib/components/Typer.svelte';
  let { data } = $props();

  type RaceResult = { wpm: number; accuracy: number; durationMs: number };

  let result = $state<RaceResult | null>(null);
  let saving = $state(false);
  let saved = $state(false);
  let saveError = $state<string | null>(null);
  let hint = $state('');
  let hinting = $state(false);
  let question = $state('');

  async function saveAttempt(r: RaceResult) {
    saving = true;
    saveError = null;
    try {
      const res = await fetch('/api/attempt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snippetId: data.snippet.id, ...r })
      });
      if (res.ok) {
        saved = true;
      } else {
        saveError = `Server returned ${res.status}`;
      }
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Network error';
    } finally {
      saving = false;
    }
  }

  async function onComplete(r: RaceResult) {
    result = r;
    await saveAttempt(r);
  }

  async function retrySave() {
    if (result) await saveAttempt(result);
  }

  async function askHint() {
    if (hinting || !question.trim()) return;
    hinting = true;
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snippetId: data.snippet.id, topic: data.snippet.topic, question })
      });
      if (res.ok) {
        const j = await res.json();
        hint = j.hint;
      } else {
        hint = `(${res.status}) ${await res.text()}`;
      }
    } finally {
      hinting = false;
    }
  }
</script>

<h1>{data.snippet.title}</h1>
<p class="meta">
  <span class="chip">{data.snippet.language}</span>
  <span class="chip">{data.snippet.topic}</span>
  <a href="/s/{data.snippet.id}/leaderboard">leaderboard for this snippet →</a>
</p>

<Typer target={data.snippet.body} {onComplete} />

{#if result}
  <section class="result">
    <h2>Result</h2>
    <p class="stats">
      <strong>{result.wpm.toFixed(1)} WPM</strong>
      <span class="sep">·</span>
      accuracy <strong>{(result.accuracy * 100).toFixed(1)}%</strong>
      <span class="sep">·</span>
      <strong>{(result.durationMs / 1000).toFixed(1)}s</strong>
    </p>
    <p class="save-status">
      {#if saving}
        <span class="pill pending">Saving…</span>
      {:else if saved}
        <span class="pill ok">Saved ✓</span>
      {:else if saveError}
        <span class="pill err">Save failed: {saveError}</span>
        <button class="retry" onclick={retrySave} disabled={saving}>Retry</button>
      {/if}
    </p>
  </section>
{/if}

<section class="hint">
  <h2>Stuck? Ask Claude for a hint</h2>
  <p class="hint-help">Conceptual questions only — Claude is instructed not to give full solutions.</p>
  <textarea
    bind:value={question}
    rows="2"
    placeholder="e.g. What's the time complexity I should aim for?"
  ></textarea>
  <button onclick={askHint} disabled={!question.trim() || hinting}>
    {hinting ? 'Thinking…' : 'Get hint'}
  </button>
  {#if hint}<pre class="hint-body">{hint}</pre>{/if}
</section>

<style>
  .meta {
    color: var(--text-muted);
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }
  .chip {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    padding: 2px var(--space-2);
    border-radius: 999px;
    font-size: 12px;
  }
  .result {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
    margin-top: var(--space-4);
  }
  .result h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .stats {
    font-size: 1.1rem;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .stats .sep {
    color: var(--text-dim);
    margin: 0 var(--space-1);
  }
  .save-status {
    margin: var(--space-2) 0 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .pill {
    display: inline-block;
    padding: 2px var(--space-2);
    border-radius: 999px;
    font-size: 12px;
    border: 1px solid transparent;
  }
  .pill.pending {
    background: rgba(156, 220, 254, 0.1);
    color: var(--accent);
    border-color: rgba(156, 220, 254, 0.3);
  }
  .pill.ok {
    background: rgba(126, 226, 168, 0.12);
    color: var(--success);
    border-color: rgba(126, 226, 168, 0.3);
  }
  .pill.err {
    background: rgba(255, 122, 99, 0.12);
    color: var(--danger);
    border-color: rgba(255, 122, 99, 0.35);
  }
  .retry {
    background: var(--bg-inset);
    color: var(--text);
    border: 1px solid var(--border-strong);
    padding: 2px var(--space-3);
    border-radius: var(--radius-sm);
    font: inherit;
  }
  .hint {
    margin-top: var(--space-5);
  }
  .hint-help {
    color: var(--text-muted);
    margin: 0 0 var(--space-2);
    font-size: 13px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-inset);
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
    font: inherit;
  }
  .hint-body {
    background: var(--bg-elev);
    padding: var(--space-3);
    border-left: 3px solid var(--accent);
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
    margin-top: var(--space-3);
  }
  button {
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-sm);
    font: inherit;
    font-weight: 600;
  }
  button:hover:not(:disabled) {
    background: var(--accent-strong);
  }
</style>
