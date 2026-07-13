# Workout Overhaul 4/4 — Always-Stored Sessions + Ratings + Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A session is stored (and synced) the moment the workout starts and after every completed unit — no end-of-session save confirmation. The completion screen becomes a rating dialog: 5 difficulty options per exercise plus a notes field and one Save button. Ratings and notes are stored per session, synced to the DB, and editable later on /settings.

**Architecture:** `CompletionEntry` gains `rating`, `ClientSession` gains `notes` (both optional for backward compatibility with existing localStorage data). The store's `logSession` is replaced by `startSession` (create at workout start) + `updateSession` (upsert exercises/notes). Server side: nullable `notes` column on `sessions`, nullable `rating` on `session_exercises`, passed through `/api/sync`. Reconcile/LWW logic is untouched — sessions still merge wholesale by `updatedAt`.

**Tech Stack:** Drizzle + SQLite migration (plain nullable `ADD COLUMN` — the hand-edit gotcha from `drizzle/0003_*` does NOT apply), Zod, Svelte 5.

**Depends on:** Plan 3 (the page's `begin()`/`started` structure and `markDone()`).

## Global Constraints

- pnpm only; use `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm test:coverage`, `pnpm format`.
- Coverage gate: 100% statements/functions/lines; 100% branches on `.ts`.
- Offline-first: all writes go through the localStorage store first; `/api/sync` stays a background target.
- New migration via `pnpm db:generate` — never hand-write migration journal entries.
- Commit after each task.

## Rating scale (used everywhere)

`1 = Way too easy · 2 = Too easy · 3 = Just right · 4 = Too hard · 5 = Way too hard`, `null` = unrated. Labels live in ONE place: `RATING_LABELS` in `src/lib/sync.ts`.

---

### Task 1: Types + rating labels

**Files:**

- Modify: `src/lib/sync.ts`

**Interfaces:**

- Produces: `CompletionEntry.rating?: number | null`, `ClientSession.notes?: string`, `export const RATING_LABELS: string[]`. `ServerSession` picks up `notes` automatically via the existing `Omit`.

- [ ] **Step 1: Edit `src/lib/sync.ts`**

Replace the `CompletionEntry` type with:

```ts
export type CompletionEntry = {
  slug: string;
  unit: 'hold' | 'rep';
  target: number;
  completed: number;
  // Perceived difficulty 1 (way too easy) … 5 (way too hard); null/absent = unrated.
  rating?: number | null;
};

// Index+1 = the stored rating value. The single source of the 5-option scale.
export const RATING_LABELS = ['Way too easy', 'Too easy', 'Just right', 'Too hard', 'Way too hard'];
```

In `ClientSession`, add one field after `synced: boolean;`:

```ts
  // Free-form note from the end-of-session dialog; absent on pre-notes sessions.
  notes?: string;
```

- [ ] **Step 2: Verify nothing broke**

Run: `pnpm check && pnpm test`
Expected: clean and all PASS (both fields are optional; `src/lib/sync.test.ts` needs no changes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync.ts
git commit -m "feat: rating + notes fields on the sync types"
```

---

### Task 2: Store — startSession / updateSession

**Files:**

- Modify: `src/lib/client/sessions.svelte.ts`
- Test: `src/lib/client/sessions.svelte.test.ts`

**Interfaces:**

- Consumes: Task 1 types.
- Produces: `startSession(exercises: CompletionEntry[]): string` (returns the new uuid), `updateSession(uuid: string, patch: { exercises?: CompletionEntry[]; notes?: string }): void`. **`logSession` is deleted** — the workout page (Task 4) is its only caller.

- [ ] **Step 1: Write the failing tests**

In `src/lib/client/sessions.svelte.test.ts`, replace the `'logSession appends an unsynced session and persists'` test with these four (same `describe('mutations', …)` block, using the existing `cs`/`fetchOk` helpers):

```ts
it('startSession stores an in-progress session immediately and returns its uuid', async () => {
  const f = fetchOk();
  const uuid = store.startSession([{ slug: 'a', unit: 'hold', target: 10, completed: 0 }]);
  expect(state.sessions).toHaveLength(1);
  expect(state.sessions[0].uuid).toBe(uuid);
  expect(state.sessions[0].synced).toBe(false);
  expect(state.sessions[0].notes).toBe('');
  expect(localStorage.getItem('sessions')).toContain('"slug":"a"');
  await vi.waitFor(() => expect(f).toHaveBeenCalled());
});
it('updateSession patches exercises and notes, bumps updatedAt, marks unsynced', async () => {
  fetchOk();
  state.sessions = [cs({ uuid: 'u', synced: true })];
  store.updateSession('u', {
    exercises: [{ slug: 'a', unit: 'hold', target: 10, completed: 10, rating: 3 }],
    notes: 'felt good'
  });
  expect(state.sessions[0].exercises[0].rating).toBe(3);
  expect(state.sessions[0].notes).toBe('felt good');
  expect(state.sessions[0].synced).toBe(false);
  expect(state.sessions[0].updatedAt).not.toBe('2026-01-01T10:00:00.000Z');
});
it('updateSession leaves omitted fields untouched', async () => {
  fetchOk();
  state.sessions = [cs({ uuid: 'u', notes: 'keep me' })];
  store.updateSession('u', { exercises: [] });
  expect(state.sessions[0].notes).toBe('keep me');
});
it('updateSession is a no-op for an unknown uuid', () => {
  store.updateSession('nope', { notes: 'x' });
  expect(state.sessions).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/client/sessions.svelte.test.ts`
Expected: FAIL — `store.startSession is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/client/sessions.svelte.ts`, replace the whole `logSession` function with:

```ts
/**
 * Create the session the moment a workout starts — abandoning mid-workout
 * still keeps (and syncs) what was done. Returns the uuid for updateSession.
 */
export function startSession(exercises: CompletionEntry[]): string {
  const t = stamp();
  const uuid = crypto.randomUUID();
  store.sessions.push({
    uuid,
    completedAt: t,
    updatedAt: t,
    deleted: false,
    synced: false,
    notes: '',
    exercises
  });
  write(store.sessions);
  void scheduleSync();
  return uuid;
}

/** Upsert progress / ratings / notes onto an in-progress or past session. */
export function updateSession(
  uuid: string,
  patch: { exercises?: CompletionEntry[]; notes?: string }
): void {
  const s = store.sessions.find((x) => x.uuid === uuid);
  if (!s) return;
  if (patch.exercises) s.exercises = patch.exercises;
  if (patch.notes !== undefined) s.notes = patch.notes;
  s.updatedAt = stamp();
  s.synced = false;
  write(store.sessions);
  void scheduleSync();
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm test src/lib/client/sessions.svelte.test.ts` — Expected: PASS.
Run: `pnpm check` — Expected: ONE error left — `src/routes/workout/+page.svelte` still imports `logSession`. That's Task 4; to keep this commit green, do Task 4's Step 1 (page changes) together with this task **only if you cannot commit otherwise** — otherwise proceed to Task 4 before committing. (Recommended: implement Tasks 2 and 4 in one commit if the pre-commit `check` blocks a split.)

`updatedAt` note: `stamp()` can equal the creation timestamp within the same millisecond — irrelevant for LWW (server wins ties, and it's the same content).

- [ ] **Step 5: Commit** (after the page no longer imports `logSession` — see Task 4)

```bash
git add src/lib/client/sessions.svelte.ts src/lib/client/sessions.svelte.test.ts
git commit -m "feat: sessions are created at workout start and updated in place"
```

---

### Task 3: Server — schema, migration, sync API

**Files:**

- Modify: `src/lib/server/schema.ts`
- Modify: `src/routes/api/sync/+server.ts`
- Create (generated): `drizzle/0005_*.sql`
- Test: `src/routes/api/sync/server.test.ts`

**Interfaces:**

- Consumes: nothing new client-side; the wire format gains `notes` (session level) and `rating` (entry level).
- Produces: `/api/sync` accepts `notes?: string|null` per change and `rating?: number|null` per exercise entry; responses always include `notes` (string, `''` when unset) and `rating` (number|null).

- [ ] **Step 1: Update the failing tests first**

In `src/routes/api/sync/server.test.ts`:

1. In `'upserts a session with exercises and returns it'`, change the pushed entry to `{ slug: 'curl-up', unit: 'hold', target: 12, completed: 6, rating: 3 }` and the assertions to:

```ts
expect(a?.exercises).toEqual([
  { slug: 'curl-up', unit: 'hold', target: 12, completed: 6, rating: 3 }
]);
expect(a?.notes).toBe('');
```

2. Append two new tests at the end of the file:

```ts
test('stores notes and defaults missing ratings to null', async () => {
  const out = await sync([
    {
      uuid: 'n',
      completedAt: iso,
      updatedAt: iso,
      deleted: false,
      notes: 'felt strong',
      exercises: [{ slug: 'bird-dog', unit: 'hold', target: 6, completed: 6 }]
    }
  ]);
  const n = out.find((s) => s.uuid === 'n');
  expect(n?.notes).toBe('felt strong');
  expect(n?.exercises).toEqual([
    { slug: 'bird-dog', unit: 'hold', target: 6, completed: 6, rating: null }
  ]);
});

test('rejects an out-of-range rating', async () => {
  const { POST } = await import('./+server');
  const change = {
    uuid: 'x',
    completedAt: iso,
    updatedAt: iso,
    deleted: false,
    exercises: [{ slug: 's', unit: 'hold', target: 1, completed: 1, rating: 9 }]
  };
  await expect(POST(req({ changes: [change] }))).rejects.toMatchObject({ status: 400 });
});
```

Run: `pnpm test src/routes/api/sync/server.test.ts` — Expected: FAIL (rating stripped by Zod / notes undefined).

- [ ] **Step 2: Extend the schema**

In `src/lib/server/schema.ts`, add to the `sessions` table after `updatedAt: …,`:

```ts
// Free-form note from the end-of-session dialog; null = none.
notes: text('notes');
```

and to `sessionExercises` after `completedUnits: …,`:

```ts
// Perceived difficulty 1 (way too easy) … 5 (way too hard); null = unrated.
rating: integer('rating');
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0005_<name>.sql` containing exactly two nullable `ALTER TABLE … ADD` statements (`sessions.notes` text, `session_exercises.rating` integer). Nullable adds don't hit the SQLite `NOT NULL`/`UNIQUE` gotcha — do NOT hand-edit.

- [ ] **Step 4: Extend the sync endpoint**

In `src/routes/api/sync/+server.ts`:

1. `entrySchema` gains (after `completed: …,`):

```ts
// Old clients / pre-rating sessions omit it.
rating: z.number().int().min(1).max(5).nullish();
```

2. `changeSchema` gains (after `deleted: z.boolean(),`):

```ts
  notes: z.string().nullish(),
```

3. In the upsert, carry notes both on insert and on conflict:

```ts
const { id } = db
  .insert(sessions)
  .values({
    uuid: c.uuid,
    completedAt: c.completedAt,
    updatedAt: c.updatedAt,
    notes: c.notes ?? null
  })
  .onConflictDoUpdate({
    target: sessions.uuid,
    set: { completedAt: c.completedAt, updatedAt: c.updatedAt, notes: c.notes ?? null }
  })
  .returning({ id: sessions.id })
  .get();
```

4. In the exercise-rows insert `.values(…)` map, add `rating: e.rating ?? null` to the mapped object.

5. In the response mapping, add `notes: r.notes ?? '',` to the session object and `rating: e.rating` to the exercise entry object.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test src/routes/api/sync/server.test.ts` — Expected: PASS (8 tests).
Run: `pnpm check` — Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/schema.ts src/routes/api/sync/+server.ts src/routes/api/sync/server.test.ts drizzle
git commit -m "feat: sync notes and per-exercise ratings to the server"
```

---

### Task 4: Workout page — session from start + rating dialog

**Files:**

- Modify: `src/routes/workout/+page.svelte`
- Test: `src/routes/workout/page.svelte.test.ts`

**Interfaces:**

- Consumes: `startSession`/`updateSession` (Task 2), `RATING_LABELS` (Task 1).
- Produces: the `finish()`/"Log it" flow is gone; completion renders the rating dialog whose Save navigates to /history. The session already exists either way.

- [ ] **Step 1: Update the page script**

In `src/routes/workout/+page.svelte` (state after plan 3):

1. Replace the sessions/sync imports:

```ts
import { startSession, updateSession } from '$lib/client/sessions.svelte';
import { RATING_LABELS, type CompletionEntry } from '$lib/sync';
```

2. Add state next to the other `$state` declarations:

```ts
// Difficulty per exercise (1–5), set in the end-of-session dialog.
let ratings = $state<Record<string, number | null>>(
  Object.fromEntries(exercises.map((e) => [e.slug, null]))
);
let notes = $state('');
let sessionUuid: string | null = null;
```

3. In the `completion` derived, add `rating: ratings[ex.slug] ?? null` to the returned entry object (after `completed: …`).

4. Delete `function finish() { … }` and replace `markDone()` and `begin()` with, plus the two new functions:

```ts
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
```

- [ ] **Step 2: Replace the done screen in the template**

Replace the `{:else if done}` branch with:

```svelte
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
```

- [ ] **Step 3: Update the page tests**

In `src/routes/workout/page.svelte.test.ts`:

1. Replace the sessions mock and its imports:

```ts
vi.mock('$lib/client/sessions.svelte', () => ({
  startSession: vi.fn(() => 'uuid-1'),
  updateSession: vi.fn()
}));
```

and where `logSession` was imported:

```ts
import { startSession, updateSession } from '$lib/client/sessions.svelte';
```

In `afterEach`, replace `vi.mocked(logSession).mockClear();` with:

```ts
vi.mocked(startSession).mockClear();
vi.mocked(updateSession).mockClear();
```

2. In `'skip and back navigate; skipping to the end completes and logs'`: rename to `'skip and back navigate; skipping to the end completes'` and delete everything from `await fireEvent.click(screen.getByRole('button', { name: /Log it/ }));` to the end of the test, keeping the `Session complete` assertion.

3. Append two new tests:

```ts
test('begin stores the session immediately; each unit updates it', async () => {
  renderPage(program, 0, 0); // holds only: A, A, B·L, B·R
  await begin();
  expect(vi.mocked(startSession).mock.calls[0][0]).toEqual([
    { slug: 'a', unit: 'hold', target: 2, completed: 0, rating: null },
    { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: null }
  ]);
  await vi.advanceTimersByTimeAsync(5000); // 3s prep + 2s hold → first unit done
  expect(updateSession).toHaveBeenCalledWith('uuid-1', {
    exercises: [
      { slug: 'a', unit: 'hold', target: 2, completed: 1, rating: null },
      { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: null }
    ],
    notes: ''
  });
});

test('completion shows the rating dialog; Save stores ratings + notes', async () => {
  renderPage(program, 0, 0);
  await begin();
  for (let i = 0; i < 4; i++) {
    await fireEvent.click(screen.getByRole('button', { name: 'Skip →' }));
  }
  expect(screen.getByText(/Session complete/)).toBeInTheDocument();
  expect(screen.getAllByRole('radio')).toHaveLength(10); // 5 options × 2 exercises

  await fireEvent.click(screen.getAllByRole('radio', { name: 'Just right' })[0]);
  await fireEvent.click(screen.getAllByRole('radio', { name: 'Too hard' })[1]);
  await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'left side weak' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(vi.mocked(updateSession).mock.lastCall).toEqual([
    'uuid-1',
    {
      exercises: [
        { slug: 'a', unit: 'hold', target: 2, completed: 0, rating: 3 },
        { slug: 'b', unit: 'hold', target: 2, completed: 0, rating: 4 }
      ],
      notes: 'left side weak'
    }
  ]);
  expect(goto).toHaveBeenCalledWith('/history');
});
```

- [ ] **Step 4: Run the gates, then commit (together with Task 2's files if they weren't committable alone)**

Run: `pnpm check && pnpm test` — Expected: clean, all PASS.

```bash
git add src/routes/workout/+page.svelte src/routes/workout/page.svelte.test.ts
git commit -m "feat: sessions persist from the first second; completion becomes a rating dialog"
```

---

### Task 5: Settings page — edit ratings and notes

**Files:**

- Modify: `src/routes/settings/+page.svelte`
- Test: `src/routes/settings/page.svelte.test.ts`

**Interfaces:**

- Consumes: `updateSession` (Task 2), `RATING_LABELS` (Task 1).

- [ ] **Step 1: Update the script**

In `src/routes/settings/+page.svelte`, extend the imports:

```ts
import {
  orderedLive,
  editCompletedAt,
  deleteSession,
  updateSession,
  backfill
} from '$lib/client/sessions.svelte';
import { timers, setTimers } from '$lib/client/settings.svelte';
import { toLocalInput } from '$lib/datetime';
import { RATING_LABELS } from '$lib/sync';
```

Replace the `rows` derived with:

```ts
const rows = $derived(
  orderedLive().map((s) => ({
    uuid: s.uuid,
    value: toLocalInput(new Date(s.completedAt)),
    notes: s.notes ?? '',
    exercises: s.exercises
  }))
);
```

Add after the existing `add()` function:

```ts
function saveRating(uuid: string, slug: string, value: string) {
  const s = orderedLive().find((x) => x.uuid === uuid);
  if (!s) return;
  updateSession(uuid, {
    exercises: s.exercises.map((e) =>
      e.slug === slug ? { ...e, rating: value === '' ? null : Number(value) } : e
    )
  });
}
function saveNotes(uuid: string, notes: string) {
  updateSession(uuid, { notes });
}
```

- [ ] **Step 2: Replace the sessions table**

Replace everything from `<table>` to `</table>` (inside the `{:else}` of the sessions list) with:

```svelte
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
            onchange={(e) => saveRating(r.uuid, ex.slug, e.currentTarget.value)}
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
```

- [ ] **Step 3: Add tests**

Append inside the `describe` block of `src/routes/settings/page.svelte.test.ts` (elements inside the closed `<details>` are hidden from the accessibility tree, so query them directly):

```ts
test('rating a session exercise updates the stored session', async () => {
  state.sessions = [
    session({
      uuid: 'a',
      exercises: [{ slug: 'curl-up', unit: 'hold', target: 12, completed: 12, rating: null }]
    })
  ];
  render(Page);
  await fireEvent.change(document.querySelector('select')!, { target: { value: '5' } });
  expect(state.sessions[0].exercises[0].rating).toBe(5);
  expect(state.sessions[0].synced).toBe(false);
});

test('editing notes updates the stored session', async () => {
  state.sessions = [session({ uuid: 'a', notes: '' })];
  render(Page);
  await fireEvent.change(document.querySelector('textarea')!, { target: { value: 'hip pain' } });
  expect(state.sessions[0].notes).toBe('hip pain');
  expect(state.sessions[0].synced).toBe(false);
});
```

The pre-existing settings tests keep passing: they locate rows by `datetime-local` inputs and the Delete button, both of which survive the table→article change.

- [ ] **Step 4: Run the gates**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test:coverage`
Expected: clean, thresholds met.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings/+page.svelte src/routes/settings/page.svelte.test.ts
git commit -m "feat: edit session ratings and notes from settings"
```

---

### Task 6: Screenshots for the PR, then ship

- [ ] **Step 1: Verify in the running app** (index doc "PR requirements" + `verify` skill)

Capture into `docs/pr-media/<branch>/` at 390×844:

1. `rating-dialog.png` — the completion screen with options picked and a note typed (finish a workout quickly by setting tiny timers in /settings first, or skip through)
2. `settings-editor.png` — /settings with a session's "Ratings & notes" open
3. Confirm in the browser that a session appears in /history immediately after pressing Start workout and reloading mid-workout (the always-stored behavior) — screenshot as `stored-mid-workout.png`

- [ ] **Step 2: Commit media, push, open a draft PR**

```bash
git add docs/pr-media
git commit -m "docs: PR screenshots"
git push -u origin HEAD
```

Open with `gh pr create --draft`; body must cover: sessions stored+synced from the first second (no save confirmation), the rating dialog, settings editing, the new DB columns/migration, embedded screenshots (raw-URL syntax per the index doc), and the footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
