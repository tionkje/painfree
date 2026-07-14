<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { goto as navigate } from '$app/navigation';
  import { exercises } from '$lib/exercises';
  import { buildSteps, nextUnit, type Step } from '$lib/workout';
  import { startSession, updateSession } from '$lib/client/sessions.svelte';
  import { timers } from '$lib/client/settings.svelte';
  import { countdownTick, exerciseDone, holdDone, lastRep, setDone } from '$lib/client/audio';
  import { RATING_LABELS, type CompletionEntry } from '$lib/sync';

  // The program is static per page load; compute the step list once.
  const steps = untrack(() => buildSteps(exercises, timers.restSeconds, timers.repositionSeconds));

  let index = $state(0);
  let remaining = $state(steps[0]?.hold ?? 0);
  let running = $state(false);
  let started = $state(false);
  let prep = $state(0);
  let done = $state(false);
  // Indices of units the user actually finished (timer hit zero, or tapped Done).
  // Skipping past a unit leaves it out, reducing that exercise's completeness.
  const completed = new SvelteSet<number>();
  let timer: ReturnType<typeof setInterval> | null = null;

  // Difficulty per exercise (1–5), set in the end-of-session dialog.
  let ratings = $state<Record<string, number | null>>(
    Object.fromEntries(exercises.map((e) => [e.slug, null]))
  );
  let notes = $state('');
  let sessionUuid: string | null = null;

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
  const exerciseDuration = $derived(
    durations.reduce((t, d, j) => (stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const exerciseLeft = $derived(
    remaining +
      durations.reduce((t, d, j) => (j > index && stepSlugs[j] === currentSlug ? t + d : t), 0)
  );
  const totalLeft = $derived(remaining + durations.reduce((t, d, j) => (j > index ? t + d : t), 0));

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // What the athlete is doing or about to do: pause steps display the unit they
  // lead into, which keeps the reposition target and side switch on screen.
  const displayStep = $derived(step.kind === 'unit' ? step : nextUnit(steps, index));
  const upcoming = $derived(displayStep ? nextUnit(steps, steps.indexOf(displayStep)) : null);

  // What the athlete should be doing RIGHT NOW, as one word.
  const mode = $derived(
    prep > 0
      ? 'prep'
      : !running && step.hold !== null
        ? 'paused'
        : step.kind === 'unit'
          ? 'active'
          : step.kind
  );
  const MODE_LABEL: Record<string, string> = {
    prep: 'GET READY',
    active: 'GO',
    rest: 'REST',
    reposition: 'REPOSITION',
    paused: 'PAUSED'
  };

  const image = $derived(
    displayStep?.side === 'Left'
      ? (currentEx?.imageLeft ?? currentEx?.image)
      : displayStep?.side === 'Right'
        ? (currentEx?.imageRight ?? currentEx?.image)
        : currentEx?.image
  );

  // "Next:" names what follows the displayed unit — the next exercise (with
  // side), a side switch, or the next rep of the same position.
  function describeNext(u: Step | null, from: Step | null): string {
    if (!u) return 'Done 🎉';
    if (u.slug !== from?.slug) return `${u.exercise}${u.side ? ` — ${u.side}` : ''}`;
    if (u.side !== from.side) return `Switch to ${u.side}`;
    return `${u.hold !== null ? 'Hold' : 'Rep'} ${u.rep}/${u.repCount}`;
  }
  const nextLabel = $derived(describeNext(upcoming, displayStep));

  // Per-exercise completion, logged to the local store on finish. Pause steps
  // have no slug, so they never count towards any exercise.
  const completion = $derived<CompletionEntry[]>(
    exercises.map((ex) => {
      const idxs = steps.map((s, i) => (s.slug === ex.slug ? i : -1)).filter((i) => i >= 0);
      return {
        slug: ex.slug,
        unit: ex.mode === 'hold' ? 'hold' : 'rep',
        target: idxs.length,
        completed: idxs.filter((i) => completed.has(i)).length,
        rating: ratings[ex.slug] ?? null
      };
    })
  );

  // The session exists from the first action and is upserted (and synced)
  // after every unit — abandoning mid-workout still keeps what was done.
  // There is no separate save step; the rating dialog updates the same session.
  function persist() {
    if (sessionUuid === null) sessionUuid = startSession(completion);
    else updateSession(sessionUuid, { exercises: completion, notes });
  }

  function markDone() {
    completed.add(index);
    persist();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
    prep = 0;
  }

  // One start runs the whole workout: hitting zero rolls straight into the
  // next step; the timer only stops on pause, a tap-rep, or completion. The
  // first `prep` ticks after a Start press count down the get-ready phase
  // before the hold's own clock begins.
  function tick() {
    if (prep > 0) {
      prep -= 1;
      if (prep > 0) countdownTick();
      return;
    }
    remaining -= 1;
    if (remaining > 0) {
      // Audible 3-2-1 lead-in to the next hold during rest/reposition.
      if (step.kind !== 'unit' && remaining <= 3) countdownTick();
      return;
    }
    if (step.kind === 'unit') {
      markDone();
      finishSound();
    }
    next();
  }

  // Distinct completion sounds: exercise finished > set finished (reposition
  // next) > plain hold done. The last-rep heads-up fires in goto().
  function finishSound() {
    const upcoming = nextUnit(steps, index);
    if (!upcoming || upcoming.slug !== step.slug) exerciseDone();
    else if (steps[index + 1]?.kind === 'reposition') setDone();
    else holdDone();
  }

  function start() {
    running = true;
    // 3s get-ready before a hold; pauses are their own preparation.
    if (step.kind === 'unit' && step.hold !== null) {
      prep = 3;
      countdownTick();
    }
    timer = setInterval(tick, 1000);
  }

  // Intro → session. A tap-paced first step just shows its Done button.
  function begin() {
    started = true;
    persist();
    if (step.hold !== null) start();
  }

  function saveAndFinish() {
    persist();
    void navigate('/history');
  }

  // Reps have no timer: tapping Done counts the rep and advances, resuming the
  // auto-run when the next step is timed.
  function repDone() {
    markDone();
    finishSound();
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
    prep = 0;
    index = Math.max(0, i);
    remaining = steps[index].hold ?? 0;
    if (steps[index].hold === null) stop();
    const s = steps[index];
    // Heads-up when the final rep of a multi-rep set starts mid-run.
    if (running && s.kind === 'unit' && s.rep === s.repCount && s.repCount > 1) lastRep();
  }

  const next = () => goto(index + 1);
  const back = () => goto(index - 1);
</script>

{#if steps.length === 0}
  <p>No exercises configured.</p>
{:else if done}
  <article>
    <h2 style="text-align:center">🎉 Session complete</h2>
    <p style="text-align:center">How hard was each exercise?</p>
    {#each exercises as ex (ex.slug)}
      <fieldset>
        <legend><strong>{ex.name}</strong></legend>
        {#each RATING_LABELS as label, i (label)}
          <label>
            <input
              type="radio"
              name="rating-{ex.slug}"
              value={i + 1}
              bind:group={ratings[ex.slug]}
            />
            {label}
          </label>
        {/each}
      </fieldset>
    {/each}
    <label>
      Notes
      <textarea bind:value={notes} rows="3" placeholder="Anything to remember?"></textarea>
    </label>
    <button onclick={saveAndFinish}>Save</button>
  </article>
{:else if !started}
  <h1>Workout</h1>
  <article>
    <hgroup>
      <h2>{exercises.map((e) => e.name).join(' · ')}</h2>
      <p>{fmt(totalDuration)} total</p>
    </hgroup>
    <button class="start-big" onclick={begin}>Start workout</button>
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
{:else}
  <div class="session" data-mode={mode}>
    <div class="banner">{MODE_LABEL[mode]}</div>
    <hgroup class="who">
      <h2>{displayStep?.exercise}{displayStep?.side ? ` — ${displayStep.side}` : ''}</h2>
      <p class="next">Next: {nextLabel}</p>
    </hgroup>

    <div class="counts">
      <div><small>Set</small><strong>{displayStep?.set}/{displayStep?.setCount}</strong></div>
      <div>
        <small>{displayStep?.hold !== null ? 'Hold' : 'Rep'}</small>
        <strong>{displayStep?.rep}/{displayStep?.repCount}</strong>
      </div>
    </div>

    <p class="big-timer">{prep > 0 ? prep : step.hold === null ? '✓' : remaining}</p>
    {#if step.hold !== null && prep === 0}
      <progress value={step.hold - remaining} max={step.hold}></progress>
    {/if}

    {#if image}
      <img src={image} alt="How to perform the {displayStep?.exercise}" />
    {/if}
    <p class="cue">{displayStep?.cue ? `💡 ${displayStep.cue}` : ''}</p>

    <div class="grid controls">
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
  </div>
{/if}

<style>
  .start-big {
    width: 100%;
    font-size: 1.4rem;
  }
  .session {
    /* "Fullscreen": a fixed overlay beats the Fullscreen API (works on iOS). */
    position: fixed;
    inset: 0;
    z-index: 10;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 1rem;
    background: var(--pico-background-color);
    text-align: center;
    --state: #6c757d; /* prep + paused grey */
  }
  .session[data-mode='active'] {
    --state: #2e7d32; /* go green */
  }
  .session[data-mode='rest'] {
    --state: #b58900; /* rest amber */
  }
  .session[data-mode='reposition'] {
    --state: #1565c0; /* reposition blue */
  }
  .banner {
    width: 100%;
    padding: 0.4rem;
    border-radius: var(--pico-border-radius);
    font-weight: 700;
    letter-spacing: 0.25em;
    color: #fff;
    background: var(--state);
  }
  .who {
    margin-bottom: 0;
  }
  .next {
    color: var(--pico-muted-color);
  }
  /* Fixed two-column grid + tabular digits: Set stays left, Hold/Rep stays
     right, and the numbers never shift position during the session. */
  .counts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    max-width: 22rem;
    font-variant-numeric: tabular-nums;
  }
  .counts small {
    display: block;
    color: var(--pico-muted-color);
  }
  .counts strong {
    font-size: 2.2rem;
  }
  .big-timer {
    font-size: clamp(4rem, 28vw, 8rem);
    line-height: 1;
    margin: 0;
    font-variant-numeric: tabular-nums;
    color: var(--state);
  }
  .session img {
    max-height: 18vh;
    max-width: 100%;
  }
  /* Reserve the cue's space so the layout never jumps between reps. */
  .cue {
    min-height: 2.6rem;
    margin: 0;
  }
  .controls {
    width: 100%;
    max-width: 22rem;
  }
  .session footer {
    width: 100%;
    max-width: 26rem;
    margin-top: auto;
  }
  .time-row {
    display: flex;
    justify-content: space-between;
  }
</style>
