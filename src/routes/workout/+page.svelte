<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Exercise } from '$lib/server/schema';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Step = { exercise: string; label: string; hold: number };

	// Flatten the program into a flat list of timed holds.
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
						parts.push(`hold ${r}/${reps}`);
						steps.push({ exercise: ex.name, label: parts.join(' · '), hold: ex.holdSeconds });
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

	function tick() {
		remaining -= 1;
		if (remaining <= 0) {
			beep();
			stop();
			next();
		}
	}

	function start() {
		if (running || !step) return;
		running = true;
		timer = setInterval(tick, 1000);
	}

	function goto(i: number) {
		stop();
		if (i >= steps.length) {
			done = true;
			return;
		}
		index = Math.max(0, i);
		remaining = steps[index].hold;
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
		<progress value={step.hold - remaining} max={step.hold}></progress>

		<div class="grid">
			{#if running}
				<button class="secondary" onclick={stop}>Pause</button>
			{:else}
				<button onclick={start}>Start hold</button>
			{/if}
			<button class="outline" onclick={next}>Skip →</button>
		</div>
		<button class="outline secondary" onclick={back} disabled={index === 0}>← Back</button>

		<footer>
			<small>Hold {index + 1} of {steps.length}</small>
			<progress value={index} max={steps.length}></progress>
		</footer>
	</article>

	<details>
		<summary>Exercise instructions</summary>
		{#each data.exercises as ex (ex.slug)}
			<p><strong>{ex.name}</strong> ({ex.scheme}{ex.perSide ? ', each side' : ''}, {ex.holdSeconds}s holds)<br />{ex.description}</p>
		{/each}
	</details>
{/if}
