import * as THREE from 'three';
import { canvasTexture, clamp, damp, glowTexture } from './util';

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
		interval: 0.095,
		damage: 26,
		headMult: 2.2,
		mag: 30,
		reserveMax: 210,
		reload: 2.1,
		spreadHip: 0.03,
		spreadAds: 0.004,
		recoil: 0.012,
		adsFov: 42,
	},
	pistol: {
		id: 'pistol',
		name: 'M9-S SIDEARM',
		auto: false,
		interval: 0.15,
		damage: 38,
		headMult: 2.5,
		mag: 12,
		reserveMax: 72,
		reload: 1.4,
		spreadHip: 0.018,
		spreadAds: 0.006,
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
	muzzle: THREE.Vector3;
	hip: THREE.Vector3;
	ads: THREE.Vector3;
}

const mat = (color: number, rough = 0.6, metal = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

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
	const sleeve = mat(0x3a4526, 0.9, 0);
	const glove = mat(0x1c1d1f, 0.8, 0);
	const limb = (hand: THREE.Vector3, elbow: THREE.Vector3) => {
		part(parent, B(0.075, 0.085, 0.1), glove, hand.x, hand.y, hand.z);
		const mid = hand.clone().add(elbow).multiplyScalar(0.5);
		const len = hand.distanceTo(elbow);
		const fore = part(parent, B(0.09, 0.09, len), sleeve, mid.x, mid.y, mid.z);
		fore.lookAt(parent.localToWorld(elbow.clone()));
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
			grad.addColorStop(0, 'rgba(40,60,70,0.06)');
			grad.addColorStop(1, 'rgba(10,20,30,0.45)');
			g.fillStyle = grad;
			g.beginPath();
			g.arc(64, 64, 64, 0, Math.PI * 2);
			g.fill();
			g.fillStyle = '#ff2a2a';
			g.shadowColor = '#ff2a2a';
			g.shadowBlur = 10;
			g.beginPath();
			g.arc(64, 64, 5, 0, Math.PI * 2);
			g.fill();
		},
		{ repeat: false },
	);
	return new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false });
}

function buildRifle(): Omit<Gun, 'spec' | 'ammo' | 'reserve'> {
	const g = new THREE.Group();
	const metal = mat(0x383b40, 0.45, 0.6);
	const olive = mat(0x3f4a2e, 0.8, 0.1);
	const black = mat(0x141516, 0.7, 0.3);
	part(g, B(0.07, 0.1, 0.42), metal, 0, 0, 0);
	part(g, B(0.078, 0.085, 0.3), olive, 0, 0.004, -0.34);
	for (let k = 0; k < 5; k++) part(g, B(0.08, 0.012, 0.03), black, 0, 0.05, -0.23 - k * 0.05);
	part(g, C(0.015, 0.26), metal, 0, 0.01, -0.6);
	part(g, C(0.023, 0.07, 8), black, 0, 0.01, -0.75);
	const mag = part(g, B(0.05, 0.17, 0.085), black, 0, -0.12, -0.07, 0.22);
	part(g, B(0.045, 0.12, 0.06), black, 0, -0.1, 0.13, -0.35);
	part(g, B(0.05, 0.085, 0.24), olive, 0, -0.015, 0.31);
	part(g, B(0.055, 0.12, 0.04), black, 0, -0.02, 0.43);
	// scope
	// open-ended tubes so aiming down sights looks through the optic, not at its end caps
	const tube = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
	part(g, C(0.022, 0.2, 16, true), tube, 0, 0.105, -0.02);
	part(g, C(0.031, 0.06, 16, true), tube, 0, 0.105, -0.14);
	part(g, C(0.028, 0.04, 16, true), tube, 0, 0.105, 0.1);
	part(g, B(0.03, 0.05, 0.03), metal, 0, 0.065, -0.07);
	part(g, B(0.03, 0.05, 0.03), metal, 0, 0.065, 0.05);
	const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24), redDotLens());
	lens.position.set(0, 0.105, 0.121);
	g.add(lens);
	buildArms(g, new THREE.Vector3(0.0, -0.13, 0.15), new THREE.Vector3(0, -0.06, -0.36));
	return {
		model: g,
		mag,
		muzzle: new THREE.Vector3(0, 0.01, -0.8),
		hip: new THREE.Vector3(0.19, -0.2, -0.5),
		ads: new THREE.Vector3(0, -0.105, -0.42),
	};
}

function buildPistol(): Omit<Gun, 'spec' | 'ammo' | 'reserve'> {
	const g = new THREE.Group();
	const metal = mat(0x2b2d30, 0.35, 0.8);
	const black = mat(0x151617, 0.8, 0.2);
	part(g, B(0.04, 0.045, 0.21), metal, 0, 0, -0.05);
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
		muzzle: new THREE.Vector3(0, 0.005, -0.17),
		hip: new THREE.Vector3(0.17, -0.16, -0.38),
		ads: new THREE.Vector3(0, -0.033, -0.3),
	};
}

export class Viewmodel {
	readonly scene = new THREE.Scene();
	readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
	readonly guns: Record<WeaponId, Gun>;
	current: WeaponId = 'rifle';
	adsT = 0;
	reloadT = 0;
	private readonly holder = new THREE.Group();
	private readonly flash: THREE.Sprite;
	private readonly flashLight: THREE.PointLight;
	private flashT = 0;
	private cooldown = 0;
	private switchT = 0;
	private pendingSwitch: WeaponId | null = null;
	private bobPhase = 0;
	private sway = new THREE.Vector2();
	private kick = 0;
	private kickRot = 0;
	private sprintT = 0;

