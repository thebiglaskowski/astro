import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Sound } from './audio';
import { type Enemy, type EnemyHost, type EnemyKind, EnemyManager, type RobotSfx } from './enemies';
import { Decals, PointFX, Streaks, smokeTexture, sparkTexture } from './fx';
import { Hud, type MapMarker, type ObjectiveView } from './hud';
import { GradeShader } from './post';
import { clamp, damp, formatClock, pick, rand, wrapAngle } from './util';
import { WEAPONS, type WeaponId, Viewmodel } from './weapons';
import { BOUND, type SupplyCrate, World } from './world';

const MISSION_TIME = 15 * 60;
const UPLINK_TIME = 75;
const EXTRACT_TIME = 40;
const EYE = 1.65;
const EYE_CROUCH = 1.05;
const RESUPPLY_COST = 150;

type Phase = 'menu' | 'playing' | 'paused' | 'dead' | 'won' | 'failed';
type PickupKind = 'ammo' | 'plate' | 'frag' | 'med';
type Quality = 'low' | 'medium' | 'high' | 'ultra';
type Difficulty = 'recruit' | 'operator' | 'veteran';

interface QualitySpec {
	pixelCap: number;
	shadows: number;
	lights: number;
	cones: boolean;
	bloom: boolean;
	aa: 'none' | 'fxaa' | 'smaa';
	ao: boolean;
	rain: number;
	env: boolean;
	torchShadow: boolean;
}

const QUALITY: Record<Quality, QualitySpec> = {
	low: { pixelCap: 0.8, shadows: 0, lights: 4, cones: false, bloom: false, aa: 'fxaa', ao: false, rain: 1500, env: false, torchShadow: false },
	medium: { pixelCap: 1, shadows: 1024, lights: 8, cones: true, bloom: true, aa: 'fxaa', ao: false, rain: 3000, env: true, torchShadow: false },
	high: { pixelCap: 1.5, shadows: 2048, lights: 12, cones: true, bloom: true, aa: 'smaa', ao: false, rain: 5000, env: true, torchShadow: true },
	ultra: { pixelCap: 2, shadows: 4096, lights: 16, cones: true, bloom: true, aa: 'smaa', ao: true, rain: 7000, env: true, torchShadow: true },
};

const DIFFICULTY: Record<Difficulty, { hp: number; damage: number; count: number; label: string; blurb: string }> = {
	recruit: { hp: 0.8, damage: 0.55, count: 0.75, label: 'Recruit', blurb: 'Forgiving. Learn the city.' },
	operator: { hp: 1, damage: 1, count: 1, label: 'Operator', blurb: 'The intended fight.' },
	veteran: { hp: 1.25, damage: 1.45, count: 1.3, label: 'Veteran', blurb: 'They hit hard. Aim true.' },
};

interface Settings {
	sensitivity: number;
	fov: number;
	volume: number;
	music: number;
	quality: Quality;
	showFps: boolean;
	difficulty: Difficulty;
}

interface Chip {
	p: THREE.Vector3;
	v: THREE.Vector3;
	life: number;
	max: number;
	size: number;
	color: THREE.Color;
}

interface Grenade {
	mesh: THREE.Mesh;
	vel: THREE.Vector3;
	fuse: number;
	bounces: number;
}

interface Pickup {
	kind: PickupKind;
	mesh: THREE.Group;
	pos: THREE.Vector3;
	t: number;
}

export interface DeadSignalOptions {
	exitHref?: string;
	exitLabel?: string;
}

const SETTINGS_KEY = 'dead-signal-settings-v2';

function defaultQuality(): Quality {
	const coarse = window.matchMedia('(pointer: coarse)').matches;
	const cores = navigator.hardwareConcurrency ?? 4;
	if (coarse) return 'low';
	return cores >= 8 ? 'high' : 'medium';
}

