<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const fmt = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
</script>

<hgroup>
	<h1>History</h1>
	<p>🔥 {data.streak} day streak · {data.sessions.length} sessions total</p>
</hgroup>

{#if data.sessions.length === 0}
	<p>No sessions yet. <a href="/workout">Do your first workout.</a></p>
{:else}
	<table>
		<thead>
			<tr><th>#</th><th>Completed</th></tr>
		</thead>
		<tbody>
			{#each data.sessions as s, i (s.id)}
				<tr>
					<td>{data.sessions.length - i}</td>
					<td>{fmt.format(new Date(s.completedAt))}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