	constructor() {
		const mk = (id: WeaponId, parts: Omit<Gun, 'spec' | 'ammo' | 'reserve'>): Gun => ({
			spec: WEAPONS[id],
			ammo: WEAPONS[id].mag,
			reserve: id === 'rifle' ? 120 : 48,
			...parts,
		});
		this.guns = { rifle: mk('rifle', buildRifle()), pistol: mk('pistol', buildPistol()) };
		this.holder.add(this.guns.rifle.model, this.guns.pistol.model);
		this.guns.pistol.model.visible = false;
		this.scene.add(this.holder);

		this.scene.add(new THREE.HemisphereLight(0x6d80a8, 0x121218, 0.6));
		const key = new THREE.DirectionalLight(0xffd6a8, 0.7);
		key.position.set(-1, 2, 1);
		this.scene.add(key);
		this.flashLight = new THREE.PointLight(0xffa04a, 0, 2, 2);
		this.scene.add(this.flashLight);
		this.flash = new THREE.Sprite(
			new THREE.SpriteMaterial({
				map: glowTexture('rgba(255,210,140,1)', 'rgba(255,120,40,0)'),
				blending: THREE.AdditiveBlending,
				transparent: true,
				depthWrite: false,
				toneMapped: false,
			}),
		);
		this.flash.scale.setScalar(0.22);
		this.flash.visible = false;
		this.scene.add(this.flash);
	}

	get gun(): Gun {
		return this.guns[this.current];
	}
	get busy(): boolean {
		return this.reloadT > 0 || this.switchT > 0;
	}

	reset(): void {
		for (const id of ['rifle', 'pistol'] as const) {
			this.guns[id].ammo = WEAPONS[id].mag;
			this.guns[id].reserve = id === 'rifle' ? 120 : 48;
		}
		this.setCurrent('rifle');
		this.reloadT = this.switchT = this.cooldown = 0;
		this.pendingSwitch = null;
	}

	private setCurrent(id: WeaponId): void {
		this.current = id;
		this.guns.rifle.model.visible = id === 'rifle';
		this.guns.pistol.model.visible = id === 'pistol';
	}

	switchTo(id: WeaponId): boolean {
		if (id === this.current && !this.pendingSwitch) return false;
		this.reloadT = 0;
		this.guns[this.current].mag.position.y = this.current === 'rifle' ? -0.12 : -0.1;
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

	/** Returns true when a round actually leaves the barrel. */
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
		this.flashT = 0.045;
		this.flash.material.rotation = Math.random() * Math.PI;
		return 'fired';
	}

	update(dt: number, o: { ads: boolean; sprint: boolean; speed: number; lookDX: number; lookDY: number }): void {
		this.cooldown = Math.max(0, this.cooldown - dt);
		const g = this.gun;

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
			const drop = p > 0.15 && p < 0.6 ? Math.sin(((p - 0.15) / 0.45) * Math.PI) * 0.25 : 0;
			g.mag.position.y = (this.current === 'rifle' ? -0.12 : -0.1) - drop;
			if (this.reloadT <= 0) {
				this.reloadT = 0;
				const need = g.spec.mag - g.ammo;
				const take = Math.min(need, g.reserve);
				g.ammo += take;
				g.reserve -= take;
			}
		}

		const wantAds = o.ads && !o.sprint && this.reloadT <= 0 && this.switchT <= 0;
		this.adsT = damp(this.adsT, wantAds ? 1 : 0, 16, dt);
		this.sprintT = damp(this.sprintT, o.sprint && o.speed > 1 ? 1 : 0, 8, dt);
		this.bobPhase += dt * o.speed * 1.7;
		const bobAmt = (1 - this.adsT * 0.85) * Math.min(1, o.speed / 5);
		this.sway.x = damp(this.sway.x, clamp(-o.lookDX * 0.0004, -0.04, 0.04), 10, dt);
		this.sway.y = damp(this.sway.y, clamp(o.lookDY * 0.0004, -0.04, 0.04), 10, dt);
		this.kick = damp(this.kick, 0, 18, dt);
		this.kickRot = damp(this.kickRot, 0, 12, dt);

		const switchDip = this.switchT > 0 ? Math.sin((this.switchT / 0.5) * Math.PI) * 0.3 : 0;
		const pos = g.hip.clone().lerp(g.ads, this.adsT);
		pos.x += Math.sin(this.bobPhase) * 0.012 * bobAmt + this.sway.x * (1 - this.adsT * 0.7) + this.sprintT * -0.05;
		pos.y += -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt + this.sway.y * (1 - this.adsT * 0.7) - reloadPose * 0.08 - switchDip - this.sprintT * 0.04;
		pos.z += this.kick;
		this.holder.position.copy(pos);
		this.holder.rotation.set(this.kickRot + reloadPose * 0.3 - this.sprintT * 0.25, this.sprintT * 0.6, reloadPose * 0.5 + this.sway.x * 3);

		this.flashT -= dt;
		const showFlash = this.flashT > 0;
		this.flash.visible = showFlash;
		this.flashLight.intensity = showFlash ? 3 : 0;
		if (showFlash) {
			this.holder.updateMatrixWorld();
			const m = g.muzzle.clone();
			g.model.localToWorld(m);
			this.flash.position.copy(m);
			this.flashLight.position.copy(m);
		}
	}

	get flashing(): boolean {
		return this.flashT > 0;
	}

	setAspect(a: number): void {
		this.camera.aspect = a;
		this.camera.updateProjectionMatrix();
	}
}
