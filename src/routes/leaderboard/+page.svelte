<script lang="ts">
  let { data } = $props();
</script>

<h1>Leaderboard</h1>
<p>Best WPM per signed-in user. Anonymous attempts are recorded but not ranked.</p>

<table>
  <thead>
    <tr><th>#</th><th>User</th><th>Best WPM</th><th>Avg acc</th><th>Runs</th></tr>
  </thead>
  <tbody>
    {#each data.rows as r, i}
      <tr>
        <td>{i + 1}</td>
        <td>{r.handle}</td>
        <td>{r.bestWpm?.toFixed(1) ?? '—'}</td>
        <td>{r.avgAccuracy != null ? `${(r.avgAccuracy * 100).toFixed(1)}%` : '—'}</td>
        <td>{r.runs}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #1c1d22;
  }
  th {
    color: #888;
    font-weight: normal;
  }
</style>
