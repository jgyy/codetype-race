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
  spellcheck="false"
  autocapitalize="none"
  {...{ autocorrect: 'off' }}
  value={typed}
  oninput={onInput}
  disabled={finished}
  rows={Math.max(6, target.split('\n').length)}
></textarea>
<p class="stats">
  chars: {typed.length}/{target.length} · accuracy: {(accuracy * 100).toFixed(1)}%
  {#if finished}<strong> · finished</strong>{/if}
</p>

<style>
  .target {
    background: #16171c;
    padding: 0.75rem;
    border-radius: 4px;
    white-space: pre-wrap;
    border: 1px solid #222;
  }
  textarea {
    width: 100%;
    background: #0a0b0e;
    color: #e6e6e6;
    border: 1px solid #333;
    padding: 0.75rem;
    font: inherit;
    border-radius: 4px;
    resize: vertical;
  }
  .stats {
    color: #888;
  }
</style>
