/** Every sound is synthesized at runtime — no audio files ship with the game. */
export class Sound {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private noise: AudioBuffer | null = null;
	private ambience: GainNode | null = null;
	private heartTimer = 0;
	volume = 0.8;

	/** Must run inside a user gesture (browsers block autoplay). */
	unlock(): void {
		if (this.ctx) {
			void this.ctx.resume();
			return;
		}
		const Ctor =
			window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		const ctx = new Ctor();
		this.ctx = ctx;
		this.master = ctx.createGain();
		this.master.gain.value = this.volume;
		const comp = ctx.createDynamicsCompressor();
		this.master.connect(comp).connect(ctx.destination);
		const len = ctx.sampleRate * 2;
		this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
		this.startAmbience();
	}

	setVolume(v: number): void {
		this.volume = v;
		if (this.master) this.master.gain.value = v;
	}

	private startAmbience(): void {
		const ctx = this.ctx;
		if (!ctx || !this.master || !this.noise) return;
		this.ambience = ctx.createGain();
		this.ambience.gain.value = 0;
		this.ambience.connect(this.master);
		// rain hiss
		const rain = ctx.createBufferSource();
		rain.buffer = this.noise;
		rain.loop = true;
		const hp = ctx.createBiquadFilter();
		hp.type = 'bandpass';
		hp.frequency.value = 3500;
		hp.Q.value = 0.4;
		const rg = ctx.createGain();
		rg.gain.value = 0.06;
		rain.connect(hp).connect(rg).connect(this.ambience);
		rain.start();
		// low wind drone
		const wind = ctx.createBufferSource();
		wind.buffer = this.noise;
		wind.loop = true;
		wind.playbackRate.value = 0.5;
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 260;
		const wg = ctx.createGain();
		wg.gain.value = 0.12;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.07;
		const lfoGain = ctx.createGain();
		lfoGain.gain.value = 120;
		lfo.connect(lfoGain).connect(lp.frequency);
		lfo.start();
		wind.connect(lp).connect(wg).connect(this.ambience);
		wind.start();
		// distant tone
		for (const f of [55, 82.4]) {
			const o = ctx.createOscillator();
			o.type = 'sine';
			o.frequency.value = f;
			const g = ctx.createGain();
			g.gain.value = 0.025;
			o.connect(g).connect(this.ambience);
			o.start();
		}
	}

	setAmbience(level: number): void {
		if (this.ambience && this.ctx) this.ambience.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
	}

	private burst(dur: number, vol: number, freq: number, endFreq: number, type: BiquadFilterType = 'lowpass', delay = 0, pan = 0): void {
		const ctx = this.ctx;
		if (!ctx || !this.master || !this.noise) return;
		const t = ctx.currentTime + delay;
		const src = ctx.createBufferSource();
		src.buffer = this.noise;
		src.playbackRate.value = 0.8 + Math.random() * 0.4;
		const f = ctx.createBiquadFilter();
		f.type = type;
		f.frequency.setValueAtTime(freq, t);
		f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		src.connect(f).connect(g).connect(p).connect(this.master);
		src.start(t, Math.random(), dur + 0.05);
	}

	private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', endFreq = freq, delay = 0, pan = 0): void {
		const ctx = this.ctx;
		if (!ctx || !this.master) return;
		const t = ctx.currentTime + delay;
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		const p = ctx.createStereoPanner();
		p.pan.value = pan;
		o.connect(g).connect(p).connect(this.master);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	rifle(): void {
		this.burst(0.18, 0.9, 5000, 300);
		this.tone(140, 0.12, 0.5, 'triangle', 45);
		this.burst(0.5, 0.12, 900, 120, 'lowpass', 0.04);
	}
	pistol(): void {
		this.burst(0.14, 0.75, 6000, 500);
		this.tone(220, 0.1, 0.35, 'triangle', 60);
	}
	dry(): void {
		this.tone(1800, 0.03, 0.2, 'square', 1200);
	}
	reload(): void {
		this.tone(900, 0.04, 0.2, 'square', 500, 0.1);
		this.burst(0.05, 0.3, 3000, 1500, 'bandpass', 0.35);
		this.tone(1200, 0.04, 0.25, 'square', 700, 0.9);
		this.burst(0.06, 0.35, 2500, 1200, 'bandpass', 1.1);
	}
	swap(): void {
		this.burst(0.08, 0.25, 2500, 1200, 'bandpass');
	}
	hitmarker(kill: boolean): void {
		this.tone(kill ? 1400 : 2200, 0.05, 0.18, 'square', kill ? 900 : 2000);
	}
	step(): void {
		this.burst(0.07, 0.08, 900, 250, 'lowpass', 0, (Math.random() - 0.5) * 0.3);
	}
	hurt(): void {
		this.tone(160, 0.25, 0.4, 'sawtooth', 70);
		this.burst(0.2, 0.3, 700, 150);
	}
	explosion(dist: number): void {
		const v = Math.max(0.15, 1 - dist / 80);
		this.burst(1.6, 1.2 * v, 1400, 40);
		this.tone(70, 0.9, 0.9 * v, 'sine', 25);
	}
	pin(): void {
		this.tone(2400, 0.05, 0.15, 'square', 2000);
	}
	plate(): void {
		this.burst(0.15, 0.35, 4000, 1800, 'bandpass');
		this.tone(600, 0.15, 0.2, 'triangle', 900, 0.15);
	}
	pickup(): void {
		this.tone(880, 0.08, 0.2, 'triangle', 880);
		this.tone(1320, 0.12, 0.2, 'triangle', 1320, 0.07);
	}
	ui(): void {
		this.tone(1000, 0.05, 0.12, 'square', 1000);
	}
	objective(good = true): void {
		const notes = good ? [523, 659, 784] : [392, 311, 233];
		notes.forEach((n, i) => this.tone(n, 0.35, 0.25, 'triangle', n, i * 0.12));
	}
	alarm(): void {
		this.tone(700, 0.4, 0.2, 'square', 500);
		this.tone(700, 0.4, 0.2, 'square', 500, 0.5);
	}

	/** Positional-ish enemy sounds: volume falls off with distance, panned by bearing. */
	enemy(name: 'groan' | 'bolt' | 'swipe' | 'roar', dist: number, pan: number): void {
		const v = Math.max(0, 1 - dist / 45);
		if (v <= 0) return;
		if (name === 'groan') {
			const f = 70 + Math.random() * 40;
			this.tone(f, 0.9, 0.25 * v, 'sawtooth', f * 0.7, 0, pan);
			this.burst(0.8, 0.12 * v, 500, 200, 'bandpass', 0, pan);
		} else if (name === 'roar') {
			this.tone(48, 1.6, 0.6 * v, 'sawtooth', 30, 0, pan);
			this.burst(1.4, 0.4 * v, 800, 90, 'lowpass', 0, pan);
		} else if (name === 'bolt') {
			this.tone(900, 0.25, 0.25 * v, 'sawtooth', 200, 0, pan);
		} else {
			this.burst(0.18, 0.4 * v, 2000, 400, 'bandpass', 0, pan);
		}
	}

	heartbeat(dt: number, health: number): void {
		if (health > 35 || health <= 0) return;
		this.heartTimer -= dt;
		if (this.heartTimer <= 0) {
			this.heartTimer = 0.55 + health / 60;
			this.tone(60, 0.12, 0.5, 'sine', 40);
			this.tone(55, 0.12, 0.4, 'sine', 38, 0.16);
		}
	}
}
