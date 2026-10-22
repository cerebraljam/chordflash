<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { audio, startAudio } from '../audioState.svelte';

  export type TourView = 'home' | 'input' | 'tuner' | 'chords';

  let { go, onclose }: { go: (view: TourView) => void; onclose: () => void } = $props();

  interface Step {
    view: TourView;
    /** Elements to highlight, first one found wins (the screen differs before listening starts). */
    targets: string[];
    title: string;
    body: string;
    /** Show a "Start listening" button while the input is off. */
    listen?: boolean;
  }

  const STEPS: Step[] = [
    {
      view: 'home',
      targets: [],
      title: 'Welcome to Chord Flash',
      body: 'Practise chord changes and notes on your guitar: the app listens and tells you when you got it. Five quick stops to get set up, then you play.',
    },
    {
      view: 'input',
      targets: ['[data-tour="input-select"]', '[data-tour="start-listening"]'],
      title: '1 · Plug in',
      body: 'Choose your Rocksmith cable (or a microphone) here. Strum: the level bar should jump past the gate line, and fall back when the strings are quiet.',
      listen: true,
    },
    {
      view: 'tuner',
      targets: ['[data-tour="tuner"]', '[data-tour="start-listening"]'],
      title: '2 · Tune up',
      body: 'Play one string at a time and turn its peg until the needle sits in the middle and turns green. A tuned guitar makes chord detection much more reliable.',
      listen: true,
    },
    {
      view: 'chords',
      targets: ['[data-tour="check-picker"]', '[data-tour="start-listening"]'],
      title: '3 · See what the app hears',
      body: 'Pick a chord and strum it. You get a score and, if something is off, which note is missing or wrong (a finger touching the next string shows up here).',
      listen: true,
    },
    {
      view: 'home',
      targets: ['[data-tour="start-set"]'],
      title: '4 · Play',
      body: 'This is home. "Start set" (or Space) drills the chord changes you are slowest at; they come up more often until they get fast.',
    },
    {
      view: 'home',
      targets: ['[data-tour="tile-setlist"]'],
      title: '5 · Pick songs',
      body: 'Songs from Rock Band, Guitar Hero and Rocksmith, plus J-Rock, Québec and French collections, easiest first: ready-made chord sets to start with. "Play through" a song\'s changes at your pace, or play it "With rhythm" on a metronome.',
    },
    {
      view: 'home',
      targets: [],
      title: "You're set",
      body: 'The rest is yours to discover: drills on the beat ("With rhythm" in Chord drills), note hunt, riffs from Guitar Pro tabs, stats. Replay this tour any time with the ? button at the top.',
    },
  ];

  let index = $state(0);
  let rect = $state<DOMRect | null>(null);
  let card = $state<HTMLElement | null>(null);
  let viewport = $state({ w: 0, h: 0 });

  let step = $derived(STEPS[index]);
  let last = $derived(index === STEPS.length - 1);

  let cardHeight = $state(230);

  /** Card position: below the target if it fits, else above, else at the bottom edge; centred without a target. */
  let place = $derived.by(() => {
    const width = Math.min(380, viewport.w - 32);
    if (!rect) return { left: (viewport.w - width) / 2, top: Math.max(16, viewport.h * 0.25), width };
    const left = Math.max(16, Math.min(rect.left, viewport.w - width - 16));
    const below = rect.bottom + 14;
    const above = rect.top - 14 - cardHeight;
    const top = below + cardHeight <= viewport.h - 16 ? below : above >= 16 ? above : Math.max(16, viewport.h - cardHeight - 16);
    return { left, top, width };
  });

  function measure() {
    viewport = { w: window.innerWidth, h: window.innerHeight };
    const el = step.targets.map((t) => document.querySelector<HTMLElement>(t)).find(Boolean);
    rect = el ? el.getBoundingClientRect() : null;
    // Read now, not through a binding: the new step's text may have just changed the card's height.
    cardHeight = card?.offsetHeight || cardHeight;
  }

  async function show(i: number) {
    index = i;
    go(STEPS[i].view);
    await tick();
    const el = STEPS[i].targets.map((t) => document.querySelector<HTMLElement>(t)).find(Boolean);
    el?.scrollIntoView({ block: 'center' });
    await tick();
    measure();
    // No room for the card above or below a centred target (a phone): bring the target to the top instead.
    if (el && rect && rect.bottom + 14 + cardHeight > viewport.h - 16 && rect.top - 14 - cardHeight < 16) {
      window.scrollBy(0, rect.top - 16);
      await tick();
      measure();
    }
    card?.focus();
  }

  const next = () => (last ? onclose() : show(index + 1));
  const back = () => index > 0 && show(index - 1);

  onMount(() => {
    void show(0);
    // Follow layout changes (the screen behind may still be loading or scrolling).
    let frame = requestAnimationFrame(function loop() {
      measure();
      frame = requestAnimationFrame(loop);
    });
    const onKey = (e: KeyboardEvent) => {
      // Space on a tour button presses that button, not the screen's own Space shortcut.
      if (e.code === 'Space' && card?.contains(e.target as Node)) return e.stopPropagation();
      if (e.key === 'Escape') onclose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, true);
    };
  });
</script>

{#if rect}
  <div
    class="spot"
    style:left="{rect.left - 8}px"
    style:top="{rect.top - 8}px"
    style:width="{rect.width + 16}px"
    style:height="{rect.height + 16}px"
  ></div>
{:else}
  <div class="dim"></div>
{/if}

<div
  class="card tour"
  role="dialog"
  aria-labelledby="tour-title"
  tabindex="-1"
  bind:this={card}
  style:left="{place.left}px"
  style:top="{place.top}px"
  style:width="{place.width}px"
>
  <div class="dots" aria-hidden="true">
    {#each STEPS as _, i (i)}<span class:on={i === index}></span>{/each}
  </div>
  <h2 id="tour-title">{step.title}</h2>
  <p>{step.body}</p>
  {#if step.listen && !audio.running}
    <button class="primary" disabled={audio.starting} onclick={() => startAudio()}>
      {audio.starting ? 'Starting…' : 'Start listening'}
    </button>
  {/if}
  <div class="row actions">
    <button class="ghost" onclick={onclose}>{last ? 'Close' : 'Skip tour'}</button>
    <span class="spacer"></span>
    {#if index > 0}<button onclick={back}>Back</button>{/if}
    <button class="primary" onclick={next}>{last ? 'Start playing' : index === 0 ? "Let's go" : 'Next'}</button>
  </div>
</div>

<style>
  /* Both layers let clicks through: the tour points, it never blocks. */
  .spot,
  .dim {
    position: fixed;
    z-index: 50;
    pointer-events: none;
  }
  .spot {
    border-radius: 14px;
    border: 2px solid var(--accent);
    box-shadow: 0 0 0 9999px rgb(5 6 9 / 0.62);
  }
  .dim {
    inset: 0;
    background: rgb(5 6 9 / 0.62);
  }
  .tour {
    position: fixed;
    z-index: 51;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
    border-color: var(--accent);
  }
  .tour:focus {
    outline: none;
  }
  h2 {
    margin: 0;
    font-size: 1.5rem;
  }
  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.5;
  }
  .dots {
    display: flex;
    gap: 5px;
  }
  .dots span {
    width: 18px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
  }
  .dots span.on {
    background: var(--accent);
  }
  .actions {
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .ghost {
    background: transparent;
    border-color: transparent;
    color: var(--muted);
    padding-left: 0;
  }
</style>
