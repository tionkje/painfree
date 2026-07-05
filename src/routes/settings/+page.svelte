<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<hgroup>
	<h1>Settings</h1>
	<p>Edit or delete past workout sessions.</p>
</hgroup>

{#if data.sessions.length === 0}
	<p>No sessions yet. <a href="/workout">Do your first workout.</a></p>
{:else}
	<table>
		<thead>
			<tr><th>Completed</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.sessions as s (s.id)}
				<tr>
					<td>
						<form method="POST" action="?/update" use:enhance style="margin:0">
							<input type="hidden" name="id" value={s.id} />
							<div class="grid">
								<input type="datetime-local" name="completedAt" value={s.completedAt} />
								<button type="submit">Save</button>
							</div>
						</form>
					</td>
					<td>
						<form
							method="POST"
							action="?/delete"
							use:enhance
							style="margin:0"
							onsubmit={(e) => {
								if (!confirm('Delete this session?')) e.preventDefault();
							}}
						>
							<input type="hidden" name="id" value={s.id} />
							<button type="submit" class="outline secondary">Delete</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
