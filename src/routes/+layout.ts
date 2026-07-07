// Offline-first SPA: the client (localStorage) is the source of truth, so pages
// render entirely on the client and there is nothing to server-render or
// prerender. See docs/offline-first-plan.md.
export const ssr = false;
export const prerender = false;
