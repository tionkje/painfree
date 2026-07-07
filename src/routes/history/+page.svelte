<script lang="ts">
  import { orderedLive } from '$lib/client/sessions.svelte';
  import { currentStreak } from '$lib/streak';
  import { completionPercent } from '$lib/history';

  const fmt = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const live = $derived(orderedLive());
  const streak = $derived(
    currentStreak(
      live.map((s) => new Date(s.completedAt)),
      new Date()
    )
  );
  const rows = $derived(
    live.map((s) => ({
      uuid: s.uuid,
      completedAt: s.completedAt,
      percent: completionPercent(s.exercises)
    }))
  );
</script>

<hgroup>
  <h1>History</h1>
  <p>🔥 {streak} day streak · {rows.length} sessions total</p>
</hgroup>

{#if rows.length === 0}
  <p>No sessions yet. <a href="/workout">Do your first workout.</a></p>
{:else}
  <table>
    <thead>
      <tr><th>#</th><th>Completed</th><th>Done</th></tr>
    </thead>
    <tbody>
      {#each rows as s, i (s.uuid)}
        <tr>
          <td>{rows.length - i}</td>
          <td>{fmt.format(new Date(s.completedAt))}</td>
          <td>{s.percent === null ? '—' : s.percent === 100 ? '🎯 100%' : `${s.percent}%`}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
