// WebAudio mixer: decoded one-shot SFX with pitch/volume variance + looping music.

const SFX_FILES: Record<string, string> = {
  xp: '/assets/audio/xp.ogg',
  coin: '/assets/audio/coin.ogg',
  levelup: '/assets/audio/levelup.ogg',
  powerup: '/assets/audio/powerup.ogg',
  evolve: '/assets/audio/evolve.ogg',
  chest: '/assets/audio/chest.ogg',
  shot: '/assets/audio/shot.ogg',
  shoot_heavy: '/assets/audio/shoot_heavy.ogg',
  hit: '/assets/audio/hit.ogg',
  hit_flesh: '/assets/audio/hit_flesh.ogg',
  enemy_die: '/assets/audio/enemy_die.ogg',
  thud: '/assets/audio/thud.ogg',
  boss: '/assets/audio/boss.ogg',
  bottle: '/assets/audio/bottle.ogg',
  hurt: '/assets/audio/hurt.ogg',
  heal: '/assets/audio/heal.ogg',
  ui_move: '/assets/audio/ui_move.ogg',
  ui_select: '/assets/audio/ui_select.ogg',
  fanfare: '/assets/audio/fanfare.ogg',
};

const MUSIC_FILES = ['/assets/audio/music_a.m4a', '/assets/audio/music_b.m4a', '/assets/audio/music_c.m4a'];

class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private musicBufs: AudioBuffer[] = [];
  private musicSrc: AudioBufferSourceNode | null = null;
  private musicTrack = 0;
  private musicRequested = false;
  private lastPlay = new Map<string, number>();
  sfxVolume = 0.6;
  musicVolume = 0.45;
  muted = false;
  ready = false;

  /** Must be called from a user gesture. */
  async init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    await this.loadAll();
    this.ready = true;
    if (this.musicRequested) this.music();
  }

  private async decode(url: string) {
    const res = await fetch(import.meta.env.BASE_URL + url.slice(1));
    const ab = await res.arrayBuffer();
    return await this.ctx!.decodeAudioData(ab);
  }

  private async loadAll() {
    const jobs = Object.entries(SFX_FILES).map(async ([k, url]) => {
      try { this.buffers.set(k, await this.decode(url)); } catch { /* optional asset */ }
    });
    for (let i = 0; i < MUSIC_FILES.length; i++) {
      jobs.push((async () => {
        try { this.musicBufs[i] = await this.decode(MUSIC_FILES[i]); } catch { /* optional */ }
      })());
    }
    await Promise.all(jobs);
    this.musicBufs = this.musicBufs.filter(Boolean);
  }

  sfx(name: string, opts: { vol?: number; rate?: number; spread?: number; minGap?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const now = this.ctx.currentTime;
    const gap = opts.minGap ?? 0.028;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < gap) return;
    this.lastPlay.set(name, now);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const spread = opts.spread ?? 0.08;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * spread);
    const g = this.ctx.createGain();
    g.gain.value = Math.min(1.5, (opts.vol ?? 1) * (0.92 + Math.random() * 0.16));
    src.connect(g).connect(this.sfxBus);
    src.start(now, 0, Math.min(buf.duration, 2.5));
  }

  music(fadeIn = true) {
    this.stopMusic();
    this.musicRequested = true;
    if (!this.ctx || !this.ready || this.musicBufs.length === 0) return;
    const buf = this.musicBufs[this.musicTrack % this.musicBufs.length];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = fadeIn ? 0 : 1;
    if (fadeIn) g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.musicSrc = src;
  }

  stopMusic() {
    this.musicRequested = false;
    if (this.musicSrc) { try { this.musicSrc.stop(); } catch { /* already stopped */ } this.musicSrc = null; }
  }

  nextMusicTrack() { this.musicTrack++; this.music(true); }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : 1;
  }
}

export const audio = new Audio();
