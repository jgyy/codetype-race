<script lang="ts">
  let { data, children } = $props();
</script>

<header>
  <nav>
    <a href="/">codetype-race</a>
    <a href="/leaderboard">Leaderboard</a>
    {#if data.user}
      <a href="/profile">{data.user.handle}</a>
      <form method="POST" action="/login?/logout"><button>Logout</button></form>
    {:else}
      <a href="/login">Login</a>
    {/if}
  </nav>
</header>

<main>{@render children()}</main>

<style>
  :global(body) {
    font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    margin: 0;
    background: #0e0f13;
    color: #e6e6e6;
  }
  header {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #222;
  }
  nav {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  nav a {
    color: #9cdcfe;
    text-decoration: none;
  }
  nav form {
    display: inline;
  }
  nav button {
    background: none;
    border: 1px solid #333;
    color: #ccc;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
  }
  main {
    padding: 1.25rem;
    max-width: 960px;
    margin: 0 auto;
  }
</style>
