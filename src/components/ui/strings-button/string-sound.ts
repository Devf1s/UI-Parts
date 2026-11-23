/**
 * Optional sound for StringsButton: Karplus–Strong plucked strings, synthesised once per note into
 * an AudioBuffer and played through a soft master gain. Off until someone turns it on (browsers
 * only allow audio after a click or key press anyway); the switch is shared by every button.
 */
type Listener = () => void;

/** Pentatonic, high to low: any sweep across the strings sounds like a chord. */
export const DEFAULT_NOTES = [329.63, 293.66, 261.63, 220, 196] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let on = false;
let plays = 0;
const listeners = new Set<Listener>();
const buffers = new Map<number, AudioBuffer>();

function karplusStrong(ac: AudioContext, freq: number) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * 1.8);
  const period = Math.max(2, Math.round(sr / freq));
  const buf = ac.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  // a softened noise burst is the "finger"; averaging neighbours each period is the string
  let lp = 0;
  for (let i = 0; i < period; i++) y[i] = lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45;
  for (let i = period; i < len; i++) y[i] = 0.996 * 0.5 * (y[i - period] + y[i - period - 1 < 0 ? 0 : i - period - 1]);
  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < fade; i++) y[len - 1 - i] *= i / fade;
  return buf;
}

export const sound = {
  get on() {
    return on;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  set(next: boolean) {
    on = next;
    if (on) {
      ctx ??= new AudioContext();
      if (!master) {
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
      void ctx.resume();
    } else void ctx?.suspend();
    listeners.forEach((l) => l());
  },
  /** Plays one pluck. `gain` 0…1, `pan` -1…1. No-op while sound is off. */
  pluck(freq: number, gain: number, pan = 0) {
    if (!on || !ctx || !master) return;
    let buf = buffers.get(freq);
    if (!buf) buffers.set(freq, (buf = karplusStrong(ctx, freq)));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, gain));
    src.connect(g);
    if (typeof ctx.createStereoPanner === "function") {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(master);
    } else g.connect(master);
    src.start();
    plays++;
  },
  /** Plucks the notes one after another, like a thumb across a harp. */
  strum(notes: readonly number[] = DEFAULT_NOTES, gain = 0.35) {
    if (!on || !ctx) return;
    [...notes].reverse().forEach((f, i) => setTimeout(() => sound.pluck(f, gain), i * 55));
  },
  /** For tests: how many plucks have been played. */
  plays: () => plays,
};

// test hook: e2e checks that a pluck reaches the audio graph once sound is on
if (typeof window !== "undefined") (window as unknown as { __uiSound?: typeof sound }).__uiSound = sound;
