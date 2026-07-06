<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { enhance } from '$app/forms';
  import type { Exercise } from '$lib/exercises';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // hold === null means a tap-to-count rep (no timer); a number is a timed hold.
  type Step = { slug: string; exercise: string; label: string; hold: number | null };

  // Flatten the program into a flat list of units (one per rep/hold/side).
  function buildSteps(list: Exercise[]): Step[] {
    const steps: Step[] = [];
    for (const ex of list) {
      const setReps = ex.scheme.split(',').map((n) => parseInt(n.trim(), 10));
      const nsets = setReps.length;
      setReps.forEach((reps, i) => {
        const sides = ex.perSide ? ['Left', 'Right'] : [null];
        for (const side of sides) {
          for (let r = 1; r <= reps; r++) {
            const parts = [`Set ${i + 1}/${nsets}`];
            if (side) parts.push(side);
            parts.push(ex.mode === 'hold' ? `hold ${r}/${reps}` : `rep ${r}/${reps}`);
            steps.push({
              slug: ex.slug,
              exercise: ex.name,
              label: parts.join(' · '),
              hold: ex.mode === 'hold' ? (ex.holdSeconds ?? 0) : null
            });
          }
        }
      });
    }
    return steps;
  }

  // The program is static per page load; compute the step list once.
  const steps = untrack(() => buildSteps(data.exercises));

  let index = $state(0);
  let remaining = $state(steps[0]?.hold ?? 0);
  let running = $state(false);
  let done = $state(false);
  // Indices of units the user actually finished (timer hit zero, or tapped Done).
  // Skipping past a unit leaves it out, reducing that exercise's completeness.
  const completed = new SvelteSet<number>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const step = $derived(steps[index]);

  // Per-exercise completion, posted to the server on finish.
  const completion = $derived(
    data.exercises.map((ex) => {
      const idxs = steps.map((s, i) => (s.slug === ex.slug ? i : -1)).filter((i) => i >= 0);
      return {
        slug: ex.slug,
        unit: ex.mode === 'hold' ? 'hold' : 'rep',
        target: idxs.length,
        completed: idxs.filter((i) => completed.has(i)).length
      };
    })
  );

  function markDone() {
    completed.add(index);
  }

  function beep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio is a nice-to-have; a blocked AudioContext must not break the timer.
      console.warn('beep failed', e);
    }
    navigator.vibrate?.(200);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  }

  function tick() {
    remaining -= 1;
    if (remaining <= 0) {
      beep();
      markDone();
      stop();
      next();
    }
  }

  function start() {
    running = true;
    timer = setInterval(tick, 1000);
  }

  // Reps have no timer: tapping Done counts the rep and advances.
  function repDone() {
    markDone();
    next();
  }

  function goto(i: number) {
    stop();
    if (i >= steps.length) {
      done = true;
      return;
    }
    index = Math.max(0, i);
    remaining = steps[index].hold ?? 0;
  }

  const next = () => goto(index + 1);
  const back = () => goto(index - 1);
</script>

<h1>Workout</h1>

{#if steps.length === 0}
  <p>No exercises configured.</p>
{:else if done}
  <article style="text-align:center">
    <h2>🎉 Session complete</h2>
    <form
      method="POST"
      action="?/complete"
      use:enhance={() =>
        async ({ result, update }) => {
          if (result.type === 'success') window.location.href = '/history';
          else await update();
        }}
    >
      <input type="hidden" name="completion" value={JSON.stringify(completion)} />
      <button type="submit">Log it & view history</button>
    </form>
  </article>
{:else}
  <article>
    <hgroup>
      <h2 style="margin-bottom:0">{step.exercise}</h2>
      <p>{step.label}</p>
    </hgroup>

    {#if step.hold === null}
      <p class="timer">✓</p>
    {:else}
      <p class="timer" class:running>{remaining}</p>
      <progress value={step.hold - remaining} max={step.hold}></progress>
    {/if}

    <div class="grid">
      {#if step.hold === null}
        <button onclick={repDone}>Done ✓</button>
      {:else if running}
        <button class="secondary" onclick={stop}>Pause</button>
      {:else}
        <button onclick={start}>Start hold</button>
      {/if}
      <button class="outline" onclick={next}>Skip →</button>
    </div>
    <button class="outline secondary" onclick={back} disabled={index === 0}>← Back</button>

    <footer>
      <small>Unit {index + 1} of {steps.length}</small>
      <progress value={index} max={steps.length}></progress>
    </footer>
  </article>

  <details>
    <summary>Exercise instructions</summary>
    {#each data.exercises as ex (ex.slug)}
      <article>
        <hgroup>
          <h3 style="margin-bottom:0">{ex.name}</h3>
          <p>
            {ex.scheme}{ex.perSide ? ', each side' : ''}{ex.mode === 'hold'
              ? `, ${ex.holdSeconds}s holds`
              : ', reps'}
          </p>
        </hgroup>
        <img src={ex.image} alt="How to perform the {ex.name}" style="max-width:100%" />
        <p>{ex.description}</p>
        <details>
          <summary>More detail</summary>
          <p>{ex.details}</p>
          {#if ex.video}
            <p><a href={ex.video} target="_blank" rel="noopener">▶ Watch a video</a></p>
          {/if}
        </details>
      </article>
    {/each}
  </details>
{/if}
