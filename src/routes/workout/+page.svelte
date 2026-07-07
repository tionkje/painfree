<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { Exercise } from '$lib/exercises';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Step = { exercise: string; label: string; seconds: number };

  // Flatten the program into a flat list of timed holds, with a rest step
  // between holds in the same position and a reposition step when the next
  // hold is another exercise or side. Zero-length pauses are skipped.
  function buildSteps(list: Exercise[], rest: number, reposition: number): Step[] {
    const holds: (Step & { pos: string })[] = [];
    for (const ex of list) {
      const setReps = ex.scheme.split(',').map((n) => parseInt(n.trim(), 10));
      const nsets = setReps.length;
      setReps.forEach((reps, i) => {
        const sides = ex.perSide ? ['Left', 'Right'] : [null];
        for (const side of sides) {
          for (let r = 1; r <= reps; r++) {
            const parts = [`Set ${i + 1}/${nsets}`];
            if (side) parts.push(side);
            parts.push(`hold ${r}/${reps}`);
            holds.push({
              exercise: ex.name,
              label: parts.join(' · '),
              seconds: ex.holdSeconds,
              pos: `${ex.slug}/${side}`
            });
          }
        }
      });
    }
    const steps: Step[] = [];
    holds.forEach((h, i) => {
      if (i > 0) {
        const move = h.pos !== holds[i - 1].pos;
        const seconds = move ? reposition : rest;
        if (seconds > 0) {
          steps.push({
            exercise: move ? 'Reposition' : 'Rest',
            label: `next: ${h.exercise} · ${h.label}`,
            seconds
          });
        }
      }
      steps.push(h);
    });
    return steps;
  }

  // The program is static per page load; compute the step list once.
  const steps = untrack(() =>
    buildSteps(data.exercises, data.settings.restSeconds, data.settings.repositionSeconds)
  );

  let index = $state(0);
  let remaining = $state(steps[0]?.seconds ?? 0);
  let running = $state(false);
  let done = $state(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  const step = $derived(steps[index]);

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

  // One start runs the whole workout: hitting zero beeps and rolls straight
  // into the next step; the timer only stops on pause or completion.
  function tick() {
    remaining -= 1;
    if (remaining > 0) return;
    beep();
    next();
  }

  function start() {
    running = true;
    timer = setInterval(tick, 1000);
  }

  // Manual skip/back keeps the timer running if it was running.
  function goto(i: number) {
    if (i >= steps.length) {
      stop();
      done = true;
      return;
    }
    index = Math.max(0, i);
    remaining = steps[index].seconds;
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
      <button type="submit">Log it & view history</button>
    </form>
  </article>
{:else}
  <article>
    <hgroup>
      <h2 style="margin-bottom:0">{step.exercise}</h2>
      <p>{step.label}</p>
    </hgroup>

    <p class="timer" class:running>{remaining}</p>
    <progress value={step.seconds - remaining} max={step.seconds}></progress>

    <div class="grid">
      {#if running}
        <button class="secondary" onclick={stop}>Pause</button>
      {:else}
        <button onclick={start}>Start</button>
      {/if}
      <button class="outline" onclick={next}>Skip →</button>
    </div>
    <button class="outline secondary" onclick={back} disabled={index === 0}>← Back</button>

    <footer>
      <small>Step {index + 1} of {steps.length}</small>
      <progress value={index} max={steps.length}></progress>
    </footer>
  </article>

  <details>
    <summary>Exercise instructions</summary>
    {#each data.exercises as ex (ex.slug)}
      <article>
        <hgroup>
          <h3 style="margin-bottom:0">{ex.name}</h3>
          <p>{ex.scheme}{ex.perSide ? ', each side' : ''}, {ex.holdSeconds}s holds</p>
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
