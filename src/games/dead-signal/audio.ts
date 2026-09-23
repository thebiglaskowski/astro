/**
 * Every sound is synthesized at runtime — no audio files ship with the game.
 *
 * Signal flow:  voices → [panner] → sfx bus ─┬─→ health lowpass → master → compressor → out
 *                                            └─→ reverb send → convolver ┘
 *               music scheduler → music bus ─────────────────┘
 */

export type RobotVoice = 'alert' | 'bolt' | 'swipe' | 'roar' | 'step' | 'servo' | 'charge' | 'death' | 'lunge' | 'slam';

/** Pre-AudioParam spatial API — still the only one Firefox implements on the listener. */
interface LegacySpatial {
	setPosition(x: number, y: number, z: number): void;
	setOrientation(x: number, y: number, z: number, ux: number, uy: number, uz: number): void;
}

interface Pos {
	x: number;
	y: number;
	z: number;
}

export class Sound {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private sfx: GainNode | null = null;
	private music: GainNode | null = null;
	private reverbIn: GainNode | null = null;
	private healthFilter: BiquadFilterNode | null = null;
	private white: AudioBuffer | null = null;
	private brown: AudioBuffer | null = null;
	private ambience: GainNode | null = null;
	private heartTimer = 0;
	private score: Score | null = null;
	volume = 0.8;
	musicVolume = 0.55;

	get ready(): boolean {
		return this.ctx !== null;
	}

	/** Must run inside a user gesture (browsers block autoplay). */
	unlock(): void {
		if (this.ctx) {
			void this.ctx.resume();
			return;
		}
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		const ctx = new Ctor();
		this.ctx = ctx;

		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -14;
		comp.ratio.value = 4;
		comp.attack.value = 0.003;
		comp.release.value = 0.2;
		comp.connect(ctx.destination);
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		this.master.connect(comp);
		this.healthFilter = ctx.createBiquadFilter();
		this.healthFilter.type = 'lowpass';
		this.healthFilter.frequency.value = 20000;
		this.healthFilter.connect(this.master);
		this.sfx = ctx.createGain();
		this.sfx.connect(this.healthFilter);
		this.music = ctx.createGain();
		this.music.gain.value = this.musicVolume;
		this.music.connect(this.master);

		const convolver = ctx.createConvolver();
		convolver.buffer = this.impulse(ctx, 2.6);
		this.reverbIn = ctx.createGain();
		this.reverbIn.gain.value = 1;
		const wet = ctx.createGain();
		wet.gain.value = 0.55;
		this.reverbIn.connect(convolver).connect(wet).connect(this.healthFilter);

		const len = ctx.sampleRate * 2;
		this.white = ctx.createBuffer(1, len, ctx.sampleRate);
		this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
		const w = this.white.getChannelData(0);
		const b = this.brown.getChannelData(0);
		let last = 0;
		for (let i = 0; i < len; i++) {
			w[i] = Math.random() * 2 - 1;
			last = (last + 0.02 * w[i]) / 1.02;
			b[i] = last * 3.5;
		}
		this.startAmbience();
		this.score = new Score(ctx, this.music, this.reverbIn, this.white);
	}

