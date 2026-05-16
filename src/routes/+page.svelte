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
    background: #14161b;
    border: 1px solid #2a2d35;
    padding: 1rem 1.25rem;
    margin: 1rem 0 1.5rem;
  }
  .featured h2 {
    margin-top: 0;
  }
  .board {
    list-style: decimal;
    padding-left: 1.5rem;
  }
  .board li {
    padding: 0.25rem 0;
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 1rem;
  }
  .board li.guest .handle {
    color: #888;
    font-style: italic;
  }
  .stat {
    color: #9cdcfe;
    font-variant-numeric: tabular-nums;
  }
  .more {
    margin-top: 0.5rem;
  }
  .snippets {
    list-style: none;
    padding: 0;
  }
  .snippets li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #1c1d22;
    display: flex;
    justify-content: space-between;
  }
  .meta {
    color: #777;
  }
</style>
