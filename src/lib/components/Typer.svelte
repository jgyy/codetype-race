<script lang="ts">
  interface Props {
    target: string;
    onComplete: (r: { wpm: number; accuracy: number; durationMs: number }) => void;
  }
  let { target, onComplete }: Props = $props();

  let typed = $state('');
  let startedAt: number | null = null;
  let finished = $state(false);

  let correct = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < typed.length && i < target.length; i++) {
      if (typed[i] === target[i]) n++;
    }
    return n;
  });
  let accuracy = $derived(typed.length === 0 ? 1 : correct / typed.length);

  function onInput(e: Event) {
    const v = (e.target as HTMLTextAreaElement).value;
    if (!startedAt && v.length > 0) startedAt = Date.now();
    typed = v;
    if (!finished && v === target && startedAt) {
      finished = true;
      const durationMs = Date.now() - startedAt;
      const wpm = correct / 5 / (durationMs / 60_000);
      onComplete({ wpm, accuracy, durationMs });
    }
  }
</script>

<pre class="target">{target}</pre>
<textarea
  class:finished
  spellcheck="false"
  autocapitalize="none"
  {...{ autocorrect: 'off' }}
  value={typed}
  oninput={onInput}
  disabled={finished}
  rows={Math.max(6, target.split('\n').length)}
  aria-label="Type the snippet above"
></textarea>
<div class="stats" role="status" aria-live="polite">
  <span>chars <strong>{typed.length}</strong>/{target.length}</span>
  <span class="sep">·</span>
  <span>accuracy <strong>{(accuracy * 100).toFixed(1)}%</strong></span>
  {#if finished}
    <span class="badge">Complete ✓</span>
  {/if}
</div>

<style>
  .target {
    background: var(--bg-elev);
    padding: var(--space-3);
    border-radius: var(--radius);
    white-space: pre-wrap;
    border: 1px solid var(--border);
    margin: 0 0 var(--space-2);
    overflow-x: auto;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-inset);
    color: var(--text);
    border: 1px solid var(--border-strong);
    padding: var(--space-3);
    font: inherit;
    border-radius: var(--radius);
    resize: vertical;
    transition: border-color 120ms ease, background 120ms ease;
  }
  textarea:focus {
    border-color: var(--accent);
  }
  textarea.finished {
    border-color: var(--success);
    background: rgba(126, 226, 168, 0.06);
    color: var(--text-muted);
  }
  .stats {
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-variant-numeric: tabular-nums;
    flex-wrap: wrap;
  }
  .stats .sep {
    color: var(--text-dim);
  }
  .badge {
    margin-left: auto;
    background: rgba(126, 226, 168, 0.12);
    color: var(--success);
    border: 1px solid rgba(126, 226, 168, 0.3);
    padding: 2px var(--space-2);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
</style>