	/** Street-canyon impulse: slap echoes off buildings, then a long diffuse tail. */
	private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
		const len = Math.floor(ctx.sampleRate * seconds);
		const buf = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let c = 0; c < 2; c++) {
			const d = buf.getChannelData(c);
			for (let i = 0; i < len; i++) {
				const t = i / ctx.sampleRate;
				d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, 3.2) * 0.35;
			}
			for (const [time, amp] of [
				[0.045, 0.7],
				[0.11, 0.5],
				[0.19 + c * 0.02, 0.4],
				[0.33, 0.25],
			]) {
				const at = Math.floor(time * ctx.sampleRate);
				for (let k = 0; k < 300; k++) d[at + k] += (Math.random() * 2 - 1) * amp * (1 - k / 300);
			}
		}
		return buf;
	}

	setVolume(v: number): void {
		this.volume = v;
		if (this.master) this.master.gain.value = v;
	}
	setMusicVolume(v: number): void {
		this.musicVolume = v;
		if (this.music) this.music.gain.value = v;
	}

	/** Keep the Web Audio listener glued to the camera. */
	setListener(pos: Pos, fwd: Pos): void {
		const ctx = this.ctx;
		if (!ctx) return;
		const l = ctx.listener;
		if (l.positionX) {
			const t = ctx.currentTime;
			l.positionX.setTargetAtTime(pos.x, t, 0.02);
			l.positionY.setTargetAtTime(pos.y, t, 0.02);
			l.positionZ.setTargetAtTime(pos.z, t, 0.02);
			l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
			l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
			l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
			l.upX.value = 0;
			l.upY.value = 1;
			l.upZ.value = 0;
		} else {
			const legacy = l as unknown as LegacySpatial;
			legacy.setPosition(pos.x, pos.y, pos.z);
			legacy.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
		}
	}

	/** Low health muffles the world. */
	setHealth(hp: number): void {
		if (!this.healthFilter || !this.ctx) return;
		const f = hp > 35 ? 20000 : 600 + (hp / 35) * 5000;
		this.healthFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
	}

	setIntensity(x: number): void {
		this.score?.setIntensity(x);
	}

	tickMusic(): void {
		this.score?.tick();
	}

	private startAmbience(): void {
		const ctx = this.ctx;
		if (!ctx || !this.sfx || !this.white || !this.brown) return;
		this.ambience = ctx.createGain();
		this.ambience.gain.value = 0;
		this.ambience.connect(this.sfx);
		// stereo rain: two decorrelated noise beds
		for (const pan of [-0.7, 0.7]) {
			const src = ctx.createBufferSource();
			src.buffer = this.white;
			src.loop = true;
			src.playbackRate.value = pan < 0 ? 1 : 0.93;
			const bp = ctx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = pan < 0 ? 4200 : 3100;
			bp.Q.value = 0.35;
			const g = ctx.createGain();
			g.gain.value = 0.05;
			const p = ctx.createStereoPanner();
			p.pan.value = pan;
			src.connect(bp).connect(g).connect(p).connect(this.ambience);
			src.start(0, Math.random());
		}
		// drips / gutter patter
		const patter = ctx.createBufferSource();
		patter.buffer = this.brown;
		patter.loop = true;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 900;
		const pg = ctx.createGain();
		pg.gain.value = 0.05;
		patter.connect(hp).connect(pg).connect(this.ambience);
		patter.start();
		// wind with slow swells
		const wind = ctx.createBufferSource();
		wind.buffer = this.brown;
		wind.loop = true;
		wind.playbackRate.value = 0.6;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 380;
		const wg = ctx.createGain();
		wg.gain.value = 0.16;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.05;
		const lfoGain = ctx.createGain();
		lfoGain.gain.value = 0.08;
		lfo.connect(lfoGain).connect(wg.gain);
		lfo.start();
		wind.connect(lp).connect(wg).connect(this.ambience);
		wind.start();
		// distant city hum
		for (const f of [49, 98.3]) {
			const o = ctx.createOscillator();
			o.frequency.value = f;
			const g = ctx.createGain();
			g.gain.value = 0.012;
			o.connect(g).connect(this.ambience);
			o.start();
		}
	}

	setAmbience(level: number): void {
		if (this.ambience && this.ctx) this.ambience.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
	}

	// ── building blocks ────────────────────────────────────────────────────

	/** Destination for a voice: positional (HRTF) when `at` is given. */
	private out(at?: Pos, send = 0.25, refDistance = 4): AudioNode | null {
		const ctx = this.ctx;
		if (!ctx || !this.sfx || !this.reverbIn) return null;
		const g = ctx.createGain();
		if (at) {
			const p = ctx.createPanner();
			p.panningModel = 'HRTF';
			p.distanceModel = 'inverse';
			p.refDistance = refDistance;
			p.rolloffFactor = 1.3;
			p.maxDistance = 200;
			if (p.positionX) {
				p.positionX.value = at.x;
				p.positionY.value = at.y;
				p.positionZ.value = at.z;
			} else (p as unknown as LegacySpatial).setPosition(at.x, at.y, at.z);
			g.connect(p).connect(this.sfx);
			const s = ctx.createGain();
			s.gain.value = send;
			p.connect(s).connect(this.reverbIn);
		} else {
			g.connect(this.sfx);
			const s = ctx.createGain();
			s.gain.value = send;
			g.connect(s).connect(this.reverbIn);
		}
		return g;
	}

	private noise(
		dest: AudioNode | null,
		o: { dur: number; vol: number; f0: number; f1?: number; type?: BiquadFilterType; q?: number; delay?: number; rate?: number; buf?: 'white' | 'brown'; attack?: number },
	): void {
		const ctx = this.ctx;
		const buf = o.buf === 'brown' ? this.brown : this.white;
		if (!ctx || !dest || !buf) return;
		const t = ctx.currentTime + (o.delay ?? 0);
		const src = ctx.createBufferSource();
		src.buffer = buf;
		// looping lets sounds longer than the 2 s noise buffer (thunder, explosions) keep their tails
		src.loop = true;
		src.playbackRate.value = o.rate ?? 0.85 + Math.random() * 0.3;
		const f = ctx.createBiquadFilter();
		f.type = o.type ?? 'lowpass';
		f.Q.value = o.q ?? 0.8;
		f.frequency.setValueAtTime(o.f0, t);
		f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0), t + o.dur);
		const g = ctx.createGain();
		const a = o.attack ?? 0.002;
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(o.vol, t + a);
		g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
		src.connect(f).connect(g).connect(dest);
		src.start(t, Math.random() * buf.duration);
		src.stop(t + o.dur + 0.1);
	}

	private tone(
		dest: AudioNode | null,
		o: { f0: number; f1?: number; dur: number; vol: number; type?: OscillatorType; delay?: number; attack?: number; detune?: number },
	): void {
		const ctx = this.ctx;
		if (!ctx || !dest) return;
		const t = ctx.currentTime + (o.delay ?? 0);
		const osc = ctx.createOscillator();
		osc.type = o.type ?? 'sine';
		osc.detune.value = o.detune ?? 0;
		osc.frequency.setValueAtTime(o.f0, t);
		osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 ?? o.f0), t + o.dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack ?? 0.004));
		g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
		osc.connect(g).connect(dest);
		osc.start(t);
		osc.stop(t + o.dur + 0.05);
	}

	/** Inharmonic partials read as struck metal. */
	private metal(dest: AudioNode | null, base: number, dur: number, vol: number, delay = 0): void {
		for (const [ratio, amp] of [
			[1, 1],
			[2.76, 0.6],
			[5.4, 0.4],
			[8.93, 0.25],
		]) {
			this.tone(dest, { f0: base * ratio, dur: dur / Math.sqrt(ratio), vol: vol * amp, type: 'sine', delay });
		}
	}

	// ── weapons ────────────────────────────────────────────────────────────

	rifle(): void {
		const d = this.out(undefined, 0.7);
		const p = 0.94 + Math.random() * 0.12;
		this.noise(d, { dur: 0.025, vol: 0.9, f0: 9000, type: 'highpass' });
		this.noise(d, { dur: 0.16, vol: 1.0, f0: 2600 * p, f1: 380, type: 'bandpass', q: 0.6 });
		this.tone(d, { f0: 150 * p, f1: 42, dur: 0.12, vol: 0.9, type: 'sine' });
		this.tone(d, { f0: 95 * p, f1: 40, dur: 0.09, vol: 0.4, type: 'sawtooth' });
		this.noise(d, { dur: 0.5, vol: 0.18, f0: 1200, f1: 150, delay: 0.03, buf: 'brown' });
		this.tone(d, { f0: 3100, dur: 0.018, vol: 0.08, type: 'square', delay: 0.05 });
	}
	pistol(): void {
		const d = this.out(undefined, 0.65);
		const p = 0.95 + Math.random() * 0.1;
		this.noise(d, { dur: 0.02, vol: 0.8, f0: 10000, type: 'highpass' });
		this.noise(d, { dur: 0.13, vol: 0.9, f0: 3400 * p, f1: 600, type: 'bandpass', q: 0.7 });
		this.tone(d, { f0: 220 * p, f1: 60, dur: 0.09, vol: 0.55, type: 'triangle' });
	}
	casing(): void {
		const d = this.out(undefined, 0.1);
		const f = 3800 + Math.random() * 1500;
		this.metal(d, f, 0.18, 0.03, 0.35 + Math.random() * 0.2);
		this.metal(d, f * 1.07, 0.12, 0.02, 0.5 + Math.random() * 0.2);
	}
	dry(): void {
		this.tone(this.out(undefined, 0.1), { f0: 1900, f1: 1300, dur: 0.03, vol: 0.2, type: 'square' });
	}
	reload(duration: number): void {
		const d = this.out(undefined, 0.15);
		const s = duration / 2.1;
		this.noise(d, { dur: 0.05, vol: 0.45, f0: 2500, type: 'bandpass', q: 2, delay: 0.15 * s }); // mag release
		this.metal(d, 900, 0.1, 0.1, 0.18 * s);
		this.noise(d, { dur: 0.08, vol: 0.25, f0: 800, f1: 300, delay: 0.5 * s, buf: 'brown' }); // mag drop
		this.noise(d, { dur: 0.06, vol: 0.55, f0: 1800, type: 'bandpass', q: 1.5, delay: 1.15 * s }); // seat
		this.metal(d, 620, 0.12, 0.14, 1.16 * s);
		this.noise(d, { dur: 0.05, vol: 0.5, f0: 3200, type: 'bandpass', q: 2, delay: 1.6 * s }); // charging handle
		this.noise(d, { dur: 0.06, vol: 0.6, f0: 2400, type: 'bandpass', q: 2, delay: 1.75 * s });
		this.metal(d, 1300, 0.1, 0.1, 1.76 * s);
	}
	swap(): void {
		const d = this.out(undefined, 0.1);
		this.noise(d, { dur: 0.12, vol: 0.2, f0: 1800, f1: 900, type: 'bandpass' });
		this.metal(d, 1100, 0.08, 0.06, 0.18);
	}
	melee(hit: boolean): void {
		const d = this.out(undefined, 0.3);
		this.noise(d, { dur: 0.16, vol: 0.35, f0: 600, f1: 2400, type: 'bandpass', q: 0.8 });
		if (hit) {
			this.metal(d, 310, 0.5, 0.35, 0.05);
			this.tone(d, { f0: 120, f1: 50, dur: 0.12, vol: 0.6, delay: 0.05 });
		}
	}

	/** Bullet striking robot armour. */
	hitRobot(head: boolean, kill: boolean): void {
		const d = this.out(undefined, 0.15);
		this.metal(d, head ? 2400 : 1500 + Math.random() * 400, 0.22, 0.14);
		this.noise(d, { dur: 0.04, vol: 0.3, f0: 6000, type: 'highpass' });
		if (head) this.tone(d, { f0: 3800, dur: 0.28, vol: 0.12, type: 'sine' });
		if (kill) {
			this.tone(d, { f0: 1500, f1: 900, dur: 0.12, vol: 0.14, type: 'square', delay: 0.02 });
			this.tone(d, { f0: 1000, f1: 600, dur: 0.16, vol: 0.12, type: 'square', delay: 0.09 });
		}
	}
	ricochet(at: Pos): void {
		const d = this.out(at, 0.3, 2);
		if (Math.random() < 0.35) this.tone(d, { f0: 2800 + Math.random() * 1500, f1: 900, dur: 0.25, vol: 0.12, type: 'sine' });
		this.noise(d, { dur: 0.06, vol: 0.25, f0: 3000, type: 'bandpass', q: 1 });
	}
	whizz(at: Pos): void {
		const d = this.out(at, 0.05, 1);
		this.noise(d, { dur: 0.22, vol: 0.5, f0: 3000, f1: 700, type: 'bandpass', q: 4 });
		this.tone(d, { f0: 900, f1: 300, dur: 0.2, vol: 0.12, type: 'sawtooth' });
	}

	// ── player ─────────────────────────────────────────────────────────────

	step(sprint: boolean): void {
		const d = this.out(undefined, 0.05);
		this.noise(d, { dur: 0.09, vol: sprint ? 0.14 : 0.09, f0: 1600, f1: 500, type: 'bandpass', q: 0.9 }); // wet slap
		this.noise(d, { dur: 0.06, vol: 0.12, f0: 220, buf: 'brown' });
	}
	land(): void {
		const d = this.out(undefined, 0.1);
		this.noise(d, { dur: 0.18, vol: 0.35, f0: 1200, f1: 300, type: 'bandpass' });
		this.tone(d, { f0: 90, f1: 45, dur: 0.12, vol: 0.4 });
	}
	hurt(): void {
		const d = this.out(undefined, 0.1);
		this.tone(d, { f0: 180, f1: 70, dur: 0.22, vol: 0.35, type: 'sawtooth' });
		this.noise(d, { dur: 0.2, vol: 0.4, f0: 900, f1: 200 });
	}
	armorBreak(): void {
		const d = this.out(undefined, 0.3);
		this.metal(d, 700, 0.6, 0.25);
		this.noise(d, { dur: 0.3, vol: 0.4, f0: 5000, f1: 800, type: 'highpass' });
	}
	pin(): void {
		const d = this.out(undefined, 0.05);
		this.metal(d, 2600, 0.08, 0.1);
		this.noise(d, { dur: 0.05, vol: 0.15, f0: 4000, type: 'highpass', delay: 0.12 });
	}
	grenadeBounce(at: Pos): void {
		this.metal(this.out(at, 0.1, 2), 700 + Math.random() * 300, 0.15, 0.2);
	}
	explosion(at: Pos): void {
		const d = this.out(at, 0.9, 12);
		this.noise(d, { dur: 0.08, vol: 1.2, f0: 7000, type: 'highpass' });
		this.noise(d, { dur: 1.9, vol: 1.4, f0: 3200, f1: 60, attack: 0.005 });
		this.noise(d, { dur: 2.6, vol: 0.6, f0: 500, f1: 40, buf: 'brown', delay: 0.05 });
		this.tone(d, { f0: 65, f1: 22, dur: 1.2, vol: 1.1 });
		for (let k = 0; k < 6; k++) this.metal(d, 400 + Math.random() * 900, 0.3, 0.05, 0.3 + Math.random() * 0.9);
	}
	plate(): void {
		const d = this.out(undefined, 0.1);
		this.noise(d, { dur: 0.2, vol: 0.4, f0: 3200, f1: 1400, type: 'bandpass' });
		this.metal(d, 500, 0.3, 0.14, 0.18);
		this.tone(d, { f0: 600, f1: 1200, dur: 0.25, vol: 0.12, type: 'triangle', delay: 0.25 });
	}
	pickup(): void {
		const d = this.out(undefined, 0.1);
		this.tone(d, { f0: 880, dur: 0.08, vol: 0.14, type: 'triangle' });
		this.tone(d, { f0: 1320, dur: 0.14, vol: 0.14, type: 'triangle', delay: 0.07 });
	}
	flashlight(): void {
		this.metal(this.out(undefined, 0.02), 3000, 0.04, 0.1);
	}
	ui(): void {
		this.tone(this.out(undefined, 0.02), { f0: 1100, dur: 0.05, vol: 0.1, type: 'square' });
	}
	objective(good = true): void {
		const d = this.out(undefined, 0.4);
		const notes = good ? [440, 554, 659, 880] : [392, 311, 233, 196];
		notes.forEach((n, i) => {
			this.tone(d, { f0: n, dur: 0.6, vol: 0.14, type: 'triangle', delay: i * 0.11 });
			this.tone(d, { f0: n * 2, dur: 0.4, vol: 0.05, type: 'sine', delay: i * 0.11 });
		});
	}
	alarm(): void {
		const d = this.out(undefined, 0.5);
		for (let k = 0; k < 3; k++) this.tone(d, { f0: 740, f1: 520, dur: 0.45, vol: 0.14, type: 'square', delay: k * 0.55 });
	}
	thunder(distance: number): void {
		const d = this.out(undefined, 0.9);
		const v = Math.max(0.3, 1 - distance);
		if (distance < 0.4) this.noise(d, { dur: 0.5, vol: 0.9 * v, f0: 6000, f1: 800, type: 'highpass' });
		this.noise(d, { dur: 4.5, vol: 1.1 * v, f0: 700, f1: 60, buf: 'brown', attack: 0.15 });
		this.noise(d, { dur: 3.5, vol: 0.6 * v, f0: 300, f1: 40, buf: 'brown', delay: 0.6, attack: 0.3 });
	}
	/** Looping rotor chop for the extraction gunship; position it every frame. */
	heliLoop(): { set(at: Pos, level: number): void; stop(): void } | null {
		const ctx = this.ctx;
		if (!ctx || !this.sfx || !this.brown || !this.reverbIn) return null;
		const src = ctx.createBufferSource();
		src.buffer = this.brown;
		src.loop = true;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 520;
		const am = ctx.createGain();
		am.gain.value = 0.55;
		const lfo = ctx.createOscillator();
		lfo.type = 'sawtooth';
		lfo.frequency.value = 10.5;
		const depth = ctx.createGain();
		depth.gain.value = 0.45;
		lfo.connect(depth).connect(am.gain);
		const whine = ctx.createOscillator();
		whine.type = 'sawtooth';
		whine.frequency.value = 142;
		const whineGain = ctx.createGain();
		whineGain.gain.value = 0.015;
		const level = ctx.createGain();
		level.gain.value = 0;
		const p = ctx.createPanner();
		p.panningModel = 'HRTF';
		p.distanceModel = 'inverse';
		p.refDistance = 18;
		p.rolloffFactor = 1;
		src.connect(lp).connect(am).connect(level);
		whine.connect(whineGain).connect(level);
		level.connect(p).connect(this.sfx);
		const send = ctx.createGain();
		send.gain.value = 0.4;
		p.connect(send).connect(this.reverbIn);
		src.start();
		lfo.start();
		whine.start();
		return {
			set: (at: Pos, lvl: number) => {
				const t = ctx.currentTime;
				if (p.positionX) {
					p.positionX.setTargetAtTime(at.x, t, 0.05);
					p.positionY.setTargetAtTime(at.y, t, 0.05);
					p.positionZ.setTargetAtTime(at.z, t, 0.05);
				} else (p as unknown as LegacySpatial).setPosition(at.x, at.y, at.z);
				level.gain.setTargetAtTime(lvl * 1.4, t, 0.3);
			},
			stop: () => {
				const t = ctx.currentTime;
				level.gain.setTargetAtTime(0, t, 0.2);
				src.stop(t + 1);
				lfo.stop(t + 1);
				whine.stop(t + 1);
				setTimeout(() => p.disconnect(), 1200);
			},
		};
	}

	heartbeat(dt: number, health: number): void {
		if (health > 35 || health <= 0) return;
		this.heartTimer -= dt;
		if (this.heartTimer <= 0) {
			this.heartTimer = 0.55 + health / 60;
			const d = this.out(undefined, 0);
			this.tone(d, { f0: 62, f1: 40, dur: 0.14, vol: 0.55 });
			this.tone(d, { f0: 55, f1: 38, dur: 0.14, vol: 0.4, delay: 0.17 });
		}
	}

	// ── robots (positional) ────────────────────────────────────────────────

	robot(name: RobotVoice, at: Pos): void {
		switch (name) {
			case 'alert': {
				// descending bit-crushed chirp: the unit has you
				const d = this.out(at, 0.3, 5);
				[1760, 1318, 1760, 880].forEach((f, i) => this.tone(d, { f0: f, dur: 0.07, vol: 0.18, type: 'square', delay: i * 0.075 }));
				this.tone(d, { f0: 220, f1: 110, dur: 0.35, vol: 0.12, type: 'sawtooth', delay: 0.3 });
				break;
			}
			case 'servo': {
				const d = this.out(at, 0.15, 3);
				const f = 300 + Math.random() * 200;
				this.tone(d, { f0: f, f1: f * 1.8, dur: 0.28, vol: 0.07, type: 'sawtooth', attack: 0.05 });
				this.tone(d, { f0: f * 1.8, f1: f * 1.2, dur: 0.22, vol: 0.05, type: 'sawtooth', delay: 0.27, attack: 0.03 });
				break;
			}
			case 'step': {
				const d = this.out(at, 0.1, 3);
				this.metal(d, 140 + Math.random() * 40, 0.16, 0.12);
				this.noise(d, { dur: 0.05, vol: 0.2, f0: 1800, type: 'bandpass', q: 1 });
				break;
			}
			case 'charge': {
				const d = this.out(at, 0.3, 6);
				this.tone(d, { f0: 200, f1: 2400, dur: 0.75, vol: 0.12, type: 'sawtooth', attack: 0.1 });
				this.tone(d, { f0: 205, f1: 2450, dur: 0.75, vol: 0.08, type: 'square', attack: 0.1 });
				break;
			}
			case 'bolt': {
				const d = this.out(at, 0.5, 8);
				this.tone(d, { f0: 1600, f1: 140, dur: 0.3, vol: 0.28, type: 'sawtooth' });
				this.noise(d, { dur: 0.2, vol: 0.5, f0: 5000, f1: 900, type: 'bandpass', q: 1.2 });
				this.tone(d, { f0: 80, f1: 40, dur: 0.15, vol: 0.4 });
				break;
			}
			case 'lunge': {
				const d = this.out(at, 0.2, 4);
				this.tone(d, { f0: 400, f1: 1600, dur: 0.3, vol: 0.14, type: 'sawtooth' });
				this.noise(d, { dur: 0.25, vol: 0.3, f0: 800, f1: 3000, type: 'bandpass' });
				break;
			}
			case 'swipe': {
				const d = this.out(at, 0.2, 3);
				this.noise(d, { dur: 0.2, vol: 0.45, f0: 500, f1: 2800, type: 'bandpass', q: 0.8 });
				break;
			}
			case 'slam': {
				const d = this.out(at, 0.9, 14);
				this.tone(d, { f0: 70, f1: 25, dur: 1.0, vol: 1.2 });
				this.noise(d, { dur: 1.2, vol: 1.0, f0: 1500, f1: 60, buf: 'brown' });
				this.metal(d, 180, 1.2, 0.3);
				break;
			}
			case 'roar': {
				const d = this.out(at, 0.8, 18);
				this.tone(d, { f0: 58, f1: 38, dur: 2.0, vol: 0.5, type: 'sawtooth', attack: 0.2 });
				this.tone(d, { f0: 87, f1: 55, dur: 2.0, vol: 0.3, type: 'square', attack: 0.3 });
				this.tone(d, { f0: 440, f1: 220, dur: 1.4, vol: 0.12, type: 'sawtooth', attack: 0.1 });
				this.noise(d, { dur: 1.8, vol: 0.4, f0: 900, f1: 120, buf: 'brown', attack: 0.2 });
				break;
			}
			case 'death': {
				const d = this.out(at, 0.5, 6);
				// electrical crackle, power-down whine, clatter
				for (let k = 0; k < 7; k++) this.noise(d, { dur: 0.03, vol: 0.45, f0: 5000, type: 'highpass', delay: Math.random() * 0.5 });
				this.tone(d, { f0: 900, f1: 45, dur: 0.9, vol: 0.18, type: 'sawtooth' });
				this.metal(d, 260, 0.5, 0.2, 0.45);
				this.metal(d, 190, 0.6, 0.18, 0.62);
				this.noise(d, { dur: 0.3, vol: 0.4, f0: 600, f1: 200, buf: 'brown', delay: 0.5 });
				break;
			}
		}
	}
}

