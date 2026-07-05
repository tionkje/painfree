<script lang="ts">
  import '@picocss/pico/css/pico.min.css';
  import '../app.css';
  import { page } from '$app/state';
  import { browser } from '$app/environment';

  let { children } = $props();

  // Initialised from the saved theme on the client; toggleTheme reassigns it
  // (writable $derived). null => follow the OS preference (Pico's default).
  let theme = $derived(
    browser ? ((localStorage.getItem('theme') as 'light' | 'dark' | null) ?? null) : null
  );

  function toggleTheme() {
    const current =
      theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    theme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  const nav = [
    { href: '/', label: 'Home' },
    { href: '/workout', label: 'Workout' },
    { href: '/history', label: 'History' },
    { href: '/settings', label: 'Settings' }
  ];
</script>

<nav class="container">
  <ul>
    <li><strong>painfree</strong></li>
  </ul>
  <ul>
    {#each nav as item (item.href)}
      <li>
        <a href={item.href} aria-current={page.url.pathname === item.href ? 'page' : undefined}>
          {item.label}
        </a>
      </li>
    {/each}
    <li>
      <button
        class="outline secondary theme-toggle"
        onclick={toggleTheme}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </li>
  </ul>
</nav>

<main class="container">
  {@render children()}
</main>
