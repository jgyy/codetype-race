<script lang="ts">
  let { data } = $props();
</script>

<h1>Leaderboard — {data.snippet.title}</h1>
<p class="meta">
  {data.snippet.language} · {data.snippet.topic} · ★{data.snippet.difficulty} ·
  <a href="/race/{data.snippet.id}">Race this snippet</a>
</p>

{#if data.rows.length === 0}
  <p>No attempts yet. <a href="/race/{data.snippet.id}">Be the first.</a></p>
{:else}
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>User</th>
        <th>WPM</th>
        <th>Accuracy</th>
        <th>Time</th>
        <th>When</th>
      </tr>
    </thead>
    <tbody>
      {#each data.rows as r, i}
        <tr class:guest={r.isGuest === 1}>
          <td>{i + 1}</td>
          <td>{r.handle}</td>
          <td>{r.wpm.toFixed(1)}</td>
          <td>{(r.accuracy * 100).toFixed(1)}%</td>
          <td>{(r.durationMs / 1000).toFixed(1)}s</td>
          <td>{new Date(r.createdAt).toLocaleString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .meta {
    color: #888;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #1c1d22;
  }
  th {
    color: #9cdcfe;
  }
  tr.guest td {
    color: #888;
  }
</style>
