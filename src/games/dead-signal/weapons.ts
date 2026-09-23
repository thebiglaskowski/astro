import * as THREE from 'three';
import { canvasTexture, clamp, damp, glowTexture, makeCanvas, rand } from './util';

export type WeaponId = 'rifle' | 'pistol';

export interface WeaponSpec {
	id: WeaponId;
	name: string;
	auto: boolean;
	interval: number;
	damage: number;
	headMult: number;
	mag: number;
	reserveMax: number;
	reserveStart: number;
	reload: number;
	spreadHip: number;
	spreadAds: number;
	recoil: number;
	adsFov: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
	rifle: {
		id: 'rifle',
		name: 'VK-12 CARBINE',
		auto: true,
		interval: 0.092,
		damage: 27,
		headMult: 2.3,
		mag: 30,
		reserveMax: 240,
		reserveStart: 150,
		reload: 2.1,
		spreadHip: 0.03,
		spreadAds: 0.0035,
		recoil: 0.012,
		adsFov: 42,
	},
	pistol: {
		id: 'pistol',
		name: 'M9-S SIDEARM',
		auto: false,
		interval: 0.14,
		damage: 40,
		headMult: 2.5,
		mag: 12,
		reserveMax: 84,
		reserveStart: 48,
		reload: 1.4,
		spreadHip: 0.018,
		spreadAds: 0.005,
		recoil: 0.028,
		adsFov: 58,
	},
};

interface Gun {
	spec: WeaponSpec;
	ammo: number;
	reserve: number;
	model: THREE.Group;
	mag: THREE.Object3D;
	magY: number;
	muzzle: THREE.Vector3;
	ejector: THREE.Vector3;
	hip: THREE.Vector3;
	ads: THREE.Vector3;
}

type GunParts = Omit<Gun, 'spec' | 'ammo' | 'reserve'>;

const phys = (color: number, rough = 0.5, metal = 0.6, coat = 0) =>
	new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: metal, clearcoat: coat, clearcoatRoughness: 0.3, envMapIntensity: 1.1 });

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
	const mesh = new THREE.Mesh(geo, m);
	mesh.position.set(x, y, z);
	mesh.rotation.set(rx, ry, rz);
	parent.add(mesh);
	return mesh;
}

const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (r: number, len: number, seg = 12, open = false) => new THREE.CylinderGeometry(r, r, len, seg, 1, open).rotateX(Math.PI / 2);

function buildArms(parent: THREE.Object3D, rightGrip: THREE.Vector3, leftGrip: THREE.Vector3): void {
	const sleeve = phys(0x39432a, 0.95, 0);
	const glove = phys(0x1a1b1d, 0.75, 0.05);
	const pad = phys(0x2a2f22, 0.9, 0);
	const limb = (hand: THREE.Vector3, elbow: THREE.Vector3) => {
		part(parent, new THREE.CapsuleGeometry(0.042, 0.05, 3, 8).rotateX(Math.PI / 2), glove, hand.x, hand.y, hand.z);
		const mid = hand.clone().add(elbow).multiplyScalar(0.5);
		const len = hand.distanceTo(elbow);
		const fore = part(parent, new THREE.CapsuleGeometry(0.048, len - 0.06, 3, 10).rotateX(Math.PI / 2), sleeve, mid.x, mid.y, mid.z);
		fore.lookAt(elbow);
		const cuff = part(parent, C(0.05, 0.05, 10), pad, 0, 0, 0);
		cuff.position.copy(hand.clone().lerp(elbow, 0.22));
		cuff.lookAt(elbow);
	};
	limb(rightGrip, new THREE.Vector3(rightGrip.x + 0.1, rightGrip.y - 0.16, rightGrip.z + 0.4));
	limb(leftGrip, new THREE.Vector3(leftGrip.x - 0.2, leftGrip.y - 0.2, leftGrip.z + 0.3));
}

