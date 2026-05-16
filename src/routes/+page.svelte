<script lang="ts">
  let { data } = $props();
</script>

<h1>Race a snippet</h1>
<p>
  Async code-typing leaderboard. Public users compete with a session ID; sign in to keep
  history, stats, and spaced-repetition reviews.
</p>

<ul class="snippets">
  {#each data.snippets as s}
    <li>
      <a href="/race/{s.id}">{s.title}</a>
      <span class="meta">{s.language} · {s.topic} · ★{s.difficulty}</span>
    </li>
  {/each}
</ul>

<style>
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
