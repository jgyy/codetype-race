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
  input {
    padding: 0.4rem;
    background: #0a0b0e;
    color: #e6e6e6;
    border: 1px solid #333;
  }
  button {
    padding: 0.4rem 0.9rem;
    background: #2a3140;
    color: #e6e6e6;
    border: 1px solid #444;
    cursor: pointer;
  }
  .err {
    color: #f48771;
  }
</style>
