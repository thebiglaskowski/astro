import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sound } from './audio';
import { type Enemy, type EnemyHost, type EnemyKind, EnemyManager } from './enemies';
import { Hud, type ObjectiveView } from './hud';
import { clamp, damp, formatClock, glowTexture, pick, rand, wrapAngle } from './util';
import { WEAPONS, type WeaponId, Viewmodel } from './weapons';
import { BOUND, World } from './world';

const MISSION_TIME = 15 * 60;
const UPLINK_TIME = 75;
const EXTRACT_TIME = 40;
const EYE = 1.65;
const EYE_CROUCH = 1.05;

type Phase = 'menu' | 'playing' | 'paused' | 'dead' | 'won' | 'failed';
type PickupKind = 'ammo' | 'plate' | 'frag' | 'med';

interface Settings {
	sensitivity: number;
	fov: number;
	volume: number;
	bloom: boolean;
}

interface Particle {
	p: THREE.Vector3;
	v: THREE.Vector3;
	life: number;
	max: number;
	size: number;
	color: THREE.Color;
	grav: number;
}

interface Grenade {
	mesh: THREE.Mesh;
	vel: THREE.Vector3;
	fuse: number;
}

interface Pickup {
	kind: PickupKind;
	mesh: THREE.Group;
	pos: THREE.Vector3;
	t: number;
}

interface Tracer {
	line: THREE.Line;
	t: number;
}

export interface DeadSignalOptions {
	exitHref?: string;
	exitLabel?: string;
}

const SETTINGS_KEY = 'dead-signal-settings';

function loadSettings(): Settings {
	const base: Settings = { sensitivity: 1, fov: 78, volume: 0.8, bloom: true };
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
	} catch {
		/* storage unavailable (private mode / sandbox) — defaults are fine */
	}
	return base;
}

function saveSettings(s: Settings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
	} catch {
		/* ignore */
	}
}

class Particles {
	readonly mesh: THREE.InstancedMesh;
	private readonly list: Particle[] = [];
	private readonly max = 900;
	private readonly m4 = new THREE.Matrix4();
	private readonly q = new THREE.Quaternion();
	private readonly s = new THREE.Vector3();

	constructor(scene: THREE.Scene) {
		this.mesh = new THREE.InstancedMesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshBasicMaterial({ toneMapped: false }),
			this.max,
		);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.setColorAt(0, new THREE.Color());
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		scene.add(this.mesh);
	}

	spawn(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: number | THREE.Color, grav = 9): void {
		if (this.list.length >= this.max) this.list.shift();
		this.list.push({ p: p.clone(), v, life, max: life, size, color: new THREE.Color(color), grav });
	}

	burst(at: THREE.Vector3, color: number, count: number, speed = 6, size = 0.06, grav = 9, life = 0.5): void {
		for (let i = 0; i < count; i++) {
			const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
			this.spawn(at, v, life * rand(0.5, 1.2), size * rand(0.6, 1.4), color, grav);
		}
	}

	update(dt: number): void {
		let n = 0;
		for (let i = this.list.length - 1; i >= 0; i--) {
			const pt = this.list[i];
			pt.life -= dt;
			if (pt.life <= 0) {
				this.list.splice(i, 1);
				continue;
			}
			pt.v.y -= pt.grav * dt;
			pt.p.addScaledVector(pt.v, dt);
			if (pt.p.y < 0.02) {
				pt.p.y = 0.02;
				pt.v.multiplyScalar(0.4);
				pt.v.y = Math.abs(pt.v.y) * 0.3;
			}
		}
		for (const pt of this.list) {
			const k = pt.size * Math.min(1, (pt.life / pt.max) * 2);
			this.s.set(k, k, k);
			this.m4.compose(pt.p, this.q, this.s);
			this.mesh.setMatrixAt(n, this.m4);
			this.mesh.setColorAt(n, pt.color);
			n++;
		}
		this.mesh.count = n;
		this.mesh.instanceMatrix.needsUpdate = true;
		if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
	}

	clear(): void {
		this.list.length = 0;
		this.mesh.count = 0;
	}
}

class Game implements EnemyHost {
	// three
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera: THREE.PerspectiveCamera;
	private readonly composer: EffectComposer;
	private readonly bloom: UnrealBloomPass;
	private readonly moon: THREE.DirectionalLight;
	private readonly flashLight = new THREE.PointLight(0xffb070, 0, 14, 1.6);
	private readonly rain: THREE.LineSegments;
	private readonly rainPos: Float32Array;
	private readonly vmPass: RenderPass;

	// systems
	readonly world: World;
	private readonly enemies: EnemyManager;
	private readonly vm = new Viewmodel();
	private readonly hud: Hud;
	private readonly sound = new Sound();
	private readonly particles: Particles;
	private settings = loadSettings();

	// player
	readonly playerPos = new THREE.Vector3();
	readonly playerEye = new THREE.Vector3();
	private vel = new THREE.Vector3();
	private yaw = 0;
	private pitch = 0;
	private recoilPitch = 0;
	private onGround = true;
	private crouchT = 0;
	private hp = 100;
	private armor = 50;
	private plates = 2;
	private frags = 2;
	private salvage = 0;
	private salvageGain = 0;
	private salvageGainT = 0;
	private lastHurt = -99;
	private hurtFlash = 0;
	private platingT = 0;
	private stepT = 0;
	private shake = 0;
	private bobT = 0;

	// input
	private readonly keys = new Set<string>();
	private mouseDown = false;
	private rightDown = false;
	private firePressed = false;
	private lookDX = 0;
	private lookDY = 0;
	private locked = false;
	private lockFailed = false;
	private mapOpen = false;

	// state
	private phase: Phase = 'menu';
	private time = 0;
	private missionLeft = MISSION_TIME;
	private relayState: 'idle' | 'uplinking' | 'done' = 'idle';
	private relayProgress = 0;
	private warden: Enemy | null = null;
	private huntDone = false;
	private extractState: 'locked' | 'open' | 'holding' | 'done' = 'locked';
	private extractProgress = 0;
	private spawnT = 0;
	private waveT = 0;
	private grenades: Grenade[] = [];
	private pickups: Pickup[] = [];
	private tracers: Tracer[] = [];
	private stats = { kills: 0, heads: 0, shots: 0, hits: 0 };
	private last = performance.now();
	private readonly opts: DeadSignalOptions;

	constructor(root: HTMLElement, opts: DeadSignalOptions) {
		this.opts = opts;
		root.classList.add('ds-root');
		this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.15;
		this.renderer.domElement.className = 'ds-gl';
		root.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 1400);
		this.camera.rotation.order = 'YXZ';
		this.scene.background = new THREE.Color(0x0a1019);
		this.scene.fog = new THREE.FogExp2(0x0c131c, 0.0105);