function loadSettings(): Settings {
	const base: Settings = { sensitivity: 1, fov: 80, volume: 0.8, music: 0.55, quality: defaultQuality(), showFps: false, difficulty: 'operator' };
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);
		if (raw) {
			const s = { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
			if (!(s.quality in QUALITY)) s.quality = base.quality;
			if (!(s.difficulty in DIFFICULTY)) s.difficulty = base.difficulty;
			return s;
		}
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

/** Solid chips (debris, casings on the street, sparks that should occlude). */
class Chips {
	readonly mesh: THREE.InstancedMesh;
	private readonly list: Chip[] = [];
	private readonly max = 500;
	private readonly m4 = new THREE.Matrix4();
	private readonly q = new THREE.Quaternion();
	private readonly s = new THREE.Vector3();
	private readonly axis = new THREE.Vector3();

	constructor(scene: THREE.Scene) {
		this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 }), this.max);
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.mesh.setColorAt(0, new THREE.Color());
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		scene.add(this.mesh);
	}

	burst(at: THREE.Vector3, color: number, n: number, speed: number, size: number): void {
		for (let k = 0; k < n; k++) {
			if (this.list.length >= this.max) this.list.shift();
			const life = rand(0.6, 1.6);
			this.list.push({
				p: at.clone(),
				v: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed * rand(0.4, 1)),
				life,
				max: life,
				size: size * rand(0.5, 1.4),
				color: new THREE.Color(color),
			});
		}
	}

	update(dt: number): void {
		let n = 0;
		for (let i = this.list.length - 1; i >= 0; i--) {
			const c = this.list[i];
			c.life -= dt;
			if (c.life <= 0) {
				this.list.splice(i, 1);
				continue;
			}
			c.v.y -= 14 * dt;
			c.p.addScaledVector(c.v, dt);
			if (c.p.y < c.size * 0.5) {
				c.p.y = c.size * 0.5;
				c.v.multiplyScalar(0.35);
				c.v.y = Math.abs(c.v.y);
			}
		}
		for (const c of this.list) {
			const k = c.size * Math.min(1, (c.life / c.max) * 3);
			this.s.set(k, k, k);
			this.axis.copy(c.v);
			if (this.axis.lengthSq() < 1e-8) this.axis.set(0, 1, 0);
			this.q.setFromAxisAngle(this.axis.normalize(), c.life * 9);
			this.m4.compose(c.p, this.q, this.s);
			this.mesh.setMatrixAt(n, this.m4);
			this.mesh.setColorAt(n, c.color);
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

const C = (hex: number) => new THREE.Color(hex);

class Game implements EnemyHost {
	// three
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera: THREE.PerspectiveCamera;
	private readonly composer: EffectComposer;
	private readonly vmPass: RenderPass;
	private readonly bloom: UnrealBloomPass;
	private readonly gtao: GTAOPass;
	private readonly fxaa: FXAAPass;
	private readonly smaa: SMAAPass;
	private readonly grade: ShaderPass;
	private readonly hemi: THREE.HemisphereLight;
	private readonly moon: THREE.DirectionalLight;
	private readonly bolt = new THREE.DirectionalLight(0xc6d4ff, 0);
	private readonly flashLight = new THREE.PointLight(0xffb070, 0, 16, 1.6);
	private readonly torch: THREE.SpotLight;
	private readonly skyMat: THREE.ShaderMaterial;
	private readonly rain: THREE.LineSegments;
	private readonly rainPos: Float32Array;
	private readonly maxRain = 7000;
	private rainCount = 3000;
	private envMap: THREE.Texture | null = null;

	// systems
	readonly world: World;
	private readonly enemies: EnemyManager;
	private readonly vm = new Viewmodel();
	private readonly hud: Hud;
	private readonly sound = new Sound();
	private readonly glow: PointFX;
	private readonly smoke: PointFX;
	private readonly chips: Chips;
	private readonly decals: Decals;
	private readonly streaks: Streaks;
	private settings = loadSettings();

	// player
	readonly playerPos = new THREE.Vector3();
	readonly playerEye = new THREE.Vector3();
	readonly cameraPos = new THREE.Vector3();
	difficulty = DIFFICULTY.operator;
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
	private torchOn = true;
	private meleeHitT = 0;
	private fallSpeed = 0;
	private strafe = 0;

	// input
	private readonly keys = new Set<string>();
	private mouseDown = false;
	private rightDown = false;
	private firePressed = false;
	private lookDX = 0;
	private lookDY = 0;
	private locked = false;
	private lockFailed = false;
	private lockErrors = 0;
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
	private stats = { kills: 0, heads: 0, shots: 0, hits: 0 };
	private last = performance.now();
	private readonly opts: DeadSignalOptions;
	private readonly whizzed = new WeakSet<object>();
	private readonly grenadeGeo = new THREE.SphereGeometry(0.09, 12, 10);
	private readonly grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.5, metalness: 0.4 });
	private readonly pickupGeo = new THREE.BoxGeometry(0.34, 0.22, 0.34);
	private readonly pickupBandGeo = new THREE.BoxGeometry(0.36, 0.05, 0.36);
	private readonly pickupMats = new Map<PickupKind, [THREE.Material, THREE.Material]>();
	private missionId = 0;
	private readonly tmpV = new THREE.Vector3();
	private readonly tmpV2 = new THREE.Vector3();
	private readonly tmpC = new THREE.Color();
	private lightningT = rand(12, 25);
	private lightningSeq: number[] = [];
	private flashAmt = 0;
	private fpsEma = 1 / 60;
	private fpsShown = 60;
	private fpsT = 0;
	private drs = 1;
	private drsT = 0;

	constructor(root: HTMLElement, opts: DeadSignalOptions) {
		this.opts = opts;
		root.classList.add('ds-root');
		this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.3;
		this.renderer.domElement.className = 'ds-gl';
		root.appendChild(this.renderer.domElement);

		this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 1600);
		this.camera.rotation.order = 'YXZ';
		this.scene.add(this.camera);
		this.scene.background = new THREE.Color(0x0a1019);
		this.scene.fog = new THREE.FogExp2(0x0d141e, 0.0098);

		this.skyMat = this.buildSky();
		this.hemi = new THREE.HemisphereLight(0x4a6290, 0x14141c, 1.5);
		this.scene.add(this.hemi);
		this.moon = new THREE.DirectionalLight(0xa8bcff, 0.85);
		this.moon.castShadow = true;
		const sc = this.moon.shadow.camera;
		sc.left = sc.bottom = -60;
		sc.right = sc.top = 60;
		sc.near = 1;
		sc.far = 300;
		this.moon.shadow.bias = -0.0004;
		this.moon.shadow.normalBias = 0.04;
		this.bolt.position.set(120, 300, -80);
		this.scene.add(this.moon, this.moon.target, this.flashLight, this.bolt);

		// tactical flashlight rides on the camera
		this.torch = new THREE.SpotLight(0xfff0d8, 14, 60, 0.4, 0.55, 1.2);
		this.torch.position.set(0.22, -0.18, 0);
		this.torch.target.position.set(0.05, -0.05, -10);
		this.torch.shadow.mapSize.set(512, 512);
		this.torch.shadow.bias = -0.0008;
		this.torch.shadow.camera.near = 0.3;
		this.camera.add(this.torch, this.torch.target);

		this.world = new World(this.scene);
		this.enemies = new EnemyManager(this.scene);
		this.glow = new PointFX(this.scene, 2500, true, sparkTexture());
		this.smoke = new PointFX(this.scene, 900, false, smokeTexture());
		this.chips = new Chips(this.scene);
		this.decals = new Decals(this.scene);
		this.streaks = new Streaks(this.scene);

		// rain (allocated for the highest quality; draw range trims it)
		this.rainPos = new Float32Array(this.maxRain * 6);
		for (let i = 0; i < this.maxRain; i++) {
			const x = rand(-40, 40);
			const y = rand(0, 40);
			const z = rand(-40, 40);
			this.rainPos.set([x, y, z, x + 0.05, y - 0.75, z], i * 6);
		}
		const rg = new THREE.BufferGeometry();
		rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
		this.rain = new THREE.LineSegments(
			rg,
			new THREE.LineBasicMaterial({ color: 0x9fb2cf, transparent: true, opacity: 0.3, depthWrite: false }),
		);
		this.rain.frustumCulled = false;
		this.scene.add(this.rain);

		this.composer = new EffectComposer(this.renderer);
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		this.gtao = new GTAOPass(this.scene, this.camera, 512, 512);
		this.gtao.blendIntensity = 0.85;
		this.composer.addPass(this.gtao);
		this.vmPass = new RenderPass(this.vm.scene, this.vm.camera);
		this.vmPass.clear = false;
		this.vmPass.clearDepth = true;
		this.composer.addPass(this.vmPass);
		this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.55, 0.95);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		this.grade = new ShaderPass(GradeShader);
		this.composer.addPass(this.grade);
		this.fxaa = new FXAAPass();
		this.composer.addPass(this.fxaa);
		this.smaa = new SMAAPass();
		this.composer.addPass(this.smaa);

		this.hud = new Hud(root);
		this.hud.buildMap(this.world.rects, BOUND);
		this.bindInput(root);
		this.applySettings(true);
		this.captureEnvironment();
		window.addEventListener('resize', () => this.resize());
		this.showMenu();
		if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __ds: Game }).__ds = this;
		requestAnimationFrame(this.frame);
	}

	// ── setup ───────────────────────────────────────────────────────────────

	private buildSky(): THREE.ShaderMaterial {
		const mat = new THREE.ShaderMaterial({
			side: THREE.BackSide,
			depthWrite: false,
			fog: false,
			uniforms: {
				uTime: { value: 0 },
				uFlash: { value: 0 },
				uMoon: { value: new THREE.Vector3(-0.45, 0.5, -0.74).normalize() },
			},
			vertexShader: /* glsl */ `
				varying vec3 vP;
				void main() {
					vP = normalize(position);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				uniform float uTime;
				uniform float uFlash;
				uniform vec3 uMoon;
				varying vec3 vP;
				float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
				float noise(vec2 p) {
					vec2 i = floor(p); vec2 f = fract(p);
					f = f * f * (3.0 - 2.0 * f);
					return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
				}
				float fbm(vec2 p) {
					float a = 0.5, s = 0.0;
					for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
					return s;
				}
				void main() {
					vec3 d = normalize(vP);
					float h = clamp(d.y, 0.0, 1.0);
					vec3 top = vec3(0.01, 0.016, 0.035);
					vec3 hor = vec3(0.06, 0.075, 0.11);
					vec3 col = mix(hor, top, pow(h, 0.5));
					// sodium glow of the city bleeding into the low sky
					col += vec3(0.2, 0.11, 0.05) * pow(1.0 - h, 8.0) * 0.9;
					// stars
					vec2 sp = d.xz / (d.y + 0.3) * 60.0;
					float star = step(0.9965, hash(floor(sp))) * smoothstep(0.1, 0.3, h);
					// moon + halo
					float m = max(dot(d, uMoon), 0.0);
					vec3 moon = vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.6 + pow(m, 180.0) * 0.35 + pow(m, 12.0) * 0.05);
					// drifting cloud deck, lit from below by the city and by lightning
					vec2 cp = d.xz / (d.y + 0.12) * 1.2 + vec2(uTime * 0.012, uTime * 0.004);
					float c = smoothstep(0.42, 0.85, fbm(cp));
					vec3 cloud = mix(vec3(0.05, 0.055, 0.07), vec3(0.16, 0.12, 0.1), pow(1.0 - h, 3.0));
					cloud += vec3(0.6, 0.66, 0.85) * uFlash * (0.6 + fbm(cp * 2.0));
					col = col + (star * 0.8 + moon) * (1.0 - c);
					col = mix(col, cloud, c * smoothstep(0.0, 0.08, d.y));
					col += vec3(0.25, 0.28, 0.4) * uFlash * 0.3;
					gl_FragColor = vec4(col, 1.0);
				}`,
		});
		const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), mat);
		sky.renderOrder = -1;
		this.scene.add(sky);
		return mat;
	}

	/** Bake the lit city into an environment map so wet streets and glossy robots reflect it. */
	private captureEnvironment(): void {
		const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
		const cube = new THREE.CubeCamera(0.5, 900, rt);
		cube.position.set(25, 3, 120);
		this.rain.visible = false;
		this.world.update(0, 1, cube.position);
		cube.update(this.renderer, this.scene);
		this.rain.visible = true;
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.envMap = pmrem.fromCubemap(rt.texture).texture;
		pmrem.dispose();
		rt.dispose();
		this.applyEnvironment();
	}

	private applyEnvironment(): void {
		const on = QUALITY[this.settings.quality].env;
		this.scene.environment = on ? this.envMap : null;
		this.scene.environmentIntensity = 0.7;
		this.vm.setEnvironment(on ? this.envMap : null);
	}

	private appliedQuality: Quality | null = null;

	private applySettings(first = false): void {
		const q = QUALITY[this.settings.quality];
		const qualityChanged = this.appliedQuality !== this.settings.quality;
		this.appliedQuality = this.settings.quality;
		this.camera.fov = this.settings.fov;
		this.camera.updateProjectionMatrix();
		this.glow.setScale(this.renderer.domElement.height, this.camera.projectionMatrix.elements[5]);
		this.smoke.setScale(this.renderer.domElement.height, this.camera.projectionMatrix.elements[5]);
		this.sound.setVolume(this.settings.volume);
		this.sound.setMusicVolume(this.settings.music);
		this.bloom.enabled = q.bloom;
		this.gtao.enabled = q.ao;
		this.fxaa.enabled = q.aa === 'fxaa';
		this.smaa.enabled = q.aa === 'smaa';
		this.world.setQuality(q.lights, q.cones);
		this.rainCount = q.rain;
		this.rain.geometry.setDrawRange(0, this.rainCount * 2);
		const shadowsWanted = q.shadows > 0;
		const shadowChange = this.renderer.shadowMap.enabled !== shadowsWanted || this.moon.shadow.mapSize.x !== q.shadows || this.torch.castShadow !== q.torchShadow;
		this.renderer.shadowMap.enabled = shadowsWanted;
		this.moon.castShadow = shadowsWanted;
		this.torch.castShadow = q.torchShadow && shadowsWanted;
		if (shadowsWanted && this.moon.shadow.mapSize.x !== q.shadows) {
			this.moon.shadow.mapSize.set(q.shadows, q.shadows);
			this.moon.shadow.map?.dispose();
			this.moon.shadow.map = null;
		}
		if (!first && qualityChanged) {
			this.applyEnvironment();
			if (shadowChange) this.scene.traverse((o) => {
				const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
				if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
				else if (m) m.needsUpdate = true;
			});
		}
		if (qualityChanged) {
			// render targets only need rebuilding when resolution/passes change
			this.drs = 1;
			this.resize();
		}
		this.hud.setFps(this.settings.showFps ? this.fpsShown : null, this.drs);
		saveSettings(this.settings);
	}

	private resize(): void {
		const w = window.innerWidth;
		const h = window.innerHeight;
		const pr = Math.min(window.devicePixelRatio || 1, QUALITY[this.settings.quality].pixelCap) * this.drs;
		this.renderer.setPixelRatio(pr);
		this.renderer.setSize(w, h, false);
		this.composer.setPixelRatio(pr);
		this.composer.setSize(w, h);
		this.bloom.resolution.set((w * pr) / 2, (h * pr) / 2);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.vm.setAspect(w / h);
		const u = this.grade.uniforms as unknown as typeof GradeShader.uniforms;
		u.uResolution.value.set(w * pr, h * pr);
		this.glow.setScale(h * pr, this.camera.projectionMatrix.elements[5]);
		this.smoke.setScale(h * pr, this.camera.projectionMatrix.elements[5]);
	}

	private bindInput(root: HTMLElement): void {
		const canvas = this.renderer.domElement;
		document.addEventListener('keydown', (e) => {
			if (this.phase !== 'playing') return;
			if (['Space', 'Tab', 'KeyF'].includes(e.code)) e.preventDefault();
			if (e.code === 'Escape') {
				// don't rely on the lock release alone to pause (and fallback mode has no lock)
				this.pause();
				return;
			}
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
			if (e.button === 1 || e.button === 3) this.doMelee();
		});
		document.addEventListener('mouseup', (e) => {
			if (e.button === 0) this.mouseDown = false;
			if (e.button === 2) this.rightDown = false;
		});
		canvas.addEventListener(
			'wheel',
			(e) => {
				if (this.phase !== 'playing') return;
				e.preventDefault();
				this.swap(this.vm.current === 'rifle' ? 'pistol' : 'rifle');
			},
			{ passive: false },
		);
		root.addEventListener('contextmenu', (e) => e.preventDefault());
		document.addEventListener('mousemove', (e) => {
			if (this.phase !== 'playing') return;
			if (!this.locked && !this.lockFailed) return;
			// Chrome can report one huge bogus delta right after pointer lock engages.
			if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
			const s = 0.0022 * this.settings.sensitivity * (1 - this.vm.adsT * 0.45);
			this.yaw -= e.movementX * s;
			this.pitch = clamp(this.pitch - e.movementY * s, -1.5, 1.5);
			this.lookDX += e.movementX;
			this.lookDY += e.movementY;
		});
		document.addEventListener('pointerlockchange', () => {
			this.locked = document.pointerLockElement === canvas;
			if (this.locked) {
				this.lockErrors = 0;
				this.lockFailed = false;
			}
			if (!this.locked && this.phase === 'playing' && !this.lockFailed) this.pause();
		});
		document.addEventListener('pointerlockerror', () => {
			// Chrome refuses a re-lock within ~1s of the user pressing Esc; that is
			// not a real failure, so only fall back to free-look after repeats.
			this.lockErrors++;
			if (this.lockErrors >= 3) this.lockFailed = true;
			else if (this.phase === 'playing') this.pause();
		});
		document.addEventListener('visibilitychange', () => {
			if (document.hidden && this.phase === 'playing') this.pause();
		});
		window.addEventListener('blur', () => {
			this.keys.clear();
			this.mouseDown = this.rightDown = false;
		});
	}

	private requestLock(): void {
		const canvas = this.renderer.domElement;
		try {
			const r = canvas.requestPointerLock() as unknown;
			if (r instanceof Promise) r.catch(() => undefined); // pointerlockerror handles it
		} catch {
			this.lockFailed = true;
		}
	}

	private onKey(code: string): void {
		switch (code) {
			case 'KeyR':
				if (this.vm.startReload()) this.sound.reload(this.vm.gun.spec.reload);
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
			case 'KeyV':
				this.doMelee();
				break;
			case 'KeyT':
				this.torchOn = !this.torchOn;
				this.sound.flashlight();
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

	/** Idle robots staged down the street for the title-screen dolly shot. */
	private stageMenuRobots(): void {
		if (this.enemies.list.length) return;
		const spots: [EnemyKind, number, number][] = [
			['husk', 23, 47],
			['husk', 28, 44.5],
			['gunner', 25.5, 42],
			['stalker', 21, 39.5],
			['husk', 29.5, 38],
			['husk', 24.5, 35],
		];
		for (const [k, x, z] of spots) {
			const e = this.enemies.spawn(k, new THREE.Vector3(x, 0, z), 1);
			e.facing = rand(-0.4, 0.4);
		}
	}

	private showMenu(): void {
		this.phase = 'menu';
		this.stageMenuRobots();
		this.hud.show(false);
		this.sound.setAmbience(0.5);
		this.sound.setIntensity(0.08);
		const coarse = window.matchMedia('(pointer: coarse)').matches;
		const o = this.hud.overlay(`
			<div class="ds-tag">● SIGNAL DETECTED · 6 DAYS SINCE LAST CONTACT</div>
			<h1>DEAD <span>SIGNAL</span></h1>
			<h2>EXCLUSION ZONE · OPERATION NIGHTFALL</h2>
			<p>Six days ago the city's Optimus labor fleet stopped taking orders. Now thousands of them walk the
			quarantine zone, eyes burning red, hunting anything warm. Reactivate the uplink relay at Kessler Depot,
			destroy the Warden-9 command unit at the Halcyon reactor, and reach extraction before the window closes.</p>
			<button class="ds-btn primary" data-act="deploy">Deploy</button>
			<button class="ds-btn" data-act="settings">Settings</button>
			<button class="ds-btn" data-act="controls">Controls</button>
			${coarse ? '<div class="ds-touch-note">KEYBOARD &amp; MOUSE REQUIRED</div>' : ''}
		`);
		o.classList.add('ds-title');
		if (this.opts.exitHref) o.insertAdjacentHTML('beforeend', `<a class="ds-back" href="${this.opts.exitHref}">← ${this.opts.exitLabel ?? 'BACK'}</a>`);
		this.bindButtons(o, {
			deploy: () => this.showDifficulty(),
			settings: () => this.showSettings(() => this.showMenu()),
			controls: () => this.showControls(),
		});
	}

	private showDifficulty(): void {
		const o = this.hud.overlay(`
			<h3>SELECT DIFFICULTY</h3>
			<div class="ds-diff">
				${(Object.keys(DIFFICULTY) as Difficulty[])
					.map(
						(d) =>
							`<button class="ds-btn ${d === this.settings.difficulty ? 'primary' : ''}" data-act="${d}">${DIFFICULTY[d].label}<small>${DIFFICULTY[d].blurb}</small></button>`,
					)
					.join('')}
			</div>
			<button class="ds-btn" data-act="back">Back</button>`);
		const pickDiff = (d: Difficulty) => () => {
			this.settings.difficulty = d;
			saveSettings(this.settings);
			this.startMission();
		};
		this.bindButtons(o, {
			recruit: pickDiff('recruit'),
			operator: pickDiff('operator'),
			veteran: pickDiff('veteran'),
			back: () => this.showMenu(),
		});
	}

	private showControls(): void {
		const rows = [
			['WASD', 'Move'],
			['Mouse', 'Look'],
			['Shift', 'Sprint'],
			['C / Ctrl', 'Crouch (hold)'],
			['Space', 'Jump'],
			['LMB / RMB', 'Fire / Aim down sights'],
			['R', 'Reload'],
			['1 · 2 · Q · Wheel', 'Rifle · Pistol · Swap'],
			['V / Mouse 3', 'Melee strike'],
			['T', 'Flashlight'],
			['E', 'Interact / Resupply'],
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
		const seg = (key: string, opts: string[], current: string) =>
			`<div class="ds-seg" data-seg="${key}">${opts.map((v) => `<button type="button" data-v="${v}" class="${v === current ? 'on' : ''}">${v}</button>`).join('')}</div>`;
		const o = this.hud.overlay(`
			<h3>SETTINGS</h3>
			<div class="ds-seg-row">GRAPHICS${seg('quality', ['low', 'medium', 'high', 'ultra'], s.quality)}</div>
			<label class="ds-set">SENSITIVITY<input type="range" min="0.3" max="3" step="0.05" value="${s.sensitivity}" data-k="sensitivity"><output>${s.sensitivity.toFixed(2)}</output></label>
			<label class="ds-set">FIELD OF VIEW<input type="range" min="60" max="110" step="1" value="${s.fov}" data-k="fov"><output>${s.fov}</output></label>
			<label class="ds-set">MASTER VOLUME<input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"><output>${Math.round(s.volume * 100)}</output></label>
			<label class="ds-set">MUSIC<input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"><output>${Math.round(s.music * 100)}</output></label>
			<div class="ds-seg-row">FPS COUNTER${seg('fps', ['off', 'on'], s.showFps ? 'on' : 'off')}</div>
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
					case 'music':
						s.music = v;
						out.textContent = String(Math.round(v * 100));
						break;
				}
				this.applySettings();
			});
		});
		o.querySelectorAll<HTMLElement>('[data-seg]').forEach((group) => {
			group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
				b.addEventListener('click', () => {
					this.sound.ui();
					group.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
					const v = b.dataset.v ?? '';
					if (group.dataset.seg === 'quality' && v in QUALITY) s.quality = v as Quality;
					if (group.dataset.seg === 'fps') s.showFps = v === 'on';
					this.applySettings();
				});
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
		this.keys.clear();
		this.mouseDown = this.rightDown = false;
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
		this.sound.setIntensity(kind === 'won' ? 0.3 : 0.1);
		const id = this.missionId;
		setTimeout(() => {
			if (this.phase !== kind || id !== this.missionId) return;
			this.hud.show(false);
			const o = this.hud.overlay(`
				<h1>${kind === 'won' ? title : `<span>${title}</span>`}</h1>
				<h2>${sub}</h2>
				<div class="ds-stats">
					<span>DIFFICULTY</span><b>${this.difficulty.label.toUpperCase()}</b>
					<span>TIME</span><b>${formatClock(MISSION_TIME - this.missionLeft)}</b>
					<span>UNITS DESTROYED</span><b>${this.stats.kills}</b>
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
		}, 1800);
	}

	// ── mission lifecycle ───────────────────────────────────────────────────

	private clearMission(): void {
		this.missionId++;
		this.enemies.clear();
		for (const g of this.grenades) this.scene.remove(g.mesh);
		for (const p of this.pickups) this.scene.remove(p.mesh);
		this.grenades = [];
		this.pickups = [];
		this.glow.clear();
		this.smoke.clear();
		this.chips.clear();
		this.decals.clear();
		this.streaks.clear();
		this.warden = null;
	}

	private startMission(): void {
		this.clearMission();
		this.missionId++;
		this.meleeHitT = 0;
		this.firePressed = false;
		this.onGround = true;
		this.fallSpeed = 0;
		this.strafe = 0;
		this.difficulty = DIFFICULTY[this.settings.difficulty];
		this.hud.clearOverlay();
		this.hud.show(true);
		this.sound.unlock();
		this.sound.setAmbience(0.9);
		this.playerPos.copy(this.world.spawn);
		this.vel.set(0, 0, 0);
		this.yaw = 0;
		this.pitch = 0;
		this.recoilPitch = 0;
		this.hp = 100;
		this.armor = 50;
		this.plates = 2;
		this.frags = 2;
		this.salvage = 0;
		this.salvageGain = 0;
		this.missionLeft = MISSION_TIME;
		this.relayState = 'idle';
		this.relayProgress = 0;
		this.huntDone = false;
		this.extractState = 'locked';
		this.extractProgress = 0;
		this.stats = { kills: 0, heads: 0, shots: 0, hits: 0 };
		this.platingT = 0;
		this.lastHurt = -99;
		this.hurtFlash = 0;
		this.shake = 0;
		this.crouchT = 0;
		this.torchOn = true;
		this.keys.clear();
		this.mouseDown = this.rightDown = false;
		this.world.setRelayActive(false);
		this.world.setExtractionLive(false);
		for (const s of this.world.supplies) {
			s.used = false;
			s.strip.emissive.setHex(0x7dff9a);
		}
		this.vm.reset();

		const nodes = this.world.streetNodes.filter((n) => n.distanceTo(this.world.spawn) > 70);
		const population = Math.round(30 * this.difficulty.count);
		for (let i = 0; i < population; i++) this.spawnEnemy(this.randomKind(0.2), this.jitter(pick(nodes), 6));
		const r = this.world.reactorPos;
		this.warden = this.spawnEnemy('warden', new THREE.Vector3(r.x + 12, 0, r.z - 12));
		for (let i = 0; i < 4; i++) this.spawnEnemy('husk', new THREE.Vector3(r.x + rand(-2, 16), 0, r.z + rand(-16, -10)));
		for (let i = 0; i < 3; i++) this.spawnEnemy('gunner', new THREE.Vector3(r.x + rand(10, 16), 0, r.z + rand(10, 16)));

		this.phase = 'playing';
		this.last = performance.now();
		this.hud.showBanner('OPERATION NIGHTFALL', 'DEPLOYED', `CHECKPOINT 3 · ${this.difficulty.label.toUpperCase()}`, 3.5);
		this.requestLock();
	}

	private spawnEnemy(kind: EnemyKind, at: THREE.Vector3, alerted = false): Enemy {
		return this.enemies.spawn(kind, at, this.difficulty.hp, alerted);
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
		const hadArmor = this.armor > 0;
		const absorbed = Math.min(this.armor, dmg * 0.8);
		this.armor -= absorbed;
		dmg -= absorbed;
		this.hp -= dmg;
		if (hadArmor && this.armor <= 0) this.sound.armorBreak();
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

	onEnemyKilled(e: Enemy, headshot: boolean, explosive = false): void {
		this.stats.kills++;
		if (headshot) this.stats.heads++;
		const reward = e.spec.reward * (headshot ? 2 : 1);
		this.salvage += reward;
		this.salvageGain += reward;
		this.salvageGainT = 2;
		e.shatter(this.enemies.debris, this.playerPos, headshot, explosive);
		const c = e.chest;
		this.glow.burst(c, C(0xffd27a), 30, 7, 0.5, 0.12, 9);
		this.glow.burst(c, C(0x7fd4ff), 12, 5, 0.3, 0.1, 4);
		this.chips.burst(c, 0x1a1a1c, 10, 5, 0.06);
		this.chips.burst(c, 0xdadde2, 6, 4, 0.05);
		for (let k = 0; k < 6; k++) this.smoke.emit(c, new THREE.Vector3(rand(-0.6, 0.6), rand(0.5, 1.5), rand(-0.6, 0.6)), rand(1.4, 2.4), 0.8, C(0x2a2a2e), { grow: 1.6, alpha: 0.5, drag: 1 });
		this.sound.robot('death', e.pos);
		this.hud.feed(`<b>${e.spec.name}</b> DESTROYED${headshot ? ' · HEADSHOT' : ''} <i>+${reward}</i>`);
		if (e.kind === 'warden') {
			this.huntDone = true;
			this.hud.showBanner('CONTRACT COMPLETE', 'WARDEN-9 DOWN', '+500 SALVAGE', 4);
			this.sound.objective(true);
			this.explode(e.chest, false);
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
		if (this.enemies.alive >= Math.round(48 * this.difficulty.count)) return;
		for (let k = 0; k < 3; k++) this.spawnEnemy('husk', this.jitter(pos, 6), true);
		this.sound.robot('roar', pos);
	}

	onBossEnrage(): void {
		this.hud.showBanner('WARNING', 'WARDEN-9 ENRAGED', 'COMBAT PROTOCOLS UNLOCKED', 3);
		this.sound.alarm();
	}

	shockwave(pos: THREE.Vector3, radius: number): void {
		this.streaks.ring(pos, radius, 0xff5a2a);
		this.chips.burst(pos.clone().setY(0.2), 0x3a3b3e, 20, 7, 0.08);
		for (let k = 0; k < 10; k++) this.smoke.emit(pos.clone().setY(0.3), new THREE.Vector3(rand(-4, 4), rand(0.2, 1), rand(-4, 4)), rand(1, 2), 1, C(0x3a3632), { grow: 2, alpha: 0.45, drag: 2 });
		this.shake = Math.min(1.5, this.shake + Math.max(0, 1 - pos.distanceTo(this.playerPos) / 25));
	}

	sparks(pos: THREE.Vector3, color: number, count: number, speed = 6): void {
		this.glow.burst(pos, C(color), count, speed, 0.4, 0.08, 9);
	}

	sfx(name: RobotSfx, pos: THREE.Vector3): void {
		this.sound.robot(name, pos);
	}

	// ── gameplay ────────────────────────────────────────────────────────────

	private forward(out = new THREE.Vector3()): THREE.Vector3 {
		return out.set(0, 0, -1).applyEuler(this.camera.rotation);
	}

	private fire(): void {
		const res = this.vm.tryFire(this.isSprinting());
		if (res === 'empty') {
			this.sound.dry();
			if (this.vm.startReload()) this.sound.reload(this.vm.gun.spec.reload);
			return;
		}
		if (res !== 'fired') return;
		const spec = this.vm.gun.spec;
		this.stats.shots++;
		if (spec.id === 'rifle') this.sound.rifle();
		else this.sound.pistol();
		if (Math.random() < 0.35) this.sound.casing();
		this.enemies.noise(this.playerPos, 70);

		const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
		const spread =
			THREE.MathUtils.lerp(spec.spreadHip, spec.spreadAds, this.vm.adsT) *
			(moving ? 1.7 : 1) *
			(this.crouchT > 0.5 ? 0.65 : 1) *
			(this.onGround ? 1 : 2.5);
		const dir = this.forward();
		const right = new THREE.Vector3(1, 0, 0).applyEuler(this.camera.rotation);
		const up = new THREE.Vector3(0, 1, 0).applyEuler(this.camera.rotation);
		const a = Math.random() * Math.PI * 2;
		const r = Math.sqrt(Math.random()) * spread;
		dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();

		const origin = this.camera.position.clone();
		const wall = this.world.raycastHit(origin, dir, 300);
		const hit = this.enemies.raycast(origin, dir, wall.dist);
		const end = origin.clone().addScaledVector(dir, hit ? hit.dist : Math.min(wall.dist, 300));
		if (hit) {
			this.stats.hits++;
			const dmg = spec.damage * (hit.head ? spec.headMult : 1);
			const killed = hit.enemy.hurt(dmg, this.playerPos);
			this.glow.burst(end, C(hit.head ? 0xfff0c0 : 0xffc870), hit.head ? 16 : 9, 6, 0.3, 0.06, 12);
			if (Math.random() < 0.4) this.glow.burst(end, C(0x7fd4ff), 4, 3, 0.25, 0.05, 2);
			this.chips.burst(end, 0x151517, 2, 3, 0.03);
			this.hud.hitmarker(killed);
			this.sound.hitRobot(hit.head, killed);
			if (killed) this.onEnemyKilled(hit.enemy, hit.head);
		} else if (wall.dist < 300) {
			const at = end.clone().addScaledVector(dir, -0.02);
			this.glow.burst(at, C(0xffc070), 7, 5, 0.25, 0.05, 12);
			this.smoke.emit(at, wall.normal.clone().multiplyScalar(0.6), 0.9, 0.25, C(0x6a6660), { grow: 0.6, alpha: 0.5, drag: 2 });
			this.chips.burst(at, 0x3a3836, 3, 2.5, 0.025);
			this.decals.add(end, wall.normal, rand(0.1, 0.16));
			if (end.distanceTo(this.playerPos) < 40) this.sound.ricochet(end);
		}

		const muzzle = origin.clone().addScaledVector(right, 0.18 * (1 - this.vm.adsT)).addScaledVector(up, -0.12).addScaledVector(dir, 0.8);
		if (Math.random() < 0.7) this.streaks.tracer(muzzle, end);
		this.smoke.emit(muzzle, dir.clone().multiplyScalar(0.8).add(new THREE.Vector3(0, 0.3, 0)), 0.8, 0.12, C(0x9a9a9a), { grow: 0.5, alpha: 0.25, drag: 2 });

		this.recoilPitch += spec.recoil * (1 - this.vm.adsT * 0.4);
		this.yaw += rand(-1, 1) * spec.recoil * 0.3;
		this.shake = Math.min(1, this.shake + 0.04);
	}

	private doMelee(): void {
		if (!this.alive || this.phase !== 'playing') return;
		if (!this.vm.melee()) return;
		this.meleeHitT = 0.12;
	}

	private resolveMelee(): void {
		const fwd = this.forward().setY(0).normalize();
		let hitAny = false;
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const to = new THREE.Vector3().subVectors(e.pos, this.playerPos).setY(0);
			const d = to.length();
			if (d > 2.4 * Math.max(1, e.spec.scale * 0.6)) continue;
			if (to.normalize().dot(fwd) < 0.55) continue;
			hitAny = true;
			const killed = e.hurt(85, this.playerPos);
			this.glow.burst(e.chest, C(0xffe0a0), 18, 6, 0.3, 0.07, 10);
			this.hud.hitmarker(killed);
			if (killed) this.onEnemyKilled(e, false);
		}
		this.sound.melee(hitAny);
		if (hitAny) this.shake = Math.min(1, this.shake + 0.2);
	}

	private throwGrenade(): void {
		if (this.frags <= 0 || !this.alive) return;
		this.frags--;
		this.sound.pin();
		const mesh = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
		const dir = this.forward();
		mesh.position.copy(this.camera.position).addScaledVector(dir, 0.5);
		mesh.castShadow = true;
		this.scene.add(mesh);
		const vel = dir.multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).add(this.vel.clone().setY(0));
		this.grenades.push({ mesh, vel, fuse: 2.3, bounces: 0 });
	}

	private explode(at: THREE.Vector3, damages = true): void {
		const ground = at.clone().setY(Math.max(at.y, 0.2));
		this.glow.burst(ground, C(0xffd080), 70, 14, 0.55, 0.3, 5);
		this.glow.burst(ground, C(0xff6a20), 40, 8, 0.8, 0.45, 1);
		for (let k = 0; k < 26; k++)
			this.smoke.emit(ground, new THREE.Vector3(rand(-3, 3), rand(1, 4), rand(-3, 3)), rand(2, 3.5), rand(1, 2), C(0x252321), { grow: 2.4, alpha: 0.6, drag: 1.4 });
		this.chips.burst(ground, 0x2a2826, 24, 11, 0.07);
		this.streaks.ring(ground, 9, 0xffa050);
		this.decals.add(new THREE.Vector3(at.x, 0.01, at.z), new THREE.Vector3(0, 1, 0), 3.2);
		this.flashLight.position.copy(ground).setY(ground.y + 1.2);
		this.flashLight.intensity = 600;
		const d = at.distanceTo(this.playerPos);
		this.sound.explosion(at);
		this.shake = Math.min(1.6, this.shake + Math.max(0, 1.3 - d / 25));
		if (!damages) return;
		this.enemies.noise(at, 90);
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const ed = e.chest.distanceTo(at);
			if (ed < 8) {
				const killed = e.hurt(190 * (1 - ed / 8) + 25, at);
				if (killed) this.onEnemyKilled(e, false, true);
				else this.hud.hitmarker(false);
			}
		}
		if (d < 6) this.damagePlayer(75 * (1 - d / 6), at);
	}

	private dropPickup(kind: PickupKind, at: THREE.Vector3): void {
		const colors: Record<PickupKind, number> = { ammo: 0xe3c15a, plate: 0x5ab8ff, frag: 0x9aff6a, med: 0xff5a5a };
		let mats = this.pickupMats.get(kind);
		if (!mats) {
			mats = [
				new THREE.MeshStandardMaterial({ color: 0x1b1d20, emissive: colors[kind], emissiveIntensity: 0.25, roughness: 0.5, metalness: 0.4 }),
				new THREE.MeshBasicMaterial({ color: colors[kind], toneMapped: false }),
			];
			this.pickupMats.set(kind, mats);
		}
		const g = new THREE.Group();
		g.add(new THREE.Mesh(this.pickupGeo, mats[0]), new THREE.Mesh(this.pickupBandGeo, mats[1]));
		const pos = at.clone().add(new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6)));
		pos.y = this.world.groundAt(pos.x, pos.z);
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

	private nearestSupply(): SupplyCrate | null {
		return this.world.supplies.find((s) => s.pos.distanceTo(this.playerPos) < 2.6) ?? null;
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
		const s = this.nearestSupply();
		if (s) {
			if (s.used && this.salvage < RESUPPLY_COST) {
				this.hud.showToast(`NEED ◆ ${RESUPPLY_COST} SALVAGE`);
				this.sound.dry();
				return;
			}
			if (s.used) this.salvage -= RESUPPLY_COST;
			s.used = true;
			s.strip.emissive.setHex(0xe3c15a);
			this.vm.guns.rifle.reserve = WEAPONS.rifle.reserveMax;
			this.vm.guns.pistol.reserve = WEAPONS.pistol.reserveMax;
			this.plates = Math.min(3, this.plates + 1);
			this.frags = Math.min(3, this.frags + 1);
			this.hp = Math.min(100, this.hp + 25);
			this.hud.showToast('RESUPPLIED · AMMO · PLATE · FRAG · MED');
			this.sound.pickup();
		}
	}

	private checkExtraction(): void {
		if (this.extractState === 'locked' && this.relayState === 'done' && this.huntDone) {
			this.extractState = 'open';
			this.world.setExtractionLive(true);
			const id = this.missionId;
			setTimeout(() => {
				if (this.phase === 'playing' && id === this.missionId) this.hud.showBanner('ALL CONTRACTS COMPLETE', 'EXTRACTION UNLOCKED', 'REACH THE NORTHGATE HELIPAD', 4);
			}, 2500);
		}
	}

	private isSprinting(): boolean {
		return this.keys.has('ShiftLeft') && this.keys.has('KeyW') && !this.rightDown && !this.mouseDown && this.crouchT < 0.5 && !this.vm.busy;
	}

	private spawnNear(center: THREE.Vector3, minD: number, maxD: number, count: number, gunnerBias: number): void {
		const nodes = this.world.streetNodes.filter((n) => {
			const d = n.distanceTo(center);
			return d > minD && d < maxD && n.distanceTo(this.playerPos) > 25;
		});
		if (!nodes.length) return;
		for (let i = 0; i < count; i++) this.spawnEnemy(this.randomKind(gunnerBias), this.jitter(pick(nodes), 5), true);
	}

	private updatePlayer(dt: number): void {
		const k = this.keys;
		const crouch = k.has('KeyC') || k.has('ControlLeft');
		this.crouchT = damp(this.crouchT, crouch ? 1 : 0, 12, dt);
		const sprint = this.isSprinting();
		const speed = crouch ? 2.4 : sprint ? 7.8 : this.rightDown ? 3.2 : 4.8;
		const fx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
		const fz = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
		this.strafe = damp(this.strafe, fx, 10, dt);
		const wish = new THREE.Vector3(fx, 0, fz);
		if (wish.lengthSq() > 0) wish.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).multiplyScalar(speed);
		const accel = this.onGround ? 12 : 2;
		this.vel.x = damp(this.vel.x, wish.x, accel, dt);
		this.vel.z = damp(this.vel.z, wish.z, accel, dt);
		this.vel.y -= 16 * dt;
		this.fallSpeed = Math.max(this.fallSpeed, -this.vel.y);
		this.playerPos.addScaledVector(this.vel, dt);
		const ground = this.world.groundAt(this.playerPos.x, this.playerPos.z);
		if (this.playerPos.y <= ground) {
			if (!this.onGround && this.fallSpeed > 4) {
				this.sound.land();
				this.vm.land(this.fallSpeed);
			}
			this.fallSpeed = 0;
			this.playerPos.y = ground;
			this.vel.y = 0;
			this.onGround = true;
		} else if (this.playerPos.y - ground > 0.2) this.onGround = false;
		else this.playerPos.y = damp(this.playerPos.y, ground, 20, dt);
		this.world.resolve(this.playerPos, 0.4);
		// robots are solid too
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const dx = this.playerPos.x - e.pos.x;
			const dz = this.playerPos.z - e.pos.z;
			const min = 0.4 + 0.3 * e.spec.scale;
			const d2 = dx * dx + dz * dz;
			if (d2 < min * min && d2 > 1e-6) {
				const d = Math.sqrt(d2);
				this.playerPos.x += (dx / d) * (min - d);
				this.playerPos.z += (dz / d) * (min - d);
			}
		}
		this.playerPos.x = clamp(this.playerPos.x, -BOUND + 1, BOUND - 1);
		this.playerPos.z = clamp(this.playerPos.z, -BOUND + 1, BOUND - 1);

		const hs = Math.hypot(this.vel.x, this.vel.z);
		if (this.onGround && hs > 1) {
			this.bobT += dt * hs * 1.8;
			this.stepT -= dt * hs;
			if (this.stepT <= 0) {
				this.stepT = 2.6;
				this.sound.step(sprint);
				if (Math.random() < 0.5) this.glow.emit(this.playerPos.clone().setY(0.05), new THREE.Vector3(rand(-0.5, 0.5), 1.2, rand(-0.5, 0.5)), 0.3, 0.05, C(0x8899aa), { grav: 6, alpha: 0.5 });
			}
		}

		if (this.time - this.lastHurt > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 9 * dt);
		if (this.platingT > 0) {
			this.platingT -= dt;
			if (this.platingT <= 0 && this.plates > 0) {
				this.plates--;
				this.armor = Math.min(100, this.armor + 50);
				this.sound.plate();
			}
		}
		if (this.meleeHitT > 0) {
			this.meleeHitT -= dt;
			if (this.meleeHitT <= 0) this.resolveMelee();
		}
	}

	private updateObjectives(dt: number): void {
		const p = this.playerPos;
		const cap = Math.round(48 * this.difficulty.count);
		if (this.relayState === 'uplinking') {
			const near = p.distanceTo(this.world.relayPos) < 26;
			if (near) this.relayProgress = Math.min(1, this.relayProgress + dt / UPLINK_TIME);
			this.waveT -= dt;
			if (this.waveT <= 0) {
				this.waveT = rand(3.5, 5.5) / this.difficulty.count;
				if (this.enemies.alive < cap) this.spawnNear(this.world.relayPos, 40, 85, 2 + Math.floor(Math.random() * 2), 0.18);
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
				this.waveT = rand(2.5, 4) / this.difficulty.count;
				if (this.enemies.alive < cap + 8) this.spawnNear(this.world.extractionPos, 40, 90, 2 + Math.floor(Math.random() * 3), 0.25);
			}
			// red signal flare on the pad
			const f = this.world.extractionPos.clone().add(new THREE.Vector3(8, 0.3, 8));
			this.glow.emit(f, new THREE.Vector3(rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3)), 0.8, 0.35, C(0xff3a2a), { grav: -0.5 });
			if (Math.random() < 0.3) this.smoke.emit(f, new THREE.Vector3(rand(-0.3, 0.3), rand(1.5, 2.2), rand(-0.3, 0.3)), 4, 0.8, C(0x8a2a22), { grow: 1.2, alpha: 0.4 });
			if (this.extractProgress >= 1) {
				this.extractState = 'done';
				this.salvage += 250;
				this.endScreen('won');
			}
		}

		this.spawnT -= dt;
		if (this.spawnT <= 0) {
			this.spawnT = 4;
			if (this.enemies.alive < Math.round(26 * this.difficulty.count)) this.spawnNear(this.playerPos, 70, 150, 1, 0.2);
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
			g.mesh.position.addScaledVector(g.vel, dt);
			const p = g.mesh.position;
			let bounced = false;
			if (p.y < 0.09) {
				p.y = 0.09;
				if (Math.abs(g.vel.y) > 1.5) bounced = true;
				g.vel.y = Math.abs(g.vel.y) * 0.35;
				g.vel.x *= 0.7;
				g.vel.z *= 0.7;
			}
			const pre = p.clone();
			if (this.world.resolve(p, 0.1)) {
				const push = p.clone().sub(pre);
				if (Math.abs(push.x) > Math.abs(push.z)) g.vel.x *= -0.45;
				else g.vel.z *= -0.45;
				bounced = true;
			}
			if (bounced && g.bounces++ < 6) this.sound.grenadeBounce(p);
			g.mesh.rotation.x += dt * g.vel.length() * 3;
			if (Math.random() < 0.5) this.glow.emit(p, new THREE.Vector3(0, 0.3, 0), 0.2, 0.05, C(0xff5a2a));
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
			const taken = near && this.phase === 'playing' && this.collect(pk);
			if (taken || pk.t <= 0) {
				if (taken) this.sound.pickup();
				this.scene.remove(pk.mesh);
				this.pickups.splice(i, 1);
			}
		}
		// bolts that just missed you crack past your ear
		for (const b of this.enemies.bolts.live) {
			if (this.whizzed.has(b.mesh)) continue;
			const d = b.mesh.position.distanceTo(this.playerEye);
			if (d < 2.6) {
				this.whizzed.add(b.mesh);
				this.sound.whizz(b.mesh.position);
			}
		}
	}

	/** Ambient particles: barrel fires, rain splashes, dead-robot smoke. */
	private updateAmbient(): void {
		const cam = this.camera.position;
		const p = this.tmpV;
		const v = this.tmpV2;
		const col = this.tmpC;
		for (const f of this.world.fires) {
			if (f.distanceToSquared(cam) > 70 * 70) continue;
			for (let k = 0; k < 2; k++) {
				const hot = Math.random();
				p.set(f.x + rand(-0.18, 0.18), f.y, f.z + rand(-0.18, 0.18));
				v.set(rand(-0.2, 0.2), rand(1.2, 2.2), rand(-0.2, 0.2));
				this.glow.emit(p, v, rand(0.35, 0.7), rand(0.35, 0.6), col.setHSL(0.05 + hot * 0.06, 1, 0.45 + hot * 0.2), { grow: -0.4, grav: -0.5 });
			}
			if (Math.random() < 0.15) this.glow.emit(f, v.set(rand(-0.6, 0.6), rand(2, 3.5), rand(-0.6, 0.6)), rand(1, 2), 0.04, col.setHex(0xffa040), { grav: -0.2, drag: 0.4 });
			if (Math.random() < 0.12)
				this.smoke.emit(p.set(f.x, f.y + 0.8, f.z), v.set(rand(-0.2, 0.2), rand(0.8, 1.4), rand(-0.2, 0.2)), rand(3, 5), 0.6, col.setHex(0x1c1b1c), { grow: 1.1, alpha: 0.45, drag: 0.3 });
		}
		// splashes
		const n = Math.floor(this.rainCount / 400);
		col.setHex(0x6a7a90);
		for (let k = 0; k < n; k++) {
			const x = cam.x + rand(-14, 14);
			const z = cam.z + rand(-14, 14);
			this.glow.emit(p.set(x, this.world.groundAt(x, z) + 0.03, z), v.set(rand(-0.4, 0.4), rand(0.6, 1.2), rand(-0.4, 0.4)), 0.18, 0.035, col, { grav: 8, alpha: 0.7 });
		}
	}

	private updateRain(dt: number): void {
		const c = this.camera.position;
		const a = this.rainPos;
		const count = this.rainCount * 6;
		const wind = Math.sin(this.time * 0.2) * 1.5;
		for (let i = 0; i < count; i += 6) {
			let y = a[i + 1] - 28 * dt;
			let x = a[i] + wind * dt;
			let z = a[i + 2];
			if (y < 0 || Math.abs(x - c.x) > 40 || Math.abs(z - c.z) > 40) {
				x = c.x + rand(-40, 40);
				z = c.z + rand(-40, 40);
				y = y < 0 ? c.y + rand(20, 30) : c.y + rand(-5, 30);
			}
			a[i] = x;
			a[i + 1] = y;
			a[i + 2] = z;
			a[i + 3] = x + 0.05 + wind * 0.03;
			a[i + 4] = y - 0.75;
			a[i + 5] = z;
		}
		this.rain.geometry.attributes.position.needsUpdate = true;
	}

	private updateLightning(dt: number): void {
		this.lightningT -= dt;
		if (this.lightningT <= 0) {
			this.lightningT = rand(18, 45);
			// a burst of 2–4 strobes, then thunder after the light (closer strikes crack sooner)
			const strobes = 2 + Math.floor(Math.random() * 3);
			this.lightningSeq = [];
			let t = 0;
			for (let k = 0; k < strobes; k++) {
				t += rand(0.04, 0.22);
				this.lightningSeq.push(t);
			}
			const dist = Math.random();
			setTimeout(() => this.sound.thunder(dist), (0.4 + dist * 2.6) * 1000);
		}
		let flash = 0;
		for (let i = this.lightningSeq.length - 1; i >= 0; i--) {
			this.lightningSeq[i] -= dt;
			const t = this.lightningSeq[i];
			if (t < 0 && t > -0.09) flash = Math.max(flash, 1 + t * 8);
			if (t < -0.2) this.lightningSeq.splice(i, 1);
		}
		this.flashAmt = Math.max(flash, this.flashAmt - dt * 5);
		this.bolt.intensity = this.flashAmt * 2.4;
		this.hemi.intensity = 1.5 + this.flashAmt * 1.6;
		this.skyMat.uniforms.uFlash.value = this.flashAmt;
	}

	private updateHud(dt: number): void {
		const g = this.vm.gun;
		const status =
			this.vm.reloadT > 0 ? 'RELOADING' : g.ammo === 0 ? (g.reserve ? 'RELOAD [R]' : 'NO AMMO') : this.platingT > 0 ? 'PLATING' : this.torchOn ? '' : 'LIGHT OFF [T]';
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
				desc: this.huntDone ? 'Command unit destroyed' : this.warden?.alerted ? 'Target engaged — put it down' : 'Last seen near the Halcyon reactor',
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

		let threat = 0;
		const dots: { x: number; z: number; boss: boolean }[] = [];
		for (const e of this.enemies.list) {
			if (e.dead) continue;
			const d = e.pos.distanceTo(this.playerPos);
			if (d < 45 && e.alerted) threat++;
			if (d < 90 && (e.alerted || this.mapOpen)) dots.push({ x: e.pos.x, z: e.pos.z, boss: e.kind === 'warden' });
		}
		this.hud.setDistrict(this.world.district(this.playerPos.x, this.playerPos.z), threat);
		const bossNear = !!this.warden && !this.warden.dead && this.warden.alerted && this.warden.pos.distanceTo(this.playerPos) < 90;
		let intensity = Math.min(1, threat / 8) * 0.8 + 0.12;
		if (this.relayState === 'uplinking' || this.extractState === 'holding') intensity = Math.max(intensity, 0.75);
		if (bossNear) intensity = 1;
		this.sound.setIntensity(intensity);

		const markers: (MapMarker & { world: THREE.Vector3; tone: 'gold' | 'green' | 'red'; label: string })[] = [];
		if (this.relayState !== 'done')
			markers.push({ x: 0, z: 0, color: this.relayState === 'uplinking' ? '#7dff9a' : '#e3c15a', label: 'RELAY', world: this.world.relayPos, tone: this.relayState === 'uplinking' ? 'green' : 'gold' });
		if (!this.huntDone) {
			const wp = this.warden && this.warden.alerted && !this.warden.dead ? this.warden.pos : this.world.reactorPos;
			markers.push({ x: 0, z: 0, color: '#ff5a3a', label: 'WARDEN-9', world: wp, tone: 'red' });
		}
		if (this.extractState === 'open' || this.extractState === 'holding')
			markers.push({ x: 0, z: 0, color: '#7dff9a', label: 'EXTRACT', world: this.world.extractionPos, tone: 'green' });
		for (const m of markers) {
			m.x = m.world.x;
			m.z = m.world.z;
		}
		const mapMarkers: MapMarker[] = [...markers];
		for (const s of this.world.supplies) mapMarkers.push({ x: s.pos.x, z: s.pos.z, color: s.used ? '#6a6040' : '#7dff9a', label: 'SUPPLY' });
		this.hud.drawMap(this.playerPos, this.yaw, dots, mapMarkers, BOUND);

		const w = window.innerWidth;
		const h = window.innerHeight;
		this.hud.setMarkers(
			markers.map((m) => {
				const v = m.world
					.clone()
					.setY(m.world.y + (m.label === 'WARDEN-9' && this.warden?.alerted ? 6.5 : 4))
					.project(this.camera);
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

		const wd = this.warden;
		this.hud.setBoss(bossNear && wd ? wd.hp / wd.maxHp : null);

		let prompt: string | null = null;
		let prog = 0;
		const supply = this.nearestSupply();
		if (this.relayState === 'idle' && this.playerPos.distanceTo(this.world.relayPos) < 5) prompt = '<kbd>E</kbd>ACTIVATE UPLINK RELAY';
		else if (supply) prompt = supply.used ? `<kbd>E</kbd>RESUPPLY · ◆ ${RESUPPLY_COST}` : '<kbd>E</kbd>RESUPPLY · FREE';
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

	/** Dynamic resolution: trade pixels for frame rate before the game stutters. */
	private updatePerf(dt: number): void {
		this.fpsEma += (dt - this.fpsEma) * 0.05;
		this.fpsT -= dt;
		if (this.fpsT <= 0) {
			this.fpsT = 0.5;
			this.fpsShown = Math.round(1 / Math.max(1e-3, this.fpsEma));
			this.hud.setFps(this.settings.showFps ? this.fpsShown : null, this.drs);
		}
		this.drsT -= dt;
		if (this.drsT > 0 || this.phase !== 'playing') return;
		this.drsT = 1.5;
		const prev = this.drs;
		if (this.fpsEma > 1 / 42) this.drs = Math.max(0.6, this.drs - 0.1);
		else if (this.fpsEma < 1 / 58) this.drs = Math.min(1, this.drs + 0.05);
		if (this.drs !== prev) this.resize();
	}

	// ── loop ────────────────────────────────────────────────────────────────

	private frame = (now: number): void => {
		requestAnimationFrame(this.frame);
		const raw = (now - this.last) / 1000;
		const dt = Math.min(0.05, raw);
		this.last = now;
		const paused = this.phase === 'paused';
		if (!paused) this.time += dt;
		this.updatePerf(Math.min(0.25, raw));

		if (this.phase === 'playing') {
			this.updatePlayer(dt);
			if (this.vm.gun.spec.auto ? this.mouseDown : this.firePressed) this.fire();
			this.firePressed = false;
			this.enemies.update(dt, this);
			// the player can die mid-frame; don't let a win/fail overwrite it
			if (this.phase === 'playing') this.updateWorldObjects(dt);
			if (this.phase === 'playing') this.updateObjectives(dt);
			this.sound.heartbeat(dt, this.hp);
		} else if (this.phase === 'menu') {
			this.enemies.update(dt, this);
		} else if (this.phase === 'dead' || this.phase === 'won' || this.phase === 'failed') {
			this.enemies.update(dt, this);
			this.updateWorldObjects(dt);
		}

		if (this.phase === 'menu') {
			// slow eye-level push down a wet street toward the waiting robots
			const t = (this.time % 70) / 70;
			this.camera.position.set(25.6 + Math.sin(this.time * 0.21) * 0.3, 1.75 + Math.sin(this.time * 0.37) * 0.05, 57 - t * 7);
			this.camera.lookAt(21.5 + Math.sin(this.time * 0.13) * 1.2, 1.9, 30);
			this.playerPos.set(this.camera.position.x, 0, this.camera.position.z);
			this.playerEye.copy(this.camera.position);
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
			const lean = -this.strafe * 0.012;
			this.camera.rotation.set(this.pitch + this.recoilPitch + rand(-sh, sh), this.yaw + rand(-sh, sh), this.hp <= 0 ? 0.5 : lean);
			const targetFov =
				THREE.MathUtils.lerp(this.settings.fov, this.vm.gun.spec.adsFov * (this.settings.fov / 78), this.vm.adsT) + (this.isSprinting() ? 6 : 0);
			if (Math.abs(this.camera.fov - targetFov) > 0.05) {
				this.camera.fov = damp(this.camera.fov, targetFov, 14, dt);
				this.camera.updateProjectionMatrix();
				this.glow.setScale(this.renderer.domElement.height, this.camera.projectionMatrix.elements[5]);
				this.smoke.setScale(this.renderer.domElement.height, this.camera.projectionMatrix.elements[5]);
			}
		}
		this.cameraPos.copy(this.camera.position);

		if (!paused) this.vm.update(dt, {
			ads: this.rightDown && this.phase === 'playing',
			sprint: this.isSprinting(),
			speed: Math.hypot(this.vel.x, this.vel.z),
			strafe: this.strafe,
			lookDX: this.lookDX,
			lookDY: this.lookDY,
		});
		this.lookDX = this.lookDY = 0;
		const torch = this.torchOn && this.hp > 0;
		this.torch.intensity = torch ? 14 : 0;
		this.vm.setTorch(torch);

		if (this.vm.flashing) {
			this.flashLight.position.copy(this.camera.position);
			this.flashLight.intensity = Math.max(this.flashLight.intensity, 30);
		}
		this.flashLight.intensity = damp(this.flashLight.intensity, 0, 16, dt);

		this.moon.position.set(this.camera.position.x - 40, 90, this.camera.position.z - 60);
		this.moon.target.position.set(this.camera.position.x, 0, this.camera.position.z);
		this.world.update(this.time, dt, this.camera.position);
		this.updateLightning(dt);
		this.updateAmbient();
		this.glow.update(dt);
		this.smoke.update(dt);
		this.chips.update(dt);
		this.streaks.update(dt);
		this.updateRain(dt);
		if (this.phase === 'playing' || this.phase === 'paused') this.updateHud(dt);
		this.sound.setListener(this.camera.position, this.forward());
		this.sound.setHealth(this.phase === 'playing' ? this.hp : 100);
		this.sound.tickMusic();
		this.skyMat.uniforms.uTime.value = this.time;

		const u = this.grade.uniforms as unknown as typeof GradeShader.uniforms;
		u.uTime.value = this.time;
		u.uHurt.value = Math.min(1, this.hurtFlash + (this.phase === 'playing' && this.hp < 35 ? 0.4 : 0));
		u.uFlash.value = this.flashAmt * 0.25;
		this.vmPass.enabled = (this.phase === 'playing' || this.phase === 'paused') && this.hp > 0;
		this.composer.render(dt);
	};
}

export function startDeadSignal(root: HTMLElement, opts: DeadSignalOptions = {}): void {
	new Game(root, opts);
}
