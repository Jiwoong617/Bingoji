import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 24_000;
const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
const TAU = Math.PI * 2;

mkdirSync(OUTPUT_DIR, { recursive: true });

function midi(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function buffer(seconds) {
  return new Float64Array(Math.ceil(seconds * SAMPLE_RATE));
}

function waveAt(phase, wave) {
  const wrapped = phase / TAU;
  if (wave === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (wave === "soft-square") {
    return Math.sin(phase) + Math.sin(phase * 3) / 3 + Math.sin(phase * 5) / 5;
  }
  if (wave === "saw") return 2 * (wrapped - Math.floor(wrapped + 0.5));
  return Math.sin(phase);
}

function envelope(t, duration, attack = 0.01, release = 0.08) {
  const attackGain = attack <= 0 ? 1 : Math.min(1, t / attack);
  const releaseGain = release <= 0 ? 1 : Math.min(1, (duration - t) / release);
  return Math.max(0, Math.min(attackGain, releaseGain));
}

function addTone(target, {
  start = 0,
  duration,
  frequency,
  endFrequency = frequency,
  volume = 0.2,
  wave = "sine",
  attack = 0.01,
  release = 0.08,
  vibrato = 0,
  vibratoRate = 6,
}) {
  const startSample = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const endSample = Math.min(target.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let index = startSample; index < endSample; index += 1) {
    const t = (index - startSample) / SAMPLE_RATE;
    const progress = Math.min(1, t / duration);
    const baseFrequency = frequency * ((endFrequency / frequency) ** progress);
    const currentFrequency = baseFrequency * (1 + Math.sin(TAU * vibratoRate * t) * vibrato);
    phase += TAU * currentFrequency / SAMPLE_RATE;
    target[index] += waveAt(phase, wave) * volume * envelope(t, duration, attack, release);
  }
}

let noiseState = 0x51f15e;
function randomNoise() {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
}

function addNoise(target, {
  start = 0,
  duration,
  volume = 0.12,
  attack = 0,
  release = 0.08,
  color = 0,
}) {
  const startSample = Math.max(0, Math.floor(start * SAMPLE_RATE));
  const endSample = Math.min(target.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let filtered = 0;
  for (let index = startSample; index < endSample; index += 1) {
    const t = (index - startSample) / SAMPLE_RATE;
    const white = randomNoise();
    filtered = filtered * color + white * (1 - color);
    target[index] += filtered * volume * envelope(t, duration, attack, release);
  }
}

function addChord(target, notes, start, duration, volume, wave = "triangle") {
  notes.forEach((note, index) => addTone(target, {
    start: start + index * 0.006,
    duration,
    frequency: midi(note),
    volume: volume / Math.sqrt(notes.length),
    wave,
    attack: Math.min(0.08, duration * 0.15),
    release: Math.min(0.2, duration * 0.25),
  }));
}

function addKick(target, start, volume = 0.32) {
  addTone(target, { start, duration: 0.18, frequency: 145, endFrequency: 48, volume, wave: "sine", attack: 0, release: 0.09 });
  addNoise(target, { start, duration: 0.025, volume: volume * 0.3, release: 0.02 });
}

function addSnare(target, start, volume = 0.16) {
  addNoise(target, { start, duration: 0.16, volume, release: 0.13, color: 0.12 });
  addTone(target, { start, duration: 0.12, frequency: 190, endFrequency: 130, volume: volume * 0.45, attack: 0, release: 0.1 });
}

function addHat(target, start, volume = 0.055) {
  addNoise(target, { start, duration: 0.045, volume, release: 0.04, color: -0.25 });
}

function master(target, peak = 0.86) {
  let maximum = 0;
  for (let index = 0; index < target.length; index += 1) {
    target[index] = Math.tanh(target[index] * 1.08);
    maximum = Math.max(maximum, Math.abs(target[index]));
  }
  const gain = maximum > 0 ? peak / maximum : 1;
  for (let index = 0; index < target.length; index += 1) target[index] *= gain;
  return target;
}

function writeWav(name, samples) {
  const dataSize = samples.length * 2;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(SAMPLE_RATE, 24);
  output.writeUInt32LE(SAMPLE_RATE * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[index])) * 32767), 44 + index * 2);
  }
  writeFileSync(join(OUTPUT_DIR, name), output);
  return output.length;
}

