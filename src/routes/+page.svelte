<script lang="ts">
  import { orderedLive } from '$lib/client/sessions.svelte';
  import { currentStreak, doneToday } from '$lib/streak';

  const live = $derived(orderedLive());
  const dates = $derived(live.map((s) => new Date(s.completedAt)));
  const now = new Date();
  const streak = $derived(currentStreak(dates, now));
  const done = $derived(doneToday(dates, now));
</script>

<hgroup>
  <h1>McGill Big 3</h1>
  <p>Daily back routine. Do it every day.</p>
</hgroup>

{#if done}
  <article style="background: var(--pico-ins-color); color: white;">
    <strong>✅ Done today.</strong> Nice — come back tomorrow.
  </article>
{:else}
  <article style="background: var(--pico-del-color); color: white;">
    <strong>❌ Not done today.</strong> Get on the mat.
  </article>
{/if}

<div class="grid">
  <article>
    <h2 style="margin:0">🔥 {streak}</h2>
    <small>day streak</small>
  </article>
  <article>
    <h2 style="margin:0">{live.length}</h2>
    <small>total sessions</small>
  </article>
</div>

<a href="/workout" role="button" class="contrast">Start today's workout →</a>
