<script lang="ts">
  let { data } = $props();
</script>

<h1>Race a snippet</h1>
<p>
  Async code-typing leaderboard. {data.racers} racer{data.racers === 1 ? '' : 's'} so far —
  public users compete with a session ID; sign in to keep history, stats, and spaced-repetition
  reviews.
</p>

{#if data.featured}
  <section class="featured">
    <h2>
      Featured race: <a href="/race/{data.featured.id}">{data.featured.title}</a>
      <span class="meta">· {data.featured.language} · {data.featured.topic}</span>
    </h2>
    {#if data.featuredLeaderboard.length === 0}
      <p>No attempts yet — <a href="/race/{data.featured.id}">set the first time</a>.</p>
    {:else}
      <ol class="board">
        {#each data.featuredLeaderboard as r}
          <li class:guest={r.isGuest === 1}>
            <span class="handle">{r.handle}</span>
            <span class="stat">{r.wpm.toFixed(1)} WPM</span>
            <span class="stat">{(r.accuracy * 100).toFixed(1)}%</span>
          </li>
        {/each}
      </ol>
      <p class="more">
        <a href="/s/{data.featured.id}/leaderboard">See all attempts on this snippet →</a>
      </p>
    {/if}
  </section>
{/if}

<h2>All snippets</h2>
<ul class="snippets">
  {#each data.snippets as s}
    <li>
      <a href="/race/{s.id}">{s.title}</a>
      <span class="meta">
        {s.language} · {s.topic} · ★{s.difficulty} ·
        <a href="/s/{s.id}/leaderboard">leaderboard</a>
      </span>
    </li>
  {/each}
</ul>

<style>
  .featured {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-4) var(--space-5);
    margin: var(--space-4) 0 var(--space-5);
  }
  .featured h2 {
    margin-top: 0;
    font-size: 1rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .featured h2 a {
    color: var(--accent-strong);
    font-size: 1.1rem;
  }
  .board {
    list-style: decimal;
    padding-left: var(--space-5);
    margin: var(--space-3) 0 0;
  }
  .board li {
    padding: var(--space-1) 0;
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--space-4);
  }
  .board li.guest .handle {
    color: var(--text-muted);
    font-style: italic;
  }
  .stat {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .more {
    margin-top: var(--space-2);
  }
  .snippets {
    list-style: none;
    padding: 0;
  }
  .snippets li {
    padding: var(--space-3) var(--space-2);
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    border-radius: var(--radius-sm);
    transition: background 120ms ease;
  }
  .snippets li:hover {
    background: var(--bg-elev);
  }
  .snippets li > a:first-child {
    font-weight: 600;
  }
  .meta {
    color: var(--text-muted);
    font-size: 13px;
  }
  @media (max-width: 600px) {
    .featured {
      padding: var(--space-3);
    }
    .snippets li {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-1);
    }
  }
</style>