function mainBgm() {
  const bpm = 112;
  const beat = 60 / bpm;
  const bars = 16;
  const target = buffer(bars * beat * 4);
  const chords = [
    [48, 55, 59, 64],
    [45, 52, 57, 60],
    [41, 48, 52, 57],
    [43, 50, 55, 59],
  ];
  const melodies = [
    [72, null, 76, 79, null, 76, 74, null],
    [69, 72, null, 76, 79, null, 76, 72],
    [69, null, 72, 76, 74, 72, null, 69],
    [71, 74, 79, null, 76, 74, 71, null],
  ];
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * beat * 4;
    const chord = chords[bar % chords.length];
    addChord(target, chord.slice(1), start, beat * 3.85, 0.085, "sine");
    for (let b = 0; b < 4; b += 1) {
      addTone(target, { start: start + b * beat, duration: beat * 0.72, frequency: midi(chord[0]), volume: 0.095, wave: "triangle", attack: 0.015, release: 0.12 });
      addKick(target, start + b * beat, b === 0 ? 0.17 : 0.105);
      addHat(target, start + (b + 0.5) * beat, 0.028);
    }
    if (bar % 4 === 2) addSnare(target, start + beat * 3, 0.065);
    melodies[bar % melodies.length].forEach((note, step) => {
      if (note === null) return;
      addTone(target, {
        start: start + step * beat / 2,
        duration: beat * 0.38,
        frequency: midi(note),
        volume: 0.095,
        wave: "triangle",
        attack: 0.012,
        release: 0.11,
        vibrato: 0.002,
      });
    });
  }
  return master(target, 0.72);
}

function battleBgm() {
  const bpm = 150;
  const beat = 60 / bpm;
  const bars = 16;
  const target = buffer(bars * beat * 4);
  const roots = [45, 41, 43, 40];
  const leadPatterns = [
    [69, 72, 76, 72, 69, 72, 77, 76],
    [65, 69, 72, 69, 65, 69, 74, 72],
    [67, 71, 74, 71, 67, 71, 76, 74],
    [64, 67, 71, 67, 64, 67, 72, 71],
  ];
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * beat * 4;
    const root = roots[bar % roots.length];
    addChord(target, [root + 12, root + 15, root + 19], start, beat * 3.78, 0.065, "sine");
    for (let step = 0; step < 8; step += 1) {
      const stepStart = start + step * beat / 2;
      addTone(target, { start: stepStart, duration: beat * 0.34, frequency: midi(root + (step % 2 ? 7 : 0)), volume: 0.12, wave: "soft-square", attack: 0.004, release: 0.07 });
      addHat(target, stepStart, step % 2 === 0 ? 0.045 : 0.065);
      if (step % 2 === 0) addKick(target, stepStart, step === 0 || step === 4 ? 0.24 : 0.14);
      if (step === 2 || step === 6) addSnare(target, stepStart, 0.13);
      const lead = leadPatterns[bar % leadPatterns.length][step];
      addTone(target, { start: stepStart, duration: beat * 0.31, frequency: midi(lead), volume: 0.075, wave: "triangle", attack: 0.005, release: 0.06 });
    }
  }
  return master(target, 0.76);
}

function touchSfx() {
  const target = buffer(0.11);
  addTone(target, { duration: 0.09, frequency: 1_180, endFrequency: 860, volume: 0.32, wave: "sine", attack: 0.002, release: 0.055 });
  addNoise(target, { duration: 0.018, volume: 0.06, release: 0.015 });
  return master(target, 0.62);
}

function placementSfx() {
  const target = buffer(0.24);
  addTone(target, { duration: 0.18, frequency: 210, endFrequency: 72, volume: 0.42, wave: "sine", attack: 0.001, release: 0.11 });
  addTone(target, { start: 0.012, duration: 0.08, frequency: 620, endFrequency: 380, volume: 0.16, wave: "triangle", attack: 0, release: 0.06 });
  addNoise(target, { duration: 0.055, volume: 0.13, release: 0.05, color: 0.18 });
  return master(target, 0.78);
}

function drawSfx() {
  const target = buffer(0.52);
  addNoise(target, { start: 0.02, duration: 0.32, volume: 0.085, attack: 0.12, release: 0.08, color: 0.42 });
  [0, 0.09, 0.18].forEach((start, index) => addTone(target, {
    start: start + 0.05,
    duration: 0.24,
    frequency: 520 + index * 140,
    endFrequency: 900 + index * 190,
    volume: 0.18,
    wave: "sine",
    attack: 0.015,
    release: 0.1,
  }));
  return master(target, 0.72);
}

function discardSfx() {
  const target = buffer(0.52);
  addTone(target, { duration: 0.39, frequency: 920, endFrequency: 155, volume: 0.22, wave: "saw", attack: 0.015, release: 0.12 });
  addNoise(target, { duration: 0.33, volume: 0.1, attack: 0.04, release: 0.11, color: 0.55 });
  addTone(target, { start: 0.31, duration: 0.14, frequency: 230, endFrequency: 105, volume: 0.35, wave: "sine", attack: 0, release: 0.09 });
  return master(target, 0.72);
}