/**
 * Adaptive score: a dark A-minor drone that grows a pulse bass, hats, arpeggio
 * and kick as combat intensity rises. Scheduled with a small lookahead.
 */
class Score {
	private readonly ctx: AudioContext;
	private readonly out: GainNode;
	private readonly verb: AudioNode;
	private readonly noise: AudioBuffer;
	private intensity = 0;
	private target = 0;
	private step = 0;
	private next = 0;
	private readonly spb = 60 / 88 / 4; // sixteenth at 88 bpm
	private readonly pad: GainNode;
	private readonly padOsc: OscillatorNode[] = [];
	private readonly chords = [
		[57, 60, 64],
		[53, 57, 60],
		[50, 53, 57],
		[52, 56, 59],
	];

	constructor(ctx: AudioContext, out: GainNode, verb: AudioNode, noise: AudioBuffer) {
		this.ctx = ctx;
		this.out = out;
		this.verb = verb;
		this.noise = noise;
		this.pad = ctx.createGain();
		this.pad.gain.value = 0.0;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 900;
		this.pad.connect(lp).connect(out);
		const send = ctx.createGain();
		send.gain.value = 0.3;
		lp.connect(send).connect(verb);
		for (let k = 0; k < 6; k++) {
			const o = ctx.createOscillator();
			o.type = 'sawtooth';
			o.detune.value = (k % 2 ? 1 : -1) * 9;
			o.connect(this.pad);
			o.start();
			this.padOsc.push(o);
		}
		this.next = ctx.currentTime + 0.1;
		this.setChord(0, ctx.currentTime);
	}