function redDotLens(): THREE.MeshBasicMaterial {
	const tex = canvasTexture(
		128,
		128,
		(g) => {
			const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
			grad.addColorStop(0, 'rgba(60,90,110,0.05)');
			grad.addColorStop(0.85, 'rgba(30,50,70,0.25)');
			grad.addColorStop(1, 'rgba(10,20,30,0.7)');
			g.fillStyle = grad;
			g.beginPath();
			g.arc(64, 64, 64, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = '#ff2a2a';
			g.shadowColor = '#ff2a2a';
			g.shadowBlur = 12;
			g.beginPath();
			g.arc(64, 64, 4.5, 0, Math.PI * 2);
			g.fill();
		},
		{ repeat: false },
	);
	return new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
}

/** Tiny emissive screen on the receiver that shows rounds left. */
class AmmoScreen {
	readonly mesh: THREE.Mesh;
	private readonly ctx: CanvasRenderingContext2D;
	private readonly tex: THREE.CanvasTexture;
	private shown = -1;
	constructor() {
		const [c, g] = makeCanvas(64, 32);
		this.ctx = g;
		this.tex = new THREE.CanvasTexture(c);
		this.tex.colorSpace = THREE.SRGBColorSpace;
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.025), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
	}
	set(n: number, mag: number): void {
		if (n === this.shown) return;
		this.shown = n;
		const g = this.ctx;
		g.fillStyle = '#050807';
		g.fillRect(0, 0, 64, 32);
		const low = n <= mag * 0.25;
		g.fillStyle = low ? '#ff3a2a' : '#6affb0';
		g.font = 'bold 24px ui-monospace, Menlo, monospace';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(String(n).padStart(2, '0'), 32, 17);
		g.fillStyle = low ? 'rgba(255,58,42,0.35)' : 'rgba(106,255,176,0.35)';
		g.fillRect(4, 28, 56 * (n / mag), 2);
		this.tex.needsUpdate = true;
	}
}

function buildRifle(screen: AmmoScreen, torch: THREE.MeshBasicMaterial): GunParts {
	const g = new THREE.Group();
	const metal = phys(0x2e3136, 0.38, 0.75, 0.3);
	const olive = phys(0x434d31, 0.7, 0.15);
	const black = phys(0x151618, 0.6, 0.35);
	part(g, B(0.07, 0.1, 0.42), metal, 0, 0, 0);
	part(g, B(0.072, 0.03, 0.1), black, 0, 0.02, 0.04); // ejection port cover
	part(g, B(0.078, 0.085, 0.3), olive, 0, 0.004, -0.34);
	for (let k = 0; k < 5; k++) part(g, B(0.082, 0.012, 0.03), black, 0, 0.05, -0.23 - k * 0.05);
	for (let k = 0; k < 9; k++) part(g, B(0.03, 0.012, 0.018), black, 0, 0.056, 0.18 - k * 0.05); // top rail teeth
	part(g, C(0.015, 0.26), metal, 0, 0.01, -0.6);
	const hider = part(g, C(0.024, 0.08, 6), black, 0, 0.01, -0.76);
	hider.rotation.z = Math.PI / 6;
	part(g, B(0.03, 0.1, 0.035), black, 0, -0.08, -0.38, 0.35); // angled foregrip
	const mag = part(g, B(0.05, 0.17, 0.085), black, 0, -0.12, -0.07, 0.22);
	part(g, B(0.045, 0.12, 0.06), black, 0, -0.1, 0.13, -0.35);
	part(g, B(0.05, 0.085, 0.24), olive, 0, -0.015, 0.31);
	part(g, B(0.055, 0.12, 0.04), black, 0, -0.02, 0.43);
	part(g, B(0.012, 0.018, 0.06), metal, -0.04, 0.03, 0.14); // charging handle
	// tac light on the side rail
	part(g, C(0.017, 0.09, 12), black, 0.05, 0.0, -0.42);
	const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), torch);
	lens.position.set(0.05, 0, -0.466);
	lens.rotation.y = Math.PI;
	g.add(lens);
	// optic: open-ended tubes so ADS looks through it
	const tube = new THREE.MeshPhysicalMaterial({ color: 0x131416, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide, envMapIntensity: 1 });
	part(g, C(0.022, 0.2, 20, true), tube, 0, 0.105, -0.02);
	part(g, C(0.031, 0.06, 20, true), tube, 0, 0.105, -0.14);
	part(g, C(0.028, 0.04, 20, true), tube, 0, 0.105, 0.1);
	part(g, B(0.03, 0.05, 0.03), metal, 0, 0.065, -0.07);
	part(g, B(0.03, 0.05, 0.03), metal, 0, 0.065, 0.05);
	part(g, B(0.02, 0.02, 0.03), black, 0.028, 0.105, 0.0); // turret
	const dot = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), redDotLens());
	dot.position.set(0, 0.105, 0.121);
	g.add(dot);
	screen.mesh.position.set(-0.0365, 0.02, -0.02);
	screen.mesh.rotation.y = -Math.PI / 2;
	g.add(screen.mesh);
	buildArms(g, new THREE.Vector3(0.0, -0.13, 0.15), new THREE.Vector3(0, -0.07, -0.37));
	return {
		model: g,
		mag,
		magY: -0.12,
		muzzle: new THREE.Vector3(0, 0.01, -0.82),
		ejector: new THREE.Vector3(0.04, 0.02, 0.04),
		hip: new THREE.Vector3(0.19, -0.2, -0.5),
		ads: new THREE.Vector3(0, -0.105, -0.42),
	};
}

