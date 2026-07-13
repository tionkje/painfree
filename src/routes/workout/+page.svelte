<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { goto as navigate } from '$app/navigation';
  import { exercises, type Exercise } from '$lib/exercises';
  import { logSession } from '$lib/client/sessions.svelte';
  import { timers } from '$lib/client/settings.svelte';
  import type { CompletionEntry } from '$lib/sync';

  // hold === null means a tap-to-count rep (no timer); a number is a timed hold.
  // Pause steps (Rest/Reposition) have no slug — they belong to no exercise.
  type Step = { slug: string | null; exercise: string; label: string; hold: number | null };

  // Flatten the program into a flat list of units (one per rep/hold/side), with
  // a rest step between holds in the same position and a reposition step when
  // the next hold is another exercise or side. Reps are tap-paced, so no pause
  // is inserted before them. Zero-length pauses are skipped.
  function buildSteps(list: Exercise[], rest: number, reposition: number): Step[] {
    const units: (Step & { pos: string })[] = [];
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
            units.push({
              slug: ex.slug,
              exercise: ex.name,
              label: parts.join(' · '),
              hold: ex.mode === 'hold' ? (ex.holdSeconds ?? 0) : null,
              pos: `${ex.slug}/${side}`
            });
          }
        }
      });
    }
    const steps: Step[] = [];
    units.forEach((u, i) => {
      if (i > 0 && u.hold !== null) {
        const move = u.pos !== units[i - 1].pos;
        const seconds = move ? reposition : rest;
        if (seconds > 0) {
          steps.push({
            slug: null,
            exercise: move ? 'Reposition' : 'Rest',
            label: `next: ${u.exercise} · ${u.label}`,
            hold: seconds
          });
        }
      }
      steps.push(u);
    });
    return steps;
  }

  // The program is static per page load; compute the step list once.
  const steps = untrack(() => buildSteps(exercises, timers.restSeconds, timers.repositionSeconds));

  let index = $state(0);
  let remaining = $state(steps[0]?.hold ?? 0);
  let running = $state(false);
  let done = $state(false);
  // Indices of units the user actually finished (timer hit zero, or tapped Done).
  // Skipping past a unit leaves it out, reducing that exercise's completeness.
  const completed = new SvelteSet<number>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const step = $derived(steps[index]);

  // Time-remaining display. Pauses count toward the exercise they lead into
  // (buildSteps only inserts a pause before a unit, so a pause always has a
  // following unit). Tap-paced reps have no duration and count as 0s.
  const stepSlugs = steps.map(
    (s, i) => s.slug ?? steps.slice(i + 1).find((n) => n.slug)?.slug ?? null
  );
  const durations = steps.map((s) => s.hold ?? 0);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  const currentSlug = $derived(stepSlugs[index]);
  const currentEx = $derived(exercises.find((e) => e.slug === currentSlug));
  const nextEx = $derived(exercises[exercises.findIndex((e) => e.slug === currentSlug) + 1]);
  const exerciseDuration = $derived(
    durations.reduce((t, d, j) => (stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const exerciseLeft = $derived(
    remaining +
      durations.reduce((t, d, j) => (j > index && stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const totalLeft = $derived(remaining + durations.reduce((t, d, j) => (j > index ? t + d : t), 0));

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Per-exercise completion, logged to the local store on finish. Pause steps
  // have no slug, so they never count towards any exercise.
  const completion = $derived<CompletionEntry[]>(
    exercises.map((ex) => {
      const idxs = steps.map((s, i) => (s.slug === ex.slug ? i : -1)).filter((i) => i >= 0);
      return {
        slug: ex.slug,
        unit: ex.mode === 'hold' ? 'hold' : 'rep',
        target: idxs.length,
        completed: idxs.filter((i) => completed.has(i)).length
      };
    })
  );

  // Local-first: write the session to the store (which syncs in the background)
  // and go straight to history — no network round-trip on the completion path.
  function finish() {
    logSession(completion);
    void navigate('/history');
  }

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

  // One start runs the whole workout: hitting zero beeps and rolls straight
  // into the next step; the timer only stops on pause, a rep, or completion.
  function tick() {
    remaining -= 1;
    if (remaining > 0) return;
    beep();
    markDone();
    next();
  }

  function start() {
    running = true;
    timer = setInterval(tick, 1000);
  }

  // Reps have no timer: tapping Done counts the rep and advances, resuming the
  // auto-run when the next step is timed.
  function repDone() {
    markDone();
    next();
    if (!done && !running && step.hold !== null) start();
  }

  // Manual skip/back keeps a running timer running; landing on a tap-paced rep
  // halts it until Done is tapped.
  function goto(i: number) {
    if (i >= steps.length) {
      stop();
      done = true;
      return;
    }
    index = Math.max(0, i);
    remaining = steps[index].hold ?? 0;
    if (steps[index].hold === null) stop();
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
    <button onclick={finish}>Log it & view history</button>
  </article>
{:else}
  <article>
    <hgroup>
      <h2 class="current-ex">{currentEx?.name}</h2>
      <p class="next-ex">Next: {nextEx?.name ?? 'Done 🎉'}</p>
    </hgroup>
    <p class="step-label">{step.slug ? step.label : `${step.exercise} — ${step.label}`}</p>

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
        <button onclick={start}>Start</button>
      {/if}
      <button class="outline" onclick={next}>Skip →</button>
    </div>
    <button class="outline secondary" onclick={back} disabled={index === 0}>← Back</button>

    <footer>
      <div class="time-row">
        <span>Exercise</span>
        <strong>{fmt(exerciseLeft)}</strong>
      </div>
      <progress value={exerciseDuration - exerciseLeft} max={exerciseDuration}></progress>
      <div class="time-row">
        <span>Total</span>
        <strong>{fmt(totalLeft)}</strong>
      </div>
      <progress value={totalDuration - totalLeft} max={totalDuration}></progress>
      <small>Step {index + 1} of {steps.length}</small>
    </footer>
  </article>

  <details>
    <summary>Exercise instructions</summary>
    {#each exercises as ex (ex.slug)}
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
