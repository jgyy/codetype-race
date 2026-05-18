<script lang="ts">
  let { data, children } = $props();
</script>

<header>
  <nav>
    <a class="brand" href="/">codetype-race</a>
    <div class="links">
      <a href="/leaderboard">Leaderboard</a>
      {#if data.user}
        <a href="/profile">{data.user.handle}</a>
        <form method="POST" action="/login?/logout"><button>Logout</button></form>
      {:else}
        <a href="/login">Login</a>
      {/if}
    </div>
  </nav>
</header>

<main>{@render children()}</main>

<style>
  :global(:root) {
    /* Design tokens — single source of truth for colors, spacing, type */
    --bg: #0e0f13;
    --bg-elev: #14161b;
    --bg-inset: #0a0b0e;
    --border: #2a2d35;
    --border-strong: #3a3f4a;
    --text: #e6e6e6;
    --text-muted: #9aa0a8;
    --text-dim: #6b7079;
    --accent: #9cdcfe;
    --accent-strong: #c5e7ff;
    --danger: #ff7a63;
    --success: #7ee2a8;
    --focus: #4ea3ff;
    --radius: 6px;
    --radius-sm: 4px;
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  :global(body) {
    font: 14px/1.5 var(--font-mono);
    margin: 0;
    background: var(--bg);
    color: var(--text);
  }
  :global(a) {
    color: var(--accent);
  }
  :global(a:hover) {
    color: var(--accent-strong);
  }
  :global(*:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  :global(button) {
    cursor: pointer;
  }
  :global(button:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }
  header {
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border);
    background: var(--bg-elev);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  nav {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    justify-content: space-between;
    max-width: 960px;
    margin: 0 auto;
    flex-wrap: wrap;
  }
  .brand {
    font-weight: 600;
    color: var(--accent-strong);
    text-decoration: none;
  }
  .links {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    flex-wrap: wrap;
  }
  .links a {
    text-decoration: none;
  }
  nav form {
    display: inline;
  }
  nav button {
    background: none;
    border: 1px solid var(--border-strong);
    color: var(--text);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    font: inherit;
  }
  nav button:hover {
    background: var(--bg-inset);
  }
  main {
    padding: var(--space-5);
    max-width: 960px;
    margin: 0 auto;
  }
  @media (max-width: 600px) {
    main {
      padding: var(--space-4);
    }
    nav {
      gap: var(--space-2);
    }
  }
</style>