function bingoSfx() {
  const target = buffer(1.18);
  [72, 76, 79, 84, 88].forEach((note, index) => {
    addTone(target, { start: index * 0.105, duration: 0.46, frequency: midi(note), volume: 0.2, wave: "triangle", attack: 0.004, release: 0.24 });
    addTone(target, { start: index * 0.105 + 0.02, duration: 0.34, frequency: midi(note + 12), volume: 0.07, wave: "sine", attack: 0.005, release: 0.22 });
  });
  addNoise(target, { start: 0.4, duration: 0.46, volume: 0.045, attack: 0.12, release: 0.25, color: -0.15 });
  return master(target, 0.8);
}

function attackSfx() {
  const target = buffer(0.48);
  addNoise(target, { duration: 0.2, volume: 0.38, release: 0.18, color: 0.1 });
  addTone(target, { duration: 0.34, frequency: 185, endFrequency: 48, volume: 0.48, wave: "sine", attack: 0, release: 0.18 });
  addTone(target, { start: 0.018, duration: 0.16, frequency: 760, endFrequency: 180, volume: 0.19, wave: "saw", attack: 0, release: 0.1 });
  return master(target, 0.86);
}

function recoverySfx() {
  const target = buffer(0.82);
  [72, 76, 79, 84].forEach((note, index) => addTone(target, {
    start: index * 0.1,
    duration: 0.5,
    frequency: midi(note),
    volume: 0.17,
    wave: "sine",
    attack: 0.02,
    release: 0.3,
    vibrato: 0.003,
  }));
  addChord(target, [60, 64, 67], 0.26, 0.5, 0.1, "triangle");
  return master(target, 0.74);
}

function restSfx() {
  const target = buffer(1.75);
  addNoise(target, { duration: 1.25, volume: 0.04, attack: 0.42, release: 0.45, color: 0.82 });
  addChord(target, [60, 64, 67, 71], 0.08, 1.38, 0.22, "sine");
  [79, 83, 84].forEach((note, index) => addTone(target, {
    start: 0.42 + index * 0.22,
    duration: 0.55,
    frequency: midi(note),
    volume: 0.1,
    wave: "triangle",
    attack: 0.03,
    release: 0.32,
  }));
  return master(target, 0.68);
}

function victorySfx() {
  const target = buffer(2.25);
  [60, 64, 67, 72, 76].forEach((note, index) => addTone(target, {
    start: index * 0.17,
    duration: index === 4 ? 1.25 : 0.42,
    frequency: midi(note),
    volume: index === 4 ? 0.24 : 0.2,
    wave: "triangle",
    attack: 0.008,
    release: index === 4 ? 0.65 : 0.18,
  }));
  addChord(target, [60, 64, 67, 72], 0.72, 1.3, 0.2, "sine");
  addNoise(target, { start: 0.65, duration: 0.7, volume: 0.035, attack: 0.18, release: 0.42, color: -0.2 });
  return master(target, 0.8);
}

function defeatSfx() {
  const target = buffer(2.2);
  [69, 67, 64, 60, 57].forEach((note, index) => addTone(target, {
    start: index * 0.22,
    duration: index === 4 ? 1.18 : 0.46,
    frequency: midi(note),
    endFrequency: index === 4 ? midi(note - 1) : midi(note),
    volume: index === 4 ? 0.25 : 0.17,
    wave: index === 4 ? "sine" : "triangle",
    attack: 0.012,
    release: index === 4 ? 0.7 : 0.2,
  }));
  addChord(target, [45, 48, 52], 0.78, 1.25, 0.13, "sine");
  addTone(target, { start: 0.9, duration: 0.78, frequency: 95, endFrequency: 42, volume: 0.2, wave: "sine", attack: 0.02, release: 0.5 });
  return master(target, 0.76);
}

const tracks = {
  "main-bgm.wav": mainBgm,
  "battle-bgm.wav": battleBgm,
  "touch.wav": touchSfx,
  "placement.wav": placementSfx,
  "draw.wav": drawSfx,
  "discard.wav": discardSfx,
  "bingo.wav": bingoSfx,
  "attack.wav": attackSfx,
  "recovery.wav": recoverySfx,
  "rest.wav": restSfx,
  "victory.wav": victorySfx,
  "defeat.wav": defeatSfx,
};

let totalBytes = 0;
for (const [name, create] of Object.entries(tracks)) {
  const bytes = writeWav(name, create());
  totalBytes += bytes;
  console.log(`${name.padEnd(20)} ${(bytes / 1024).toFixed(1)} KiB`);
}
console.log(`Generated ${Object.keys(tracks).length} tracks (${(totalBytes / 1024 / 1024).toFixed(2)} MiB)`);
