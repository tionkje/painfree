<script lang="ts">
  import {
    orderedLive,
    editCompletedAt,
    deleteSession,
    updateSession,
    backfill
  } from '$lib/client/sessions.svelte';
  import { timers, setTimers } from '$lib/client/settings.svelte';
  import { toLocalInput } from '$lib/datetime';
  import { RATING_LABELS, type CompletionEntry } from '$lib/sync';

  const rows = $derived(
    orderedLive().map((s) => ({
      uuid: s.uuid,
      value: toLocalInput(new Date(s.completedAt)),
      notes: s.notes ?? '',
      exercises: s.exercises
    }))
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
  function saveRating(
    uuid: string,
    exercises: CompletionEntry[],
    slug: string,
    value: string
  ): void {
    updateSession(uuid, {
      exercises: exercises.map((e) =>
        e.slug === slug ? { ...e, rating: value === '' ? null : Number(value) } : e
      )
    });
  }
  function saveNotes(uuid: string, notes: string) {
    updateSession(uuid, { notes });
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
  {#each rows as r (r.uuid)}
    <article>
      <div class="grid">
        <input
          type="datetime-local"
          value={r.value}
          onchange={(e) => save(r.uuid, e.currentTarget.value)}
        />
        <button class="outline secondary" onclick={() => remove(r.uuid)}>Delete</button>
      </div>
      <details>
        <summary>Ratings & notes</summary>
        {#each r.exercises as ex (ex.slug)}
          <label>
            {ex.slug}
            <select
              value={ex.rating ?? ''}
              onchange={(e) => saveRating(r.uuid, r.exercises, ex.slug, e.currentTarget.value)}
            >
              <option value="">unrated</option>
              {#each RATING_LABELS as name, i (name)}
                <option value={i + 1}>{name}</option>
              {/each}
            </select>
          </label>
        {/each}
        {#if r.exercises.length === 0}
          <p>No exercise data for this session.</p>
        {/if}
        <label>
          Notes
          <textarea
            rows="2"
            value={r.notes}
            onchange={(e) => saveNotes(r.uuid, e.currentTarget.value)}></textarea>
        </label>
      </details>
    </article>
  {/each}
{/if}