		this.buildSky();
		this.scene.add(new THREE.HemisphereLight(0x3a5078, 0x0c0c12, 1.3));
		this.moon = new THREE.DirectionalLight(0xa8bcff, 0.9);
		this.moon.castShadow = true;
		this.moon.shadow.mapSize.set(2048, 2048);
		const sc = this.moon.shadow.camera;
		sc.left = sc.bottom = -60;
		sc.right = sc.top = 60;
		sc.near = 1;
		sc.far = 300;
		this.moon.shadow.bias = -0.0004;
		this.moon.shadow.normalBias = 0.04;
		this.scene.add(this.moon, this.moon.target, this.flashLight);

		this.world = new World(this.scene);
		this.enemies = new EnemyManager(this.scene);
		this.particles = new Particles(this.scene);

		// rain
		const drops = 3500;
		this.rainPos = new Float32Array(drops * 6);
		for (let i = 0; i < drops; i++) {
			const x = rand(-40, 40);
			const y = rand(0, 40);
			const z = rand(-40, 40);
			this.rainPos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
		}
		const rg = new THREE.BufferGeometry();
		rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
		this.rain = new THREE.LineSegments(
			rg,
			new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.28, depthWrite: false }),
		);
		this.rain.frustumCulled = false;
		this.scene.add(this.rain);

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.vmPass = new RenderPass(this.vm.scene, this.vm.camera);
		this.vmPass.clear = false;
		this.vmPass.clearDepth = true;
		this.composer.addPass(this.vmPass);
		this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.75, 0.55, 0.82);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());

		this.hud = new Hud(root);
		this.hud.buildMap(this.world.rects, BOUND);
		this.applySettings();
		this.bindInput(root);
		this.resize();
		window.addEventListener('resize', () => this.resize());
		this.showMenu();
		if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __ds: Game }).__ds = this;
		requestAnimationFrame(this.frame);
	}

	// ── setup ───────────────────────────────────────────────────────────────

	private buildSky(): void {
		const sky = new THREE.Mesh(
			new THREE.SphereGeometry(1200, 32, 16),
			new THREE.ShaderMaterial({
				side: THREE.BackSide,
				depthWrite: false,
				fog: false,
				uniforms: {},
				vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
				fragmentShader:
					'varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 top = vec3(0.012,0.02,0.045); vec3 hor = vec3(0.07,0.09,0.13); vec3 glow = vec3(0.16,0.11,0.08); vec3 c = mix(hor, top, pow(h,0.45)); c += glow * pow(1.0-h, 10.0) * 0.8; gl_FragColor = vec4(c,1.0); }',
			}),
		);
		this.scene.add(sky);
		const starPos: number[] = [];
		for (let i = 0; i < 1500; i++) {
			const v = new THREE.Vector3(rand(-1, 1), rand(0.15, 1), rand(-1, 1)).normalize().multiplyScalar(1100);
			starPos.push(v.x, v.y, v.z);
		}
		const sg = new THREE.BufferGeometry();
		sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
		const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 }));
		this.scene.add(stars);
		const moon = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: glowTexture('rgba(220,230,255,1)', 'rgba(150,170,255,0)'), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }),
		);
		moon.position.set(-500, 520, -700);
		moon.scale.setScalar(140);
		this.scene.add(moon);
	}

	private applySettings(): void {
		this.camera.fov = this.settings.fov;
		this.camera.updateProjectionMatrix();
		this.sound.setVolume(this.settings.volume);
		this.bloom.enabled = this.settings.bloom;
		saveSettings(this.settings);
	}

	private resize(): void {
		const w = window.innerWidth;
		const h = window.innerHeight;
		this.renderer.setSize(w, h, false);
		this.composer.setSize(w, h);
		this.bloom.resolution.set(w / 2, h / 2);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.vm.setAspect(w / h);
	}

	private bindInput(root: HTMLElement): void {
		const canvas = this.renderer.domElement;
		document.addEventListener('keydown', (e) => {
			if (this.phase !== 'playing') return;
			if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
			if (e.repeat) return;
			this.keys.add(e.code);
			this.onKey(e.code);
		});
		document.addEventListener('keyup', (e) => {
			this.keys.delete(e.code);
			if (e.code === 'KeyM') this.setMap(false);
		});
		canvas.addEventListener('mousedown', (e) => {
			if (this.phase !== 'playing') return;
			if (!this.locked && !this.lockFailed) {
				this.requestLock();
				return;
			}
			if (e.button === 0) {
				this.mouseDown = true;
				this.firePressed = true;
			}
			if (e.button === 2) this.rightDown = true;
		});
		document.addEventListener('mouseup', (e) => {
			if (e.button === 0) this.mouseDown = false;
			if (e.button === 2) this.rightDown = false;
		});
		root.addEventListener('contextmenu', (e) => e.preventDefault());
		document.addEventListener('mousemove', (e) => {
			if (this.phase !== 'playing') return;
			if (!this.locked && !this.lockFailed) return;
			// Chrome can report one huge bogus delta right after pointer lock engages.
			if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
			const s =0.0022 * this.settings.sensitivity * (1 - this.vm.adsT * 0.45);
			this.yaw -= e.movementX * s;
			this.pitch = clamp(this.pitch - e.movementY * s, -1.5, 1.5);
			this.lookDX += e.movementX;
			this.lookDY += e.movementY;
		});
		document.addEventListener('pointerlockchange', () => {
			this.locked = document.pointerLockElement === canvas;
			if (!this.locked && this.phase === 'playing' && !this.lockFailed) this.pause();
		});
		document.addEventListener('pointerlockerror', () => {
			// Sandboxed iframes can refuse pointer lock; fall back to free mouse look.
			this.lockFailed = true;
		});
		document.addEventListener('visibilitychange', () => {
			if (document.hidden && this.phase === 'playing') this.pause();
		});
		window.addEventListener('blur', () => {
			this.keys.clear();
			this.mouseDown = this.rightDown = false;
		});
		// Without pointer lock the browser doesn't consume Esc, so pause on it directly.
		document.addEventListener('keydown', (e) => {
			if (e.code === 'Escape' && this.phase === 'playing' && !this.locked) this.pause();
		});
	}

	private requestLock(): void {
		const canvas = this.renderer.domElement;
		try {
			const r = canvas.requestPointerLock() as unknown;
			if (r instanceof Promise) r.catch(() => (this.lockFailed = true));
		} catch {
			this.lockFailed = true;
		}
	}

	private onKey(code: string): void {
		switch (code) {
			case 'KeyR':
				if (this.vm.startReload()) this.sound.reload();
				break;
			case 'Digit1':
				this.swap('rifle');
				break;
			case 'Digit2':
				this.swap('pistol');
				break;
			case 'KeyQ':
				this.swap(this.vm.current === 'rifle' ? 'pistol' : 'rifle');
				break;
			case 'KeyG':
				this.throwGrenade();
				break;
			case 'KeyF':
				if (this.plates > 0 && this.armor < 100 && this.platingT <= 0) this.platingT = 1.1;
				break;
			case 'KeyE':
				this.interact();
				break;
			case 'KeyM':
				this.setMap(true);
				break;
			case 'KeyP':
				this.pause();
				break;
			case 'Space':
				if (this.onGround && this.alive) {
					this.vel.y = 5.4;
					this.onGround = false;
				}
				break;
		}
	}

	private swap(id: WeaponId): void {
		if (this.vm.switchTo(id)) this.sound.swap();
	}

	private setMap(on: boolean): void {
		this.mapOpen = on;
		this.hud.toggleMap(on);
	}

	// ── menus ───────────────────────────────────────────────────────────────

	private bindButtons(o: HTMLElement, map: Record<string, () => void>): void {
		o.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
			b.addEventListener('click', (e) => {
				e.stopPropagation();
				this.sound.unlock();
				this.sound.ui();
				map[b.dataset.act ?? '']?.();
			});
		});
	}

	private showMenu(): void {
		this.phase = 'menu';
		this.hud.show(false);
		this.sound.setAmbience(0.5);
		const coarse = window.matchMedia('(pointer: coarse)').matches;
		const back = this.opts.exitHref
			? `<a class="ds-back" href="${this.opts.exitHref}">← ${this.opts.exitLabel ?? 'BACK'}</a>`
			: '';
		const o = this.hud.overlay(`
			<h1>DEAD <span>SIGNAL</span></h1>
			<h2>EXCLUSION ZONE · OPERATION NIGHTFALL</h2>
			<p>The city went dark six days ago. Something is still broadcasting from inside the quarantine line.
			Reactivate the uplink relay at Kessler Depot, hunt the Warden-9 unit stalking the Halcyon reactor,
			then reach extraction at Northgate before the window closes.</p>
			<button class="ds-btn primary" data-act="deploy">Deploy</button>
			<button class="ds-btn" data-act="settings">Settings</button>
			<button class="ds-btn" data-act="controls">Controls</button>
			${coarse ? '<div class="ds-touch-note">KEYBOARD &amp; MOUSE REQUIRED</div>' : ''}
		`);
		if (back) o.insertAdjacentHTML('beforeend', back);
		this.bindButtons(o, {
			deploy: () => this.startMission(),
			settings: () => this.showSettings(() => this.showMenu()),
			controls: () => this.showControls(),
		});
	}

	private showControls(): void {
		const rows = [
			['WASD', 'Move'],
			['Mouse', 'Look'],
			['Shift', 'Sprint'],
			['C', 'Crouch (hold)'],
			['Space', 'Jump'],
			['LMB / RMB', 'Fire / Aim down sights'],
			['R', 'Reload'],
			['1 · 2 · Q', 'Rifle · Pistol · Swap'],
			['E', 'Interact'],
			['G', 'Frag grenade'],
			['F', 'Apply armor plate'],
			['M', 'Tactical map (hold)'],
			['Esc', 'Pause'],
		];
		const o = this.hud.overlay(`
			<h3>CONTROLS</h3>
			<div class="ds-stats">${rows.map(([k, v]) => `<span>${v}</span><b>${k}</b>`).join('')}</div>
			<button class="ds-btn" data-act="back">Back</button>`);
		this.bindButtons(o, { back: () => this.showMenu() });
	}

	private showSettings(back: () => void): void {
		const s = this.settings;
		const o = this.hud.overlay(`
			<h3>SETTINGS</h3>
			<label class="ds-set">SENSITIVITY<input type="range" min="0.3" max="3" step="0.05" value="${s.sensitivity}" data-k="sensitivity"><output>${s.sensitivity.toFixed(2)}</output></label>
			<label class="ds-set">FIELD OF VIEW<input type="range" min="60" max="105" step="1" value="${s.fov}" data-k="fov"><output>${s.fov}</output></label>
			<label class="ds-set">VOLUME<input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"><output>${Math.round(s.volume * 100)}</output></label>
			<label class="ds-set">BLOOM<input type="range" min="0" max="1" step="1" value="${s.bloom ? 1 : 0}" data-k="bloom"><output>${s.bloom ? 'ON' : 'OFF'}</output></label>
			<button class="ds-btn" data-act="back">Back</button>`);
		o.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
			inp.addEventListener('input', () => {
				const v = Number(inp.value);
				const out = inp.nextElementSibling as HTMLOutputElement;
				switch (inp.dataset.k) {
					case 'sensitivity':
						s.sensitivity = v;
						out.textContent = v.toFixed(2);
						break;
					case 'fov':
						s.fov = v;
						out.textContent = String(v);
						break;
					case 'volume':
						s.volume = v;
						out.textContent = String(Math.round(v * 100));
						break;
					case 'bloom':
						s.bloom = v === 1;
						out.textContent = s.bloom ? 'ON' : 'OFF';
						break;
				}
				this.applySettings();
			});
		});
		this.bindButtons(o, { back });
	}

	private pause(): void {
		if (this.phase !== 'playing') return;
		this.phase = 'paused';
		this.keys.clear();
		this.mouseDown = this.rightDown = false;
		this.setMap(false);
		if (document.pointerLockElement) document.exitPointerLock();
		this.showPause();
	}

	private showPause(): void {
		const o = this.hud.overlay(`
			<h3>PAUSED</h3>
			<button class="ds-btn primary" data-act="resume">Resume</button>
			<button class="ds-btn" data-act="settings">Settings</button>
			<button class="ds-btn" data-act="restart">Restart Mission</button>
			<button class="ds-btn" data-act="menu">Main Menu</button>`);
		o.style.background = 'rgba(5,7,10,.55)';
		this.bindButtons(o, {
			resume: () => this.resume(),
			settings: () => this.showSettings(() => this.showPause()),
			restart: () => this.startMission(),
			menu: () => {
				this.clearMission();
				this.showMenu();
			},
		});
	}

	private resume(): void {
		this.hud.clearOverlay();
		this.phase = 'playing';
		this.last = performance.now();
		this.requestLock();
	}

	private endScreen(kind: 'dead' | 'won' | 'failed'): void {
		this.phase = kind;
		this.setMap(false);
		if (document.pointerLockElement) document.exitPointerLock();
		const acc = this.stats.shots ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
		const title = kind === 'won' ? 'EXTRACTED' : kind === 'dead' ? 'K.I.A.' : 'SIGNAL LOST';
		const sub =
			kind === 'won'
				? 'OPERATION NIGHTFALL · SUCCESS'
				: kind === 'dead'
					? 'OPERATOR DOWN IN ' + this.world.district(this.playerPos.x, this.playerPos.z)
					: 'THE EXTRACTION WINDOW CLOSED';
		this.sound.objective(kind === 'won');
		setTimeout(() => {
			if (this.phase !== kind) return;
			this.hud.show(false);
			const o = this.hud.overlay(`
				<h1>${kind === 'won' ? title : `<span>${title}</span>`}</h1>
				<h2>${sub}</h2>
				<div class="ds-stats">
					<span>TIME</span><b>${formatClock(MISSION_TIME - this.missionLeft)}</b>
					<span>KILLS</span><b>${this.stats.kills}</b>
					<span>HEADSHOTS</span><b>${this.stats.heads}</b>
					<span>ACCURACY</span><b>${acc}%</b>
					<span>SALVAGE</span><b>◆ ${this.salvage}</b>
					<span>CONTRACTS</span><b>${(this.relayState === 'done' ? 1 : 0) + (this.huntDone ? 1 : 0)} / 2</b>
				</div>
				<button class="ds-btn primary" data-act="restart">${kind === 'won' ? 'Deploy Again' : 'Restart Mission'}</button>
				<button class="ds-btn" data-act="menu">Main Menu</button>`);
			this.bindButtons(o, {
				restart: () => this.startMission(),
				menu: () => {
					this.clearMission();
					this.showMenu();
				},
			});
		}, 1600);
	}

	// ── mission lifecycle ───────────────────────────────────────────────────

	private clearMission(): void {
		this.enemies.clear();
		for (const g of this.grenades) this.scene.remove(g.mesh);
		for (const p of this.pickups) this.scene.remove(p.mesh);
		for (const t of this.tracers) this.scene.remove(t.line);
		this.grenades = [];
		this.pickups = [];
		this.tracers = [];
		this.particles.clear();
		this.warden = null;
	}

	private startMission(): void {
		this.clearMission();
		this.hud.clearOverlay();
		this.hud.show(true);
		this.sound.unlock();
		this.sound.setAmbience(0.9);
		this.playerPos.copy(this.world.spawn);
		this.vel.set(0, 0, 0);
		this.yaw = 0;
		this.pitch = 0;
		this.hp = 100;
		this.armor = 50;
		this.plates = 2;
		this.frags = 2;
		this.salvage = 0;
		this.missionLeft = MISSION_TIME;
		this.relayState = 'idle';
		this.relayProgress = 0;
		this.huntDone = false;
		this.extractState = 'locked';
		this.extractProgress = 0;
		this.stats = { kills: 0, heads: 0, shots: 0, hits: 0 };
		this.platingT = 0;
		this.lastHurt = -99;
		this.world.setRelayActive(false);
		this.world.setExtractionLive(false);
		for (const s of this.world.supplies) {
			s.used = false;
			s.strip.emissive.setHex(0x7dff9a);
		}
		this.vm.reset();

		// population
		const nodes = this.world.streetNodes.filter((n) => n.distanceTo(this.world.spawn) > 70);
		for (let i = 0; i < 30; i++) {
			const n = pick(nodes);
			this.enemies.spawn(this.randomKind(0.2), this.jitter(n, 6));
		}
		const r = this.world.reactorPos;
		this.warden = this.enemies.spawn('warden', new THREE.Vector3(r.x + 12, 0, r.z - 12));
		for (let i = 0; i < 4; i++) this.enemies.spawn('husk', new THREE.Vector3(r.x + rand(-2, 16), 0, r.z + rand(-16, -10)));
		for (let i = 0; i < 3; i++) this.enemies.spawn('gunner', new THREE.Vector3(r.x + rand(10, 16), 0, r.z + rand(10, 16)));

		this.phase = 'playing';
		this.last = performance.now();
		this.hud.showBanner('OPERATION NIGHTFALL', 'DEPLOYED', 'CHECKPOINT 3 · EXCLUSION ZONE', 3.5);
		this.requestLock();
	}

	private randomKind(gunnerBias: number): EnemyKind {
		const r = Math.random();
		if (r < gunnerBias) return 'gunner';
		if (r < gunnerBias + 0.28) return 'stalker';
		return 'husk';
	}

	private jitter(v: THREE.Vector3, r: number): THREE.Vector3 {
		return new THREE.Vector3(v.x + rand(-r, r), 0, v.z + rand(-r, r));
	}

	// ── EnemyHost ───────────────────────────────────────────────────────────

	get alive(): boolean {
		return this.hp > 0;
	}
	playerAlive(): boolean {
		return this.hp > 0 && this.phase === 'playing';
	}

	damagePlayer(amount: number, from: THREE.Vector3): void {
		if (!this.playerAlive()) return;
		let dmg = amount;
		const absorbed = Math.min(this.armor, dmg * 0.8);
		this.armor -= absorbed;
		dmg -= absorbed;
		this.hp -= dmg;
		this.lastHurt = this.time;
		this.hurtFlash = Math.min(1, this.hurtFlash + 0.35 + amount / 60);
		this.shake = Math.min(1, this.shake + 0.25);
		this.platingT = 0;
		const bearing = Math.atan2(from.x - this.playerPos.x, from.z - this.playerPos.z);
		const fwd = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
		this.hud.damageFrom(-wrapAngle(bearing - fwd));
		this.sound.hurt();
		if (this.hp <= 0) {
			this.hp = 0;
			this.endScreen('dead');
		}
	}

	onEnemyKilled(e: Enemy, headshot: boolean): void {
		this.stats.kills++;
		if (headshot) this.stats.heads++;
		const reward = e.spec.reward * (headshot ? 2 : 1);
		this.salvage += reward;
		this.salvageGain += reward;
		this.salvageGainT = 2;
		this.particles.burst(e.chest, 0x2a3a10, 18, 5, 0.09, 12, 0.8);
		if (e.kind === 'warden') {
			this.huntDone = true;
			this.hud.showBanner('CONTRACT COMPLETE', 'WARDEN-9 DOWN', '+500 SALVAGE', 4);
			this.sound.objective(true);
			for (let k = 0; k < 4; k++) this.dropPickup(pick<PickupKind>(['ammo', 'plate', 'frag', 'med']), e.pos);
			this.checkExtraction();
			return;
		}
		const r = Math.random();
		if (r < 0.28) this.dropPickup('ammo', e.pos);
		else if (r < 0.36) this.dropPickup('plate', e.pos);
		else if (r < 0.42) this.dropPickup('frag', e.pos);
		else if (r < 0.52) this.dropPickup('med', e.pos);
	}

	onBossSummon(pos: THREE.Vector3): void {
		for (let k = 0; k < 3; k++) this.enemies.spawn('husk', this.jitter(pos, 6), true);
		this.sound.enemy('roar', pos.distanceTo(this.playerPos), 0);
	}

	sparks(pos: THREE.Vector3, color: number, count: number, speed = 6): void {
		this.particles.burst(pos, color, count, speed);
	}

	sfx(name: 'groan' | 'bolt' | 'swipe' | 'roar', pos: THREE.Vector3): void {
		const d = pos.distanceTo(this.playerPos);
		const bearing = Math.atan2(pos.x - this.playerPos.x, pos.z - this.playerPos.z);
		const fwd = Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw));
		this.sound.enemy(name, d, -Math.sin(wrapAngle(bearing - fwd)));
	}

	// ── gameplay ────────────────────────────────────────────────────────────

	private forward(out = new THREE.Vector3()): THREE.Vector3 {
		return out.set(0, 0, -1).applyEuler(this.camera.rotation);
	}

	private fire(): void {
		const sprint = this.isSprinting();
		const res = this.vm.tryFire(sprint);
		if (res === 'empty') {
			this.sound.dry();
			if (this.vm.startReload()) this.sound.reload();
			return;
		}
		if (res !== 'fired') return;
		const spec = this.vm.gun.spec;
		this.stats.shots++;
		if (spec.id === 'rifle') this.sound.rifle();
		else this.sound.pistol();
		this.enemies.noise(this.playerPos, 70);

		const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
		const spread =
			THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.vm.adsT) * (moving ? 1.7 : 1) * (this.crouchT > 0.5 ? 0.65 : 1) * (this.onGround ? 1 : 2.5);
		const dir = this.forward();
		const right = new THREE.Vector3(1, 0, 0).applyEuler(this.camera.rotation);
		const up = new THREE.Vector3(0, 1, 0).applyEuler(this.camera.rotation);
		const a = Math.random() * Math.PI * 2;
		const r = Math.sqrt(Math.random()) * spread;
		dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

		const origin = this.camera.position.clone();
		const wallDist = this.world.raycast(origin, dir, 300);
		const hit = this.enemies.raycast(origin, dir, wallDist);
		const end = origin.clone().addScaledVector(dir, hit ? hit.dist : Math.min(wallDist, 300));
		if (hit) {
			this.stats.hits++;
			const dmg = spec.damage * (hit.head ? spec.headMult : 1);
			const killed = hit.enemy.hurt(dmg, this.playerPos);
			this.particles.burst(end, hit.head ? 0x9aff4a : 0x3a4a14, hit.head ? 12 : 7, 4, 0.06, 9, 0.5);
			this.hud.hitmarker(killed);
			this.sound.hitmarker(killed);
			if (killed) this.onEnemyKilled(hit.enemy, hit.head);
		} else if (wallDist < 300) {
			this.particles.burst(end.clone().addScaledVector(dir, -0.05), 0xffc070, 6, 5, 0.03, 12, 0.3);
			this.particles.burst(end.clone().addScaledVector(dir, -0.05), 0x55504a, 4, 1.5, 0.08, 2, 0.6);
		}

		// tracer from the visual muzzle
		const muzzle = origin.clone().addScaledVector(right, 0.18 * (1 - this.vm.adsT)).addScaledVector(up, -0.12).addScaledVector(dir, 0.8);
		if (Math.random() < 0.6) {
			const geo = new THREE.BufferGeometry().setFromPoints([muzzle, end]);
			const line = new THREE.Line(
				geo,
				new THREE.LineBasicMaterial({ color: 0xffd7a0, transparent: true, opacity: 0.8, toneMapped: false, blending: THREE.AdditiveBlending }),
			);
			this.scene.add(line);
			this.tracers.push({ line, t: 0.06 });
		}

		this.recoilPitch += spec.recoil * (1 - this.vm.adsT * 0.4);
		this.yaw += rand(-1, 1) * spec.recoil * 0.3;
		this.shake = Math.min(1, this.shake + 0.04);
	}

	private throwGrenade(): void {
		if (this.frags <= 0 || !this.alive) return;
		this.frags--;
		this.sound.pin();
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(0.09, 10, 8),
			new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.6, metalness: 0.3 }),
		);
		const dir = this.forward();
		mesh.position.copy(this.camera.position).addScaledVector(dir, 0.5);
		mesh.castShadow = true;
		this.scene.add(mesh);
		const vel = dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(this.vel.clone().setY(0));
		this.grenades.push({ mesh, vel, fuse: 2.3 });
	}

	private explode(at: THREE.Vector3): void {
		this.particles.burst(at, 0xffb050, 50, 12, 0.14, 6, 0.6);
		this.particles.burst(at, 0xff6a20, 30, 8, 0.2, 2, 0.9);
		this.particles.burst(at, 0x2a2826, 30, 4, 0.35, -1, 1.6);
		this.flashLight.position.copy(at).setY(at.y + 1);
		this.flashLight.intensity = 400;
		const d = at.distanceTo(this.playerPos);
		this.sound.explosion(d);
		this.shake = Math.min(1.5, this.shake + Math.max(0, 1.2 - d / 25));
		this.enemies.noise(at, 90);
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const ed = e.chest.distanceTo(at);
			if (ed < 8) {
				const killed = e.hurt(180 * (1 - ed / 8) + 20, at);
				if (killed) this.onEnemyKilled(e, false);
				else this.hud.hitmarker(false);
			}
		}
		if (d < 6) this.damagePlayer(70 * (1 - d / 6), at);
	}

	private dropPickup(kind: PickupKind, at: THREE.Vector3): void {
		const colors: Record<PickupKind, number> = { ammo: 0xe3c15a, plate: 0x5ab8ff, frag: 0x9aff6a, med: 0xff5a5a };
		const g = new THREE.Group();
		const box = new THREE.Mesh(
			new THREE.BoxGeometry(0.34, 0.22, 0.34),
			new THREE.MeshStandardMaterial({ color: 0x1b1d20, emissive: colors[kind], emissiveIntensity: 0.25, roughness: 0.6 }),
		);
		const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.36), new THREE.MeshBasicMaterial({ color: colors[kind], toneMapped: false }));
		g.add(box, band);
		const pos = at.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6)));
		g.position.copy(pos);
		this.scene.add(g);
		this.pickups.push({ kind, mesh: g, pos, t: 45 });
	}

	private collect(p: Pickup): boolean {
		switch (p.kind) {
			case 'ammo': {
				const r = this.vm.guns.rifle;
				const pi = this.vm.guns.pistol;
				if (r.reserve >= WEAPONS.rifle.reserveMax && pi.reserve >= WEAPONS.pistol.reserveMax) return false;
				r.reserve = Math.min(WEAPONS.rifle.reserveMax, r.reserve + 45);
				pi.reserve = Math.min(WEAPONS.pistol.reserveMax, pi.reserve + 12);
				this.hud.showToast('+ AMMO');
				return true;
			}
			case 'plate':
				if (this.plates >= 3) return false;
				this.plates++;
				this.hud.showToast('+ ARMOR PLATE');
				return true;
			case 'frag':
				if (this.frags >= 3) return false;
				this.frags++;
				this.hud.showToast('+ FRAG');
				return true;
			case 'med':
				if (this.hp >= 100) return false;
				this.hp = Math.min(100, this.hp + 40);
				this.hud.showToast('+ MED KIT');
				return true;
		}
	}

	private interact(): void {
		const p = this.playerPos;
		if (this.relayState === 'idle' && p.distanceTo(this.world.relayPos) < 5) {
			this.relayState = 'uplinking';
			this.world.setRelayActive(true);
			this.hud.showBanner('DEFEND UPLINK RELAY', 'UPLINK ONLINE', 'HOLD THE DEPOT UNTIL TRANSFER COMPLETES', 3.5);
			this.sound.alarm();
			this.enemies.noise(this.world.relayPos, 120);
			this.waveT = 2;
			return;
		}
		for (const s of this.world.supplies) {
			if (!s.used && p.distanceTo(s.pos) < 2.6) {
				s.used = true;
				s.strip.emissive.setHex(0x331010);
				this.vm.guns.rifle.reserve = WEAPONS.rifle.reserveMax;
				this.vm.guns.pistol.reserve = WEAPONS.pistol.reserveMax;
				this.plates = Math.min(3, this.plates + 1);
				this.frags = Math.min(3, this.frags + 1);
				this.hud.showToast('RESUPPLIED · AMMO · PLATE · FRAG');
				this.sound.pickup();
				return;
			}
		}
	}

	private checkExtraction(): void {
		if (this.extractState === 'locked' && this.relayState === 'done' && this.huntDone) {
			this.extractState = 'open';
			this.world.setExtractionLive(true);
			setTimeout(() => this.hud.showBanner('ALL CONTRACTS COMPLETE', 'EXTRACTION UNLOCKED', 'REACH THE NORTHGATE HELIPAD', 4), 2500);
		}
	}

	private isSprinting(): boolean {
		return this.keys.has('ShiftLeft') && this.keys.has('KeyW') && !this.rightDown && this.crouchT < 0.5 && !this.vm.busy;
	}

	private spawnNear(center: THREE.Vector3, minD: number, maxD: number, count: number, gunnerBias: number): void {
		const nodes = this.world.streetNodes.filter((n) => {
			const d = n.distanceTo(center);
			return d > minD && d < maxD && n.distanceTo(this.playerPos) > 25;
		});
		if (!nodes.length) return;
		for (let i = 0; i < count; i++) this.enemies.spawn(this.randomKind(gunnerBias), this.jitter(pick(nodes), 5), true);
	}

	private updatePlayer(dt: number): void {
		const k = this.keys;
		const crouch = k.has('KeyC') || k.has('ControlLeft');
		this.crouchT = damp(this.crouchT, crouch ? 1 : 0, 12, dt);
		const sprint = this.isSprinting();
		const speed = crouch ? 2.4 : sprint ? 7.8 : this.rightDown ? 3.2 : 4.8;
		const fx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
		const fz = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
		const wish = new THREE.Vector3(fx, 0, fz);
		if (wish.lengthSq() > 0) wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(speed);
		const accel = this.onGround ? 12 : 2;
		this.vel.x = damp(this.vel.x, wish.x, accel, dt);
		this.vel.z = damp(this.vel.z, wish.z, accel, dt);
		this.vel.y -= 16 * dt;
		this.playerPos.addScaledVector(this.vel, dt);
		const ground = this.world.groundAt(this.playerPos.x, this.playerPos.z);
		if (this.playerPos.y <= ground) {
			if (!this.onGround && this.vel.y < -6) this.sound.step();
			this.playerPos.y = ground;
			this.vel.y = 0;
			this.onGround = true;
		} else if (this.playerPos.y - ground > 0.2) this.onGround = false;
		else this.playerPos.y = damp(this.playerPos.y, ground, 20, dt);
		this.world.resolve(this.playerPos, 0.4);
		this.playerPos.x = clamp(this.playerPos.x, -BOUND + 1, BOUND - 1);
		this.playerPos.z = clamp(this.playerPos.z, -BOUND + 1, BOUND - 1);

		const hs = Math.hypot(this.vel.x, this.vel.z);
		if (this.onGround && hs > 1) {
			this.bobT += dt * hs * 1.8;
			this.stepT -= dt * hs;
			if (this.stepT <= 0) {
				this.stepT = 2.6;
				this.sound.step();
			}
		}

		// health regen after a lull
		if (this.time - this.lastHurt > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 9 * dt);
		if (this.platingT > 0) {
			this.platingT -= dt;
			if (this.platingT <= 0 && this.plates > 0) {
				this.plates--;
				this.armor = Math.min(100, this.armor + 50);
				this.sound.plate();
			}
		}
	}

	private updateObjectives(dt: number): void {
		const p = this.playerPos;
		if (this.relayState === 'uplinking') {
			const near = p.distanceTo(this.world.relayPos) < 26;
			if (near) this.relayProgress = Math.min(1, this.relayProgress + dt / UPLINK_TIME);
			this.waveT -= dt;
			if (this.waveT <= 0) {
				this.waveT = rand(3.5, 5.5);
				if (this.enemies.alive < 55) this.spawnNear(this.world.relayPos, 40, 85, 2 + Math.floor(Math.random() * 2), 0.18);
			}
			if (this.relayProgress >= 1) {
				this.relayState = 'done';
				this.world.setRelayActive(false);
				this.salvage += 300;
				this.hud.showBanner('CONTRACT COMPLETE', 'UPLINK SECURED', '+300 SALVAGE', 4);
				this.sound.objective(true);
				this.checkExtraction();
			}
		}
		if (this.extractState === 'open' && p.distanceTo(this.world.extractionPos) < 11) {
			this.extractState = 'holding';
			this.hud.showBanner('EXTRACTION', 'HOLD THE LZ', 'DUSTOFF INBOUND · 40 SECONDS', 3.5);
			this.sound.alarm();
			this.waveT = 1;
		}
		if (this.extractState === 'holding') {
			const near = p.distanceTo(this.world.extractionPos) < 15;
			if (near) this.extractProgress = Math.min(1, this.extractProgress + dt / EXTRACT_TIME);
			this.waveT -= dt;
			if (this.waveT <= 0) {
				this.waveT = rand(2.5, 4);
				if (this.enemies.alive < 60) this.spawnNear(this.world.extractionPos, 40, 90, 2 + Math.floor(Math.random() * 3), 0.25);
			}
			if (Math.random() < dt * 30) {
				const f = this.world.extractionPos.clone().add(new THREE.Vector3(8, 0.3, 8));
				this.particles.spawn(f, new THREE.Vector3(rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3)), 2.5, 0.3, 0xff3a2a, -0.2);
			}
			if (this.extractProgress >= 1) {
				this.extractState = 'done';
				this.salvage += 250;
				this.endScreen('won');
			}
		}

		// ambient population top-up
		this.spawnT -= dt;
		if (this.spawnT <= 0) {
			this.spawnT = 4;
			if (this.enemies.alive < 26) this.spawnNear(this.playerPos, 70, 150, 1, 0.2);
		}

		this.missionLeft -= dt;
		if (this.missionLeft <= 0) {
			this.missionLeft = 0;
			this.endScreen('failed');
		}
	}

	private updateWorldObjects(dt: number): void {
		for (let i = this.grenades.length - 1; i >= 0; i--) {
			const g = this.grenades[i];
			g.fuse -= dt;
			g.vel.y -= 16 * dt;
			const before = g.mesh.position.clone();
			g.mesh.position.addScaledVector(g.vel, dt);
			const p = g.mesh.position;
			if (p.y < 0.09) {
				p.y = 0.09;
				g.vel.y = Math.abs(g.vel.y) * 0.35;
				g.vel.x *= 0.7;
				g.vel.z *= 0.7;
			}
			const pre = p.clone();
			if (this.world.resolve(p, 0.1)) {
				const push = p.clone().sub(pre);
				if (Math.abs(push.x) > Math.abs(push.z)) g.vel.x *= -0.45;
				else g.vel.z *= -0.45;
			}
			if (p.distanceTo(before) > 0) g.mesh.rotation.x += dt * 10;
			if (g.fuse <= 0) {
				this.scene.remove(g.mesh);
				this.grenades.splice(i, 1);
				this.explode(p.clone());
			}
		}
		for (let i = this.pickups.length - 1; i >= 0; i--) {
			const pk = this.pickups[i];
			pk.t -= dt;
			pk.mesh.rotation.y += dt * 1.5;
			pk.mesh.position.y = pk.pos.y + 0.25 + Math.sin(this.time * 3 + i) * 0.06;
			const near = Math.hypot(pk.pos.x - this.playerPos.x, pk.pos.z - this.playerPos.z) < 1.5;
			if ((near && this.collect(pk)) || pk.t <= 0) {
				if (near) this.sound.pickup();
				this.scene.remove(pk.mesh);
				this.pickups.splice(i, 1);
			}
		}
		for (let i = this.tracers.length - 1; i >= 0; i--) {
			const t = this.tracers[i];
			t.t -= dt;
			(t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.t / 0.06) * 0.8;
			if (t.t <= 0) {
				this.scene.remove(t.line);
				t.line.geometry.dispose();
				(t.line.material as THREE.Material).dispose();
				this.tracers.splice(i, 1);
			}
		}
	}

	private updateRain(dt: number): void {
		const c = this.camera.position;
		const a = this.rainPos;
		for (let i = 0; i < a.length; i += 6) {
			let y = a[i + 1] - 26 * dt;
			let x = a[i];
			let z = a[i + 2];
			if (y < 0 || Math.abs(x - c.x) > 40 || Math.abs(z - c.z) > 40) {
				x = c.x + rand(-40, 40);
				z = c.z + rand(-40, 40);
				y = y < 0 ? c.y + rand(20, 30) : c.y + rand(-5, 30);
			}
			a[i] = x;
			a[i + 1] = y;
			a[i + 2] = z;
			a[i + 3] = x + 0.05;
			a[i + 4] = y - 0.7;
			a[i + 5] = z;
		}
		this.rain.geometry.attributes.position.needsUpdate = true;
	}

	private updateHud(dt: number): void {
		const g = this.vm.gun;
		const status = this.vm.reloadT > 0 ? 'RELOADING' : g.ammo === 0 ? (g.reserve ? 'RELOAD [R]' : 'NO AMMO') : this.platingT > 0 ? 'PLATING' : '';
		this.hud.setWeapon(g.spec.name, g.ammo, g.spec.mag, g.reserve, status);
		this.salvageGainT -= dt;
		if (this.salvageGainT <= 0) this.salvageGain = 0;
		this.hud.setVitals(this.hp, this.armor, this.salvage, this.plates, this.frags, this.salvageGain);
		this.hud.setClock(formatClock(this.missionLeft), this.missionLeft < 60);

		const relayDesc =
			this.relayState === 'idle'
				? 'Activate the relay at Kessler Depot [E]'
				: this.relayState === 'uplinking'
					? this.playerPos.distanceTo(this.world.relayPos) < 26
						? `Uplink transfer ${Math.floor(this.relayProgress * 100)}% · hold the depot`
						: 'RETURN TO THE RELAY — transfer paused'
					: 'Uplink secured';
		const objs: ObjectiveView[] = [
			{
				title: 'DEFEND UPLINK RELAY',
				desc: relayDesc,
				state: this.relayState === 'done' ? 'done' : this.relayState === 'uplinking' ? 'active' : 'contract',
				progress: this.relayState === 'uplinking' ? this.relayProgress : undefined,
			},
			{
				title: 'HUNT: WARDEN-9',
				desc: this.huntDone ? 'Target eliminated' : this.warden?.alerted ? 'Target engaged — put it down' : 'Last seen near the Halcyon reactor',
				state: this.huntDone ? 'done' : this.warden?.alerted ? 'active' : 'contract',
			},
			{
				title: 'EXTRACTION',
				desc:
					this.extractState === 'locked'
						? 'Complete both contracts to unlock'
						: this.extractState === 'open'
							? 'Reach the Northgate helipad'
							: this.playerPos.distanceTo(this.world.extractionPos) < 15
								? `Hold the LZ · ${Math.ceil((1 - this.extractProgress) * EXTRACT_TIME)}s`
								: 'RETURN TO THE LZ',
				state: this.extractState === 'locked' ? 'locked' : this.extractState === 'done' ? 'done' : 'active',
				progress: this.extractState === 'holding' ? this.extractProgress : undefined,
			},
		];
		this.hud.setObjectives(objs);

		// threat: alerted hostiles close by
		let threat = 0;
		const dots: { x: number; z: number; boss: boolean }[] = [];
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const d = e.pos.distanceTo(this.playerPos);
			if (d < 45 && e.alerted) threat++;
			if (d < 90 && (e.alerted || this.mapOpen)) dots.push({ x: e.pos.x, z: e.pos.z, boss: e.kind === 'warden' });
		}
		this.hud.setDistrict(this.world.district(this.playerPos.x, this.playerPos.z), threat);

		const markers: { x: number; z: number; color: string; label: string; world: THREE.Vector3; tone: 'gold' | 'green' | 'red' }[] = [];
		if (this.relayState !== 'done')
			markers.push({ x: 0, z: 0, color: this.relayState === 'uplinking' ? '#7dff9a' : '#e3c15a', label: 'RELAY', world: this.world.relayPos, tone: this.relayState === 'uplinking' ? 'green' : 'gold' });
		if (!this.huntDone) {
			const wp = this.warden && this.warden.alerted ? this.warden.pos : this.world.reactorPos;
			markers.push({ x: 0, z: 0, color: '#ff5a3a', label: 'WARDEN-9', world: wp, tone: 'red' });
		}
		if (this.extractState === 'open' || this.extractState === 'holding')
			markers.push({ x: 0, z: 0, color: '#7dff9a', label: 'EXTRACT', world: this.world.extractionPos, tone: 'green' });
		for (const m of markers) {
			m.x = m.world.x;
			m.z = m.world.z;
		}
		this.hud.drawMap(this.playerPos, this.yaw, dots, markers, BOUND);

		const w = window.innerWidth;
		const h = window.innerHeight;
		this.hud.setMarkers(
			markers.map((m) => {
				const v = m.world.clone().setY(m.world.y + (m.label === 'WARDEN-9' && this.warden?.alerted ? 6.5 : 4)).project(this.camera);
				const dist = Math.round(m.world.distanceTo(this.playerPos));
				return {
					x: ((v.x + 1) / 2) * w,
					y: ((1 - v.y) / 2) * h,
					label: `${m.label} ${dist}m`,
					color: m.tone,
					visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && dist > 6,
				};
			}),
		);

		// boss bar
		const wd = this.warden;
		this.hud.setBoss(wd && !wd.dead && wd.alerted && wd.pos.distanceTo(this.playerPos) < 90 ? wd.hp / wd.spec.hp : null);

		// interaction prompt
		let prompt: string | null = null;
		let prog = 0;
		if (this.relayState === 'idle' && this.playerPos.distanceTo(this.world.relayPos) < 5) prompt = '<kbd>E</kbd>ACTIVATE UPLINK RELAY';
		else if (this.world.supplies.some((s) => !s.used && s.pos.distanceTo(this.playerPos) < 2.6)) prompt = '<kbd>E</kbd>RESTOCK SUPPLIES';
		else if (this.platingT > 0) {
			prompt = 'APPLYING PLATE';
			prog = 1 - this.platingT / 1.1;
		}
		this.hud.setPrompt(prompt, prog);

		const spec = this.vm.gun.spec;
		const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
		const spread = THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.vm.adsT) * (moving ? 1.7 : 1);
		this.hud.setCrosshair((spread * h) / 1.4, this.vm.adsT > 0.6 || this.isSprinting());
		this.hurtFlash = Math.max(0, this.hurtFlash - dt * 0.8);
		this.hud.tick(dt, this.hurtFlash + (this.hp < 35 ? 0.35 + Math.sin(this.time * 5) * 0.1 : 0));
	}

	// ── loop ────────────────────────────────────────────────────────────────

	private frame = (now: number): void => {
		requestAnimationFrame(this.frame);
		const dt = Math.min(0.05, (now - this.last) / 1000);
		this.last = now;
		this.time += dt;

		if (this.phase === 'playing') {
			this.updatePlayer(dt);
			if (this.vm.gun.spec.auto ? this.mouseDown : this.firePressed) this.fire();
			this.firePressed = false;
			this.enemies.update(dt, this);
			this.updateWorldObjects(dt);
			this.updateObjectives(dt);
			this.sound.heartbeat(dt, this.hp);
		} else if (this.phase === 'dead' || this.phase === 'won' || this.phase === 'failed') {
			this.enemies.update(dt, this);
			this.updateWorldObjects(dt);
		}

		// camera
		if (this.phase === 'menu') {
			const t = this.time * 0.04;
			this.camera.position.set(Math.sin(t) * 150, 38, Math.cos(t) * 150);
			this.camera.lookAt(0, 12, 0);
			this.playerPos.set(this.camera.position.x, 0, this.camera.position.z);
		} else {
			this.recoilPitch = damp(this.recoilPitch, 0, 7, dt);
			const eye = THREE.MathUtils.lerp(EYE, EYE_CROUCH, this.crouchT);
			const deadDrop = this.hp <= 0 ? -1.3 : 0;
			const hs = Math.hypot(this.vel.x, this.vel.z);
			const bob = this.onGround ? Math.sin(this.bobT) * 0.035 * Math.min(1, hs / 5) * (1 - this.vm.adsT * 0.8) : 0;
			this.playerEye.set(this.playerPos.x, this.playerPos.y + eye + deadDrop + bob, this.playerPos.z);
			this.camera.position.copy(this.playerEye);
			this.shake = Math.max(0, this.shake - dt * 2.5);
			const sh = this.shake * this.shake * 0.03;
			this.camera.rotation.set(this.pitch + this.recoilPitch + rand(-sh, sh), this.yaw + rand(-sh, sh), this.hp <= 0 ? 0.5 : 0);
			const targetFov = THREE.MathUtils.lerp(this.settings.fov, this.vm.gun.spec.adsFov * (this.settings.fov / 78), this.vm.adsT) + (this.isSprinting() ? 6 : 0);
			if (Math.abs(this.camera.fov - targetFov) > 0.05) {
				this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
				this.camera.updateProjectionMatrix();
			}
		}

		this.vm.update(dt, {
			ads: this.rightDown && this.phase === 'playing',
			sprint: this.isSprinting(),
			speed: Math.hypot(this.vel.x, this.vel.z),
			lookDX: this.lookDX,
			lookDY: this.lookDY,
		});
		this.lookDX = this.lookDY = 0;

		// muzzle / explosion light
		if (this.vm.flashing) {
			this.flashLight.position.copy(this.camera.position);
			this.flashLight.intensity = Math.max(this.flashLight.intensity, 25);
		}
		this.flashLight.intensity = damp(this.flashLight.intensity, 0, 18, dt);

		this.moon.position.set(this.camera.position.x - 40, 90, this.camera.position.z - 60);
		this.moon.target.position.set(this.camera.position.x, 0, this.camera.position.z);
		this.world.update(this.time, dt, this.camera.position);
		this.particles.update(dt);
		this.updateRain(dt);
		if (this.phase === 'playing' || this.phase === 'paused') this.updateHud(dt);

		this.vmPass.enabled = (this.phase === 'playing' || this.phase === 'paused') && this.hp > 0;
		this.composer.render(dt);
	};
}

export function startDeadSignal(root: HTMLElement, opts: DeadSignalOptions = {}): void {
	new Game(root, opts);
}
