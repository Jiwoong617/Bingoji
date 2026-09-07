export type AudioScene = "main" | "battle";

export type AudioEffectKind = "damage" | "heal" | "shield" | "critical" | string;

export type GameAudioEvent =
  | { type: "scene"; scene: AudioScene }
  | { type: "touch" }
  | { type: "placement" }
  | { type: "draw" }
  | { type: "discard" }
  | { type: "bingo" }
  | { type: "combat-effects"; effects: readonly { kind: AudioEffectKind }[] }
  | { type: "rest" }
  | { type: "result"; outcome: "victory" | "defeat" };

export type SoundCue =
  | "touch"
  | "placement"
  | "draw"
  | "discard"
  | "bingo"
  | "attack"
  | "recovery"
  | "rest"
  | "victory"
  | "defeat";

export interface AudioSettings {
  bgmVolume: number;
  sfxVolume: number;
}

export const AUDIO_FILE_NAMES = {
  main: "main-bgm.wav",
  battle: "battle-bgm.wav",
  touch: "touch.wav",
  placement: "placement.wav",
  draw: "draw.wav",
  discard: "discard.wav",
  bingo: "bingo.wav",
  attack: "attack.wav",
  recovery: "recovery.wav",
  rest: "rest.wav",
  victory: "victory.wav",
  defeat: "defeat.wav",
} as const;

const STORAGE_KEY = "bingoji.audio-settings.v1";
const DEFAULT_SETTINGS: AudioSettings = { bgmVolume: 0.55, sfxVolume: 0.75 };

function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function loadSettings(): AudioSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<AudioSettings> | null;
    if (!saved) return { ...DEFAULT_SETTINGS };
    return {
      bgmVolume: clampVolume(saved.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume),
      sfxVolume: clampVolume(saved.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function soundCuesForEvent(event: GameAudioEvent): SoundCue[] {
  switch (event.type) {
    case "scene": return [];
    case "touch": return ["touch"];
    case "placement": return ["placement"];
    case "draw": return ["draw"];
    case "discard": return ["discard"];
    case "bingo": return ["bingo"];
    case "rest": return ["rest"];
    case "result": return [event.outcome];
    case "combat-effects": {
      const cues: SoundCue[] = [];
      if (event.effects.some((effect) => effect.kind === "damage" || effect.kind === "critical")) cues.push("attack");
      if (event.effects.some((effect) => effect.kind === "heal" || effect.kind === "shield")) cues.push("recovery");
      return cues;
    }
  }
}

function supportsAudioPlayback(): boolean {
  return typeof window !== "undefined"
    && typeof window.Audio === "function"
    && !(typeof navigator !== "undefined" && /jsdom/iu.test(navigator.userAgent));
}

function audioUrl(fileName: string): string {
  return `${import.meta.env.BASE_URL}audio/${fileName}`;
}

class GameAudioManager {
  private settings = loadSettings();
  private desiredScene: AudioScene = "main";
  private activeScene: AudioScene | null = null;
  private unlocked = false;
  private readonly bgm = new Map<AudioScene, HTMLAudioElement>();
  private readonly sfx = new Map<SoundCue, HTMLAudioElement>();
  private readonly settingsListeners = new Set<(settings: AudioSettings) => void>();
  private readonly eventListeners = new Set<(event: GameAudioEvent) => void>();

  emit(event: GameAudioEvent): void {
    this.eventListeners.forEach((listener) => listener(event));
    if (event.type === "scene") {
      this.desiredScene = event.scene;
      if (this.unlocked) this.startDesiredBgm();
      return;
    }
    if (event.type === "touch") this.unlock();
    soundCuesForEvent(event).forEach((cue) => this.playSfx(cue));
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setBgmVolume(value: number): void {
    this.updateSettings({ ...this.settings, bgmVolume: clampVolume(value) });
    this.bgm.forEach((track) => { track.volume = this.settings.bgmVolume; });
    if (this.settings.bgmVolume > 0 && this.unlocked) this.startDesiredBgm();
  }

  setSfxVolume(value: number): void {
    this.updateSettings({ ...this.settings, sfxVolume: clampVolume(value) });
    this.sfx.forEach((track) => { track.volume = this.settings.sfxVolume; });
  }

  subscribeSettings(listener: (settings: AudioSettings) => void): () => void {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  subscribeEvents(listener: (event: GameAudioEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.startDesiredBgm();
  }

  private updateSettings(settings: AudioSettings): void {
    this.settings = settings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage가 차단된 환경에서도 현재 Session 설정은 유지합니다.
    }
    this.settingsListeners.forEach((listener) => listener(this.getSettings()));
  }

  private track(scene: AudioScene): HTMLAudioElement | null {
    if (!supportsAudioPlayback()) return null;
    const existing = this.bgm.get(scene);
    if (existing) return existing;
    const track = new Audio(audioUrl(AUDIO_FILE_NAMES[scene]));
    track.loop = true;
    track.preload = "auto";
    track.volume = this.settings.bgmVolume;
    this.bgm.set(scene, track);
    return track;
  }

  private effect(cue: SoundCue): HTMLAudioElement | null {
    if (!supportsAudioPlayback()) return null;
    const existing = this.sfx.get(cue);
    if (existing) return existing;
    const track = new Audio(audioUrl(AUDIO_FILE_NAMES[cue]));
    track.preload = "auto";
    track.volume = this.settings.sfxVolume;
    this.sfx.set(cue, track);
    return track;
  }

  private startDesiredBgm(): void {
    if (this.settings.bgmVolume <= 0) return;
    if (this.activeScene !== this.desiredScene) {
      this.bgm.forEach((track, scene) => {
        if (scene === this.desiredScene) return;
        track.pause();
        track.currentTime = 0;
      });
      this.activeScene = this.desiredScene;
    }
    const track = this.track(this.desiredScene);
    if (!track) return;
    track.volume = this.settings.bgmVolume;
    try {
      const started = track.play();
      void started?.catch(() => undefined);
    } catch {
      // 음원 파일이 아직 없거나 재생 정책에 막힌 경우 조용히 대기합니다.
    }
  }

  private playSfx(cue: SoundCue): void {
    if (!this.unlocked || this.settings.sfxVolume <= 0) return;
    const track = this.effect(cue);
    if (!track) return;
    track.volume = this.settings.sfxVolume;
    track.currentTime = 0;
    try {
      const started = track.play();
      void started?.catch(() => undefined);
    } catch {
      // 지정한 음원 파일을 추가하기 전에는 이벤트만 소비합니다.
    }
  }
}

export const gameAudio = new GameAudioManager();

export function emitGameAudio(event: GameAudioEvent): void {
  gameAudio.emit(event);
}
