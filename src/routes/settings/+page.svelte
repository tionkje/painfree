<script lang="ts">
  import {
    orderedLive,
    editCompletedAt,
    deleteSession,
    backfill
  } from '$lib/client/sessions.svelte';
  import { timers, setTimers } from '$lib/client/settings.svelte';
  import { toLocalInput } from '$lib/datetime';

  const rows = $derived(
    orderedLive().map((s) => ({ uuid: s.uuid, value: toLocalInput(new Date(s.completedAt)) }))
  );

  // Prefilled with "now" for the backfill form.
  let newDate = $state(toLocalInput(new Date()));

  // Local copies so the inputs are editable before saving.
  let restSeconds = $state(timers.restSeconds);
  let repositionSeconds = $state(timers.repositionSeconds);

  function saveTimers() {
    setTimers({ restSeconds, repositionSeconds });
  }
  function save(uuid: string, value: string) {
    editCompletedAt(uuid, new Date(value));
  }
  function remove(uuid: string) {
    if (confirm('Delete this session?')) deleteSession(uuid);
  }
  function add() {
    backfill(new Date(newDate));
  }
</script>

<hgroup>
  <h1>Settings</h1>
  <p>Workout timers and past sessions.</p>
</hgroup>

<article>
  <h2 style="margin-top:0">Timers</h2>
  <div class="grid">
    <label>
      Rest between holds (s)
      <input type="number" name="restSeconds" min="0" max="600" bind:value={restSeconds} />
    </label>
    <label>
      Repositioning time (s)
      <input
        type="number"
        name="repositionSeconds"
        min="0"
        max="600"
        bind:value={repositionSeconds}
      />
    </label>
  </div>
  <button onclick={saveTimers}>Save timers</button>
</article>

<article>
  <h2 style="margin-top:0">Add a past session</h2>
  <div class="grid">
    <input type="datetime-local" name="newDate" bind:value={newDate} />
    <button onclick={add}>Add</button>
  </div>
</article>

<h2>Sessions</h2>
{#if rows.length === 0}
  <p>No sessions yet. <a href="/workout">Do your first workout.</a></p>
{:else}
  <table>
    <thead>
      <tr><th>Completed</th><th></th></tr>
    </thead>
    <tbody>
      {#each rows as r (r.uuid)}
        <tr>
          <td>
            <input
              type="datetime-local"
              value={r.value}
              onchange={(e) => save(r.uuid, e.currentTarget.value)}
            />
          </td>
          <td>
            <button class="outline secondary" onclick={() => remove(r.uuid)}>Delete</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