	private hz(midi: number): number {
		return 440 * Math.pow(2, (midi - 69) / 12);
	}

	private setChord(i: number, t: number): void {
		const c = this.chords[i % this.chords.length];
		this.padOsc.forEach((o, k) => o.frequency.setTargetAtTime(this.hz(c[k % 3] - 12 * (k < 3 ? 1 : 0)), t, 0.4));
	}

	setIntensity(x: number): void {
		this.target = Math.max(0, Math.min(1, x));
	}

	tick(): void {
		const ctx = this.ctx;
		this.intensity += (this.target - this.intensity) * 0.02;
		this.pad.gain.setTargetAtTime(0.018 + this.intensity * 0.012, ctx.currentTime, 0.5);
		// rAF stops while the tab is hidden but the AudioContext keeps running;
		// skip the missed steps instead of firing them all at once on return
		if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
		while (this.next < ctx.currentTime + 0.12) {
			this.schedule(this.step, this.next);
			this.next += this.spb;
			this.step++;
		}
	}

	private schedule(step: number, t: number): void {
		const i = this.intensity;
		const bar = Math.floor(step / 16);
		const s = step % 16;
		const chord = this.chords[Math.floor(bar / 2) % this.chords.length];
		if (s === 0 && bar % 2 === 0) this.setChord(Math.floor(bar / 2), t);
		const root = chord[0] - 24;
		if (i > 0.2 && s % 2 === 0) this.note(this.hz(s % 8 === 6 ? root + 7 : root), t, 0.18, 0.09 * Math.min(1, (i - 0.2) * 3), 'sawtooth', 260 + i * 700);
		if (i > 0.4 && s % 4 === 2) this.hat(t, 0.03 * Math.min(1, (i - 0.4) * 3));
		if (i > 0.55) {
			const arp = [0, 1, 2, 1, 2, 0, 2, 1];
			const n = chord[arp[s % 8]] + 12;
			if (s % 2 === 1) this.note(this.hz(n), t, 0.12, 0.035 * Math.min(1, (i - 0.55) * 3), 'square', 2400, 0.35);
		}
		if (i > 0.72 && (s === 0 || s === 8 || (s === 10 && bar % 2 === 1))) this.kick(t, 0.35 * Math.min(1, (i - 0.72) * 4));
	}

	private note(f: number, t: number, dur: number, vol: number, type: OscillatorType, cutoff: number, send = 0.1): void {
		const ctx = this.ctx;
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.value = f;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.setValueAtTime(cutoff, t);
		lp.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.3), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(lp).connect(g).connect(this.out);
		const s = ctx.createGain();
		s.gain.value = send;
		g.connect(s).connect(this.verb);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	private hat(t: number, vol: number): void {
		const ctx = this.ctx;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		const hp = ctx.createBiquadFilter();
		hp.type = 'highpass';
		hp.frequency.value = 7000;
		const g = ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
		src.connect(hp).connect(g).connect(this.out);
		src.start(t, Math.random() * (this.noise.duration - 0.1), 0.08);
	}

	private kick(t: number, vol: number): void {
		const ctx = this.ctx;
		const o = ctx.createOscillator();
		o.frequency.setValueAtTime(120, t);
		o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
		const g = ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
		o.connect(g).connect(this.out);
		o.start(t);
		o.stop(t + 0.35);
	}
}