function buildPistol(): GunParts {
	const g = new THREE.Group();
	const metal = phys(0x2b2d30, 0.3, 0.85, 0.4);
	const black = phys(0x151617, 0.7, 0.2);
	part(g, B(0.04, 0.045, 0.21), metal, 0, 0, -0.05);
	for (let k = 0; k < 6; k++) part(g, B(0.042, 0.03, 0.005), black, 0, 0.005, 0.02 + k * 0.009); // slide serrations
	part(g, B(0.038, 0.03, 0.18), black, 0, -0.035, -0.04);
	const mag = part(g, B(0.034, 0.12, 0.05), black, 0, -0.1, 0.04, -0.25);
	part(g, B(0.008, 0.015, 0.008), metal, 0, 0.03, -0.15);
	part(g, B(0.03, 0.015, 0.008), metal, 0, 0.03, 0.05);
	const dot = new THREE.Mesh(B(0.004, 0.004, 0.002), new THREE.MeshBasicMaterial({ color: 0x9aff6a, toneMapped: false }));
	dot.position.set(0, 0.039, -0.154);
	g.add(dot);
	buildArms(g, new THREE.Vector3(0.01, -0.1, 0.06), new THREE.Vector3(-0.03, -0.11, 0.04));
	return {
		model: g,
		mag,
		magY: -0.1,
		muzzle: new THREE.Vector3(0, 0.005, -0.17),
		ejector: new THREE.Vector3(0.025, 0.02, -0.03),
		hip: new THREE.Vector3(0.17, -0.16, -0.38),
		ads: new THREE.Vector3(0, -0.033, -0.3),
	};
}

interface Casing {
	mesh: THREE.Mesh;
	vel: THREE.Vector3;
	spin: THREE.Vector3;
	life: number;
}

export interface ViewInput {
	ads: boolean;
	sprint: boolean;
	speed: number;
	strafe: number;
	lookDX: number;
	lookDY: number;
}

