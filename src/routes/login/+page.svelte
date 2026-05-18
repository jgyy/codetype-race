<script lang="ts">
  let { form } = $props();
</script>

<h1>Sign in</h1>
<p>Handle (2–24 chars, alphanumeric/_/-) + numeric PIN (4–8 digits).</p>
{#if form?.error}<p class="err">{form.error}</p>{/if}

<form method="POST" action="?/login">
  <label>Handle <input name="handle" required /></label>
  <label>PIN <input name="pin" type="password" inputmode="numeric" required /></label>
  <button type="submit">Login</button>
  <button type="submit" formaction="?/register">Register</button>
</form>

<style>
  form {
    display: grid;
    gap: 0.6rem;
    max-width: 320px;
  }
  label {
    display: grid;
    gap: var(--space-1);
    font-size: 13px;
    color: var(--text-muted);
  }
  input {
    padding: var(--space-2);
    background: var(--bg-inset);
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    font: inherit;
  }
  input:focus {
    border-color: var(--accent);
    outline: none;
  }
  button {
    padding: var(--space-2) var(--space-4);
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: var(--radius-sm);
    font: inherit;
    font-weight: 600;
  }
  button[formaction="?/register"] {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--border-strong);
  }
  .err {
    color: var(--danger);
    background: rgba(255, 122, 99, 0.1);
    border: 1px solid rgba(255, 122, 99, 0.3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-weight: 500;
  }
</style>
