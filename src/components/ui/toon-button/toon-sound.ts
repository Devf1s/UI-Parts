/**
 * Cartoon sound effects, synthesised with Web Audio (no files): a pop, a little "mew", paper
 * "fwip"s, a rocket rumble and whoosh, a spring "boing" and a "POW". Off until someone turns it on
 * with SoundToggle (browsers only allow audio after a click or key press anyway); the switch is
 * shared by every button on the page.
 */
export type Sfx = "pop" | "mew" | "fwip" | "rumble" | "whoosh" | "boing" | "pow";

type Listener = () => void;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let on = false;
let plays = 0;
const listeners = new Set<Listener>();

function noiseBuffer(ac: AudioContext) {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** A gain envelope: quick attack to `peak`, exponential fall to silence at `end` seconds. */
function env(ac: AudioContext, t: number, peak: number, attack: number, end: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
  g.connect(master!);
  return g;
}

function tone(ac: AudioContext, type: OscillatorType, t: number, end: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.start(t);
  o.stop(t + end + 0.02);
  return o;
}

function hiss(ac: AudioContext, t: number, end: number) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuffer(ac);
  s.loop = true;
  s.start(t, Math.random() * 0.5);
  s.stop(t + end + 0.02);
  return s;
}

const SYNTH: Record<Sfx, (ac: AudioContext, t: number) => void> = {
  pop(ac, t) {
    const o = tone(ac, "sine", t, 0.12);
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(190, t + 0.09);
    o.connect(env(ac, t, 0.5, 0.004, 0.12));
  },
  mew(ac, t) {
    // a rising-falling glide through a vowel-ish band-pass: cartoon cat, not a real one
    const o = tone(ac, "sawtooth", t, 0.42);
    o.frequency.setValueAtTime(480, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.11);
    o.frequency.exponentialRampToValueAtTime(430, t + 0.4);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(1300, t);
    bp.frequency.linearRampToValueAtTime(1900, t + 0.12);
    bp.frequency.linearRampToValueAtTime(900, t + 0.4);
    o.connect(bp).connect(env(ac, t, 0.35, 0.03, 0.42));
  },
  fwip(ac, t) {
    const s = hiss(ac, t, 0.09);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.08);
    s.connect(bp).connect(env(ac, t, 0.28, 0.005, 0.09));
  },
  rumble(ac, t) {
    const s = hiss(ac, t, 0.45);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 170;
    s.connect(lp).connect(env(ac, t, 0.6, 0.05, 0.45));
  },
  whoosh(ac, t) {
    const s = hiss(ac, t, 0.7);
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(260, t);
    bp.frequency.exponentialRampToValueAtTime(3400, t + 0.55);
    s.connect(bp).connect(env(ac, t, 0.55, 0.12, 0.7));
  },
  boing(ac, t) {
    const o = tone(ac, "sine", t, 0.6);
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.22);
    // the wobble of the spring: a fast vibrato that dies away
    const lfo = tone(ac, "sine", t, 0.6);
    lfo.frequency.value = 15;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(60, t);
    depth.gain.exponentialRampToValueAtTime(1, t + 0.55);
    lfo.connect(depth).connect(o.frequency);
    o.connect(env(ac, t, 0.45, 0.01, 0.6));
  },
  pow(ac, t) {
    const s = hiss(ac, t, 0.18);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    s.connect(lp).connect(env(ac, t, 0.7, 0.003, 0.18));
    const o = tone(ac, "sine", t, 0.25);
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    o.connect(env(ac, t, 0.8, 0.004, 0.25));
  },
};

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
        master.gain.value = 0.45;
        master.connect(ctx.destination);
      }
      void ctx.resume();
    } else void ctx?.suspend();
    listeners.forEach((l) => l());
  },
  /** Plays one effect, optionally `delay` seconds from now. No-op while sound is off. */
  play(name: Sfx, delay = 0) {
    if (!on || !ctx || !master) return;
    SYNTH[name](ctx, ctx.currentTime + 0.005 + delay);
    plays++;
  },
  /** For tests: how many effects have been played. */
  plays: () => plays,
};

// test hook: e2e checks that an effect reaches the audio graph once sound is on
if (typeof window !== "undefined") (window as unknown as { __uiSound?: typeof sound }).__uiSound = sound;
