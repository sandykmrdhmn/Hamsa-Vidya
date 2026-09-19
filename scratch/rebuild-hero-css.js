/**
 * Replace the AI Teacher hero CSS block.
 *
 * Swaps everything from ".teacher-hero-header {" (line ~29) up to the
 * "/* Sub-Navigation" comment with the new hero styles, leaving the tab
 * navigation and input studio rules untouched.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'css', 'ai-teacher', '01-hero-and-input.css');
let src = fs.readFileSync(FILE, 'utf8');

const START_MARKER = '/* Header & Banner */';
const END_MARKER = '/* Sub-Navigation: Explain Studio | Saved Bookmarks | History */';

const start = src.indexOf(START_MARKER);
const end = src.indexOf(END_MARKER);

if (start === -1 || end === -1 || end <= start) {
  console.error('ABORT: could not locate the hero block markers. Nothing written.');
  console.error(`  start=${start} end=${end}`);
  process.exit(1);
}

const NEW_HERO = `/* ==========================================================================
   HERO BANNER

   Replaces the earlier layout (a 96px orbital logo beside two lines of text),
   which left most of the panel empty. The space now carries live counters from
   the student's own history and an explicit breakdown of what each generated
   lesson contains.

   All decorative layers are aria-hidden and collapse under
   prefers-reduced-motion.
   ========================================================================== */

.teacher-hero {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  background:
    linear-gradient(160deg,
      color-mix(in srgb, var(--color-primary) 10%, transparent) 0%,
      transparent 45%),
    var(--gradient-card, var(--bg-card));
  box-shadow: var(--shadow-lg);
  padding: clamp(1.6rem, 4vw, 2.6rem) clamp(1.25rem, 4vw, 2.75rem);
  isolation: isolate;
}

/* Soft colour wash. Static gradients rather than moving orbs, so the panel
   reads as premium without competing with the content below it. */
.teacher-hero-aurora {
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
}

.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(58px);
  opacity: 0.5;
}

.hero-orb-1 {
  width: 320px;
  height: 320px;
  top: -140px;
  left: -90px;
  background: var(--color-primary);
  opacity: 0.28;
}

.hero-orb-2 {
  width: 260px;
  height: 260px;
  bottom: -130px;
  right: -60px;
  background: var(--color-secondary, var(--color-primary-light));
  opacity: 0.22;
}

.hero-orb-3 {
  width: 200px;
  height: 200px;
  top: 40%;
  right: 28%;
  background: var(--color-gold);
  opacity: 0.1;
}

/* Faint engineering grid — adds texture at very low contrast. */
.teacher-hero-grid-overlay {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(to right, currentColor 1px, transparent 1px),
    linear-gradient(to bottom, currentColor 1px, transparent 1px);
  background-size: 44px 44px;
  color: var(--text-muted);
  opacity: 0.05;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%);
}

.teacher-hero-inner {
  position: relative;
  max-width: 780px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
}

/* -------------------------------------------------------------- Badge */
.teacher-title-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.38rem 0.95rem;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 38%, transparent);
  color: var(--color-primary-light);
  font-size: 0.74rem;
  font-weight: 750;
  letter-spacing: 0.09em;
  white-space: nowrap;
}

.live-pulse-radar {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  animation: radarBeaconPing 2s infinite cubic-bezier(0, 0, 0.2, 1);
  flex-shrink: 0;
}

@keyframes radarBeaconPing {
  0%   { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.65); }
  70%  { transform: scale(1.15); box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* -------------------------------------------------------------- Title */
.teacher-hero-title {
  font-family: var(--font-family-display);
  font-size: clamp(1.9rem, 5.2vw, 3.15rem);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1em;
}

.hero-title-line {
  color: var(--text-main);
  display: block;
}

/* Gradient text needs a colour fallback: if the clip is unsupported the text
   would otherwise render fully transparent. */
.hero-title-accent {
  color: var(--color-primary-light);
  background: var(--gradient-brand);
  -webkit-background-clip: text;
  background-clip: text;
}

@supports (-webkit-text-fill-color: transparent) {
  .hero-title-accent {
    -webkit-text-fill-color: transparent;
  }
}

.teacher-hero-subtitle {
  font-size: clamp(0.95rem, 2.2vw, 1.07rem);
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
  max-width: 60ch;
}

.hero-lang-hi {
  font-family: var(--font-family-hindi);
  color: var(--color-primary-light);
  font-weight: 650;
}

/* -------------------------------------------------- Live stat counters */
.teacher-hero-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
  width: 100%;
  max-width: 560px;
  margin-top: 0.5rem;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.7rem 0.5rem;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-surface-elevated) 70%, transparent);
  border: 1px solid var(--border-subtle);
  transition: transform var(--transition-fast), border-color var(--transition-fast);
}

.hero-stat:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}

.hero-stat-value {
  font-family: var(--font-family-display);
  font-size: 1.32rem;
  font-weight: 800;
  line-height: 1;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.hero-stat-accent .hero-stat-value {
  color: var(--color-primary-light);
}

.hero-stat-label {
  font-size: 0.68rem;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.055em;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.25;
}

/* ------------------------------------------------ "Every answer includes" */
.teacher-hero-deliverables {
  width: 100%;
  margin-top: 0.75rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--border-subtle);
}

.deliverables-heading {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 0.7rem;
}

.deliverables-heading i {
  color: var(--color-gold);
}

.deliverables-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
}

.deliverable-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.8rem;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  /* help cursor signals the tooltip carries extra detail */
  cursor: help;
  transition: color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}

.deliverable-pill i {
  color: var(--color-primary-light);
  flex-shrink: 0;
}

.deliverable-pill:hover {
  color: var(--text-main);
  border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);
  transform: translateY(-2px);
}

/* ------------------------------------------------------------ Responsive */
@media (max-width: 720px) {
  .teacher-hero-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-width: 360px;
  }
  .hero-orb-3 {
    display: none;
  }
}

@media (max-width: 420px) {
  .teacher-title-badge {
    font-size: 0.66rem;
    letter-spacing: 0.05em;
    white-space: normal;
    text-align: center;
  }
  .deliverable-pill {
    font-size: 0.74rem;
    padding: 0.36rem 0.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-pulse-radar {
    animation: none;
  }
  .hero-stat:hover,
  .deliverable-pill:hover {
    transform: none;
  }
}

/* Blur-heavy decoration is wasted ink on paper. */
@media print {
  .teacher-hero-aurora,
  .teacher-hero-grid-overlay,
  .teacher-hero-stats,
  .teacher-hero-deliverables {
    display: none !important;
  }
  .teacher-hero {
    box-shadow: none;
    border: none;
    padding: 0;
  }
}

`;

const before = src.slice(0, start);
const after = src.slice(end);
const removed = src.slice(start, end);

fs.writeFileSync(FILE, before + NEW_HERO + after, 'utf8');

console.log('Hero CSS replaced.');
console.log(`  removed ${removed.split('\n').length} lines`);
console.log(`  added   ${NEW_HERO.split('\n').length} lines`);
console.log('\nOld selectors removed (should all be hero/orbit related):');
[...removed.matchAll(/^\.([\w-]+(?:\.[\w-]+)?)\s*[,{]/gm)]
  .map(m => m[1])
  .filter((v, i, a) => a.indexOf(v) === i)
  .forEach(s => console.log(`  .${s}`));
