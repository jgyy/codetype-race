<script lang="ts">
  let { data } = $props();
</script>

<h1>Profile</h1>

<section>
  <h2>Topics due for review</h2>
  {#if data.due.length === 0}
    <p>Nothing due — go race something fresh.</p>
  {:else}
    <ul>
      {#each data.due as t}
        <li>{t.topic} · ease {t.ease.toFixed(2)} · reps {t.repetitions}</li>
      {/each}
    </ul>
  {/if}
</section>

<section>
  <h2>Recent attempts</h2>
  <table>
    <thead><tr><th>Snippet</th><th>Topic</th><th>WPM</th><th>Acc</th><th>When</th></tr></thead>
    <tbody>
      {#each data.history as h}
        <tr>
          <td>{h.title}</td>
          <td>{h.topic}</td>
          <td>{h.wpm.toFixed(1)}</td>
          <td>{(h.accuracy * 100).toFixed(1)}%</td>
          <td>{new Date(h.createdAt).toLocaleString()}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<style>
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.4rem 0.6rem; border-bottom: 1px solid #1c1d22; text-align: left; }
  th { color: #888; font-weight: normal; }
</style>
