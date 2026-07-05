<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<hgroup>
	<h1>McGill Big 3</h1>
	<p>Daily back routine. Do it every day.</p>
</hgroup>

{#if data.doneToday}
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
		<h2 style="margin:0">🔥 {data.streak}</h2>
		<small>day streak</small>
	</article>
	<article>
		<h2 style="margin:0">{data.total}</h2>
		<small>total sessions</small>
	</article>
</div>

<a href="/workout" role="button" class="contrast">Start today's workout →</a>