export class Viewmodel {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
	readonly guns: Record<WeaponId, Gun>;
	current: WeaponId = 'rifle';
	adsT = 0;
	reloadT = 0;
	meleeT = 0;
	private readonly holder = new THREE.Group();
	private readonly flash: THREE.Sprite;
	private readonly star: THREE.Mesh;
	private readonly flashLight: THREE.PointLight;
	private readonly screen = new AmmoScreen();
	private readonly torch = new THREE.MeshBasicMaterial({ color: 0xfff4dd, toneMapped: false });
	private readonly casings: Casing[] = [];
	private readonly casingGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.028, 8).rotateZ(Math.PI / 2);
	private readonly casingMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
	private flashT = 0;
	private cooldown = 0;
	private meleeCd = 0;
	private switchT = 0;
	private pendingSwitch: WeaponId | null = null;
	private bobPhase = 0;
	private sway = new THREE.Vector2();
	private kick = 0;
	private kickRot = 0;
	private sprintT = 0;
	private tilt = 0;
	private landDip = 0;

	constructor() {
		const mk = (id: WeaponId, parts: GunParts): Gun => ({
			spec: WEAPONS[id],
			ammo: WEAPONS[id].mag,
			reserve: WEAPONS[id].reserveStart,
			...parts,
		});
		this.guns = { rifle: mk('rifle', buildRifle(this.screen, this.torch)), pistol: mk('pistol', buildPistol()) };
		this.holder.add(this.guns.rifle.model, this.guns.pistol.model);
		this.guns.pistol.model.visible = false;
		this.scene.add(this.holder);

		this.scene.add(new THREE.HemisphereLight(0x6d80a8, 0x121218, 0.45));
		const key = new THREE.DirectionalLight(0xffd6a8, 0.6);
		key.position.set(-1, 2, 1);
		const rim = new THREE.DirectionalLight(0x6fa0ff, 0.5);
		rim.position.set(1.5, 0.5, -1);
		this.scene.add(key, rim);
		this.flashLight = new THREE.PointLight(0xffa04a, 0, 2.5, 2);
		this.scene.add(this.flashLight);
		this.flash = new THREE.Sprite(
			new THREE.SpriteMaterial({
				map: glowTexture('rgba(255,220,160,1)', 'rgba(255,120,40,0)'),
				blending: THREE.AdditiveBlending,
				transparent: true,
				depthWrite: false,
				toneMapped: false,
			}),
		);
		this.flash.scale.setScalar(0.26);
		this.flash.visible = false;
		this.scene.add(this.flash);
		const starTex = canvasTexture(
			128,
			128,
			(g) => {
				g.translate(64, 64);
				for (let k = 0; k < 5; k++) {
					g.rotate((Math.PI * 2) / 5);
					const grad = g.createLinearGradient(0, 0, 0, -62);
					grad.addColorStop(0, 'rgba(255,240,200,1)');
					grad.addColorStop(1, 'rgba(255,120,30,0)');
					g.fillStyle = grad;
					g.beginPath();
					g.moveTo(-7, 0);
					g.lineTo(0, -62 + Math.random() * 18);
					g.lineTo(7, 0);
					g.fill();
				}
			},
			{ repeat: false },
		);
		this.star = new THREE.Mesh(
			new THREE.PlaneGeometry(0.3, 0.3),
			new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
		);
		this.star.visible = false;
		this.scene.add(this.star);
	}

	get gun(): Gun {
		return this.guns[this.current];
	}
	get busy(): boolean {
		return this.reloadT > 0 || this.switchT > 0 || this.meleeT > 0;
	}
	get flashing(): boolean {
		return this.flashT > 0;
	}

	setEnvironment(env: THREE.Texture | null): void {
		this.scene.environment = env;
	}

	setTorch(on: boolean): void {
		this.torch.color.setHex(on ? 0xfff4dd : 0x1a1a1a);
	}

	reset(): void {
		for (const id of ['rifle', 'pistol'] as const) {
			this.guns[id].ammo = WEAPONS[id].mag;
			this.guns[id].reserve = WEAPONS[id].reserveStart;
			this.guns[id].mag.position.y = this.guns[id].magY;
		}
		this.setCurrent('rifle');
		this.reloadT = this.switchT = this.cooldown = this.meleeT = 0;
		this.pendingSwitch = null;
		for (const c of this.casings) this.scene.remove(c.mesh);
		this.casings.length = 0;
	}

	private setCurrent(id: WeaponId): void {
		this.current = id;
		this.guns.rifle.model.visible = id === 'rifle';
		this.guns.pistol.model.visible = id === 'pistol';
	}

	switchTo(id: WeaponId): boolean {
		const target = this.pendingSwitch ?? this.current;
		if (id === target || this.meleeT > 0) return false;
		this.reloadT = 0;
		this.gun.mag.position.y = this.gun.magY;
		this.pendingSwitch = id;
		this.switchT = 0.5;
		return true;
	}

	startReload(): boolean {
		const g = this.gun;
		if (this.busy || g.ammo >= g.spec.mag || g.reserve <= 0) return false;
		this.reloadT = g.spec.reload;
		return true;
	}

	/** Rifle-butt / pistol-whip strike. Returns true when the swing starts. */
	melee(): boolean {
		if (this.meleeCd > 0 || this.switchT > 0) return false;
		this.reloadT = 0;
		this.gun.mag.position.y = this.gun.magY;
		this.meleeT = 0.42;
		this.meleeCd = 0.75;
		return true;
	}

	land(strength: number): void {
		this.landDip = Math.min(0.08, this.landDip + strength * 0.012);
	}

	tryFire(sprinting: boolean): 'fired' | 'empty' | 'blocked' {
		if (this.cooldown > 0 || this.busy || sprinting) return 'blocked';
		const g = this.gun;
		if (g.ammo <= 0) {
			this.cooldown = 0.25;
			return 'empty';
		}
		g.ammo--;
		this.cooldown = g.spec.interval;
		this.kick += 0.035;
		this.kickRot += g.spec.recoil * 6;
		this.flashT = 0.05;
		this.flash.material.rotation = Math.random() * Math.PI;
		this.star.rotation.z = Math.random() * Math.PI;
		this.star.scale.setScalar(rand(0.7, 1.2));
		this.eject();
		return 'fired';
	}

	private eject(): void {
		const g = this.gun;
		this.holder.updateMatrixWorld();
		const p = g.ejector.clone();
		g.model.localToWorld(p);
		const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
		mesh.position.copy(p);
		this.scene.add(mesh);
		this.casings.push({
			mesh,
			vel: new THREE.Vector3(rand(0.9, 1.5), rand(0.6, 1.1), rand(0.1, 0.4)),
			spin: new THREE.Vector3(rand(-30, 30), rand(-30, 30), rand(-30, 30)),
			life: 0.7,
		});
		if (this.casings.length > 16) {
			const old = this.casings.shift();
			if (old) this.scene.remove(old.mesh);
		}
	}

	update(dt: number, o: ViewInput): void {
		this.cooldown = Math.max(0, this.cooldown - dt);
		this.meleeCd = Math.max(0, this.meleeCd - dt);
		const g = this.gun;
		this.screen.set(this.guns.rifle.ammo, WEAPONS.rifle.mag);

		if (this.switchT > 0) {
			const before = this.switchT;
			this.switchT -= dt;
			if (before > 0.25 && this.switchT <= 0.25 && this.pendingSwitch) {
				this.setCurrent(this.pendingSwitch);
				this.pendingSwitch = null;
			}
			if (this.switchT < 0) this.switchT = 0;
		}
		let reloadPose = 0;
		if (this.reloadT > 0) {
			this.reloadT -= dt;
			const p = 1 - this.reloadT / g.spec.reload;
			reloadPose = Math.sin(clamp(p, 0, 1) * Math.PI);
			const drop = p > 0.12 && p < 0.62 ? Math.sin(((p - 0.12) / 0.5) * Math.PI) * 0.28 : 0;
			g.mag.position.y = g.magY - drop;
			if (this.reloadT <= 0) {
				this.reloadT = 0;
				g.mag.position.y = g.magY;
				const take = Math.min(g.spec.mag - g.ammo, g.reserve);
				g.ammo += take;
				g.reserve -= take;
			}
		}
		let meleePose = 0;
		if (this.meleeT > 0) {
			this.meleeT = Math.max(0, this.meleeT - dt);
			const p = 1 - this.meleeT / 0.42;
			meleePose = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65);
		}

		const wantAds = o.ads && !o.sprint && this.reloadT <= 0 && this.switchT <= 0 && this.meleeT <= 0;
		this.adsT = damp(this.adsT, wantAds ? 1 : 0, 16, dt);
		this.sprintT = damp(this.sprintT, o.sprint && o.speed > 1 ? 1 : 0, 8, dt);
		this.bobPhase += dt * o.speed * 1.7;
		const bobAmt = (1 - this.adsT * 0.85) * Math.min(1, o.speed / 5);
		this.sway.x = damp(this.sway.x, clamp(-o.lookDX * 0.0004, -0.04, 0.04), 10, dt);
		this.sway.y = damp(this.sway.y, clamp(o.lookDY * 0.0004, -0.04, 0.04), 10, dt);
		this.tilt = damp(this.tilt, -o.strafe * 0.06 * (1 - this.adsT * 0.7), 8, dt);
		this.kick = damp(this.kick, 0, 18, dt);
		this.kickRot = damp(this.kickRot, 0, 12, dt);
		this.landDip = damp(this.landDip, 0, 9, dt);

		const switchDip = this.switchT > 0 ? Math.sin((this.switchT / 0.5) * Math.PI) * 0.3 : 0;
		const pos = g.hip.clone().lerp(g.ads, this.adsT);
		pos.x += Math.sin(this.bobPhase) * 0.012 * bobAmt + this.sway.x * (1 - this.adsT * 0.7) - this.sprintT * 0.05 - meleePose * 0.12;
		pos.y +=
			-Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt +
			this.sway.y * (1 - this.adsT * 0.7) -
			reloadPose * 0.08 -
			switchDip -
			this.sprintT * 0.04 -
			this.landDip +
			meleePose * 0.04;
		pos.z += this.kick - meleePose * 0.22;
		this.holder.position.copy(pos);
		this.holder.rotation.set(
			this.kickRot + reloadPose * 0.3 - this.sprintT * 0.25 + meleePose * 0.25,
			this.sprintT * 0.6 + meleePose * 0.9,
			reloadPose * 0.5 + this.sway.x * 3 + this.tilt + meleePose * 0.5,
		);

		this.flashT -= dt;
		const showFlash = this.flashT > 0;
		this.flash.visible = this.star.visible = showFlash;
		this.flashLight.intensity = showFlash ? 4 : 0;
		if (showFlash) {
			this.holder.updateMatrixWorld();
			const m = g.muzzle.clone();
			g.model.localToWorld(m);
			this.flash.position.copy(m);
			this.star.position.copy(m);
			this.star.lookAt(0, 0, 0);
			this.flashLight.position.copy(m);
		}

		for (let i = this.casings.length - 1; i >= 0; i--) {
			const c = this.casings[i];
			c.life -= dt;
			c.vel.y -= 5 * dt;
			c.mesh.position.addScaledVector(c.vel, dt);
			c.mesh.rotation.x += c.spin.x * dt;
			c.mesh.rotation.y += c.spin.y * dt;
			c.mesh.rotation.z += c.spin.z * dt;
			if (c.life <= 0) {
				this.scene.remove(c.mesh);
				this.casings.splice(i, 1);
			}
		}
	}

	setAspect(a: number): void {
		this.camera.aspect = a;
		this.camera.updateProjectionMatrix();
	}
}
