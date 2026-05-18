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
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--text-muted);
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    position: sticky;
    top: 0;
    background: var(--bg);
  }
  td:nth-child(1) {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    width: 3rem;
  }
  td:nth-child(2) {
    font-weight: 600;
  }
  td:nth-child(n + 3) {
    font-variant-numeric: tabular-nums;
  }
  tbody tr:hover {
    background: var(--bg-elev);
  }
</style>
