<script lang="ts">
  import Typer from '$lib/components/Typer.svelte';
  let { data } = $props();

  let result = $state<null | { wpm: number; accuracy: number; durationMs: number }>(null);
  let saving = $state(false);
  let saved = $state(false);
  let hint = $state('');
  let question = $state('');

  async function onComplete(r: { wpm: number; accuracy: number; durationMs: number }) {
    result = r;
    saving = true;
    const res = await fetch('/api/attempt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ snippetId: data.snippet.id, ...r })
    });
    saving = false;
    saved = res.ok;
  }

  async function askHint() {
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
  }
</script>

<h1>{data.snippet.title}</h1>
<p class="meta">{data.snippet.language} · {data.snippet.topic}</p>

<Typer target={data.snippet.body} {onComplete} />

{#if result}
  <section class="result">
    <h2>Result</h2>
    <p>
      <strong>{result.wpm.toFixed(1)} WPM</strong> · accuracy {(result.accuracy * 100).toFixed(1)}%
      · {(result.durationMs / 1000).toFixed(1)}s
      {#if saving}· saving…{:else if saved}· saved ✓{:else}· save failed{/if}
    </p>
  </section>
{/if}

<section class="hint">
  <h2>Stuck? Ask Claude for a hint</h2>
  <textarea bind:value={question} rows="2" placeholder="Conceptual question only — no full solutions."></textarea>
  <button onclick={askHint} disabled={!question.trim()}>Get hint</button>
  {#if hint}<pre class="hint-body">{hint}</pre>{/if}
</section>

<style>
  .meta {
    color: #888;
  }
  textarea {
    width: 100%;
    background: #0a0b0e;
    color: #e6e6e6;
    border: 1px solid #333;
    padding: 0.5rem;
    font: inherit;
  }
  .hint-body {
    background: #16171c;
    padding: 0.75rem;
    border-left: 3px solid #9cdcfe;
    white-space: pre-wrap;
  }
  button {
    margin-top: 0.5rem;
    padding: 0.4rem 0.9rem;
    background: #2a3140;
    color: #e6e6e6;
    border: 1px solid #444;
    cursor: pointer;
  }
</style>
