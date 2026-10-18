/**
 * Window-level keyboard shortcuts for the current screen, keyed by
 * KeyboardEvent.code ("Space", "KeyS", "Escape"…). Ignored while typing in a
 * field or with a modifier held. Returns the cleanup, for onMount.
 */
export function shortcuts(map: Record<string, () => void>): () => void {
  const onKey = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
    const run = map[e.code];
    if (!run || typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    run();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
