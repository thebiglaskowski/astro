import * as THREE from 'three';
import { type AABB, damp, rand, rayAABB, raySphere, wrapAngle } from './util';
import type { World } from './world';

export type EnemyKind = 'husk' | 'stalker' | 'gunner' | 'warden';

interface Spec {
	hp: number;
	speed: number;
	scale: number;
	skin: number;
	cloth: number;
	eye: number;
	damage: number;
	reach: number;
	cooldown: number;
	reward: number;
	sight: number;
}

const SPEC: Record<EnemyKind, Spec> = {
	husk: { hp: 70, speed: 3.1, scale: 1, skin: 0x6f6b2c, cloth: 0x3d3a1d, eye: 0xffd84a, damage: 14, reach: 1.7, cooldown: 1.1, reward: 10, sight: 30 },
	stalker: { hp: 40, speed: 6.4, scale: 0.9, skin: 0x2f3236, cloth: 0x17191c, eye: 0xff4a3a, damage: 9, reach: 1.6, cooldown: 0.7, reward: 15, sight: 40 },
	gunner: { hp: 95, speed: 2.7, scale: 1.05, skin: 0x3c4b5c, cloth: 0x1c242e, eye: 0x4ad8ff, damage: 11, reach: 30, cooldown: 2.1, reward: 25, sight: 45 },
	warden: { hp: 1800, speed: 2.5, scale: 2.5, skin: 0x5a3322, cloth: 0x2a1810, eye: 0xff2a10, damage: 32, reach: 4.2, cooldown: 1.7, reward: 500, sight: 60 },
};

export interface EnemyHost {
	world: World;
	playerPos: THREE.Vector3;
	playerEye: THREE.Vector3;
	playerAlive(): boolean;
	damagePlayer(amount: number, from: THREE.Vector3): void;
	onEnemyKilled(e: Enemy, headshot: boolean): void;
	onBossSummon(pos: THREE.Vector3): void;
	sparks(pos: THREE.Vector3, color: number, count: number, speed?: number): void;
	sfx(name: 'groan' | 'bolt' | 'swipe' | 'roar', pos: THREE.Vector3): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const GEO = {
	leg: box(0.26, 0.9, 0.3).translate(0, -0.45, 0),
	torso: box(0.72, 0.8, 0.42),
	arm: box(0.22, 0.82, 0.24).translate(0, -0.4, 0),
	head: box(0.44, 0.44, 0.44),
	eye: box(0.1, 0.05, 0.03),
	gun: box(0.12, 0.14, 0.8),
	rib: box(0.74, 0.06, 0.44),
};

export class Enemy {
	readonly kind: EnemyKind;
	readonly spec: Spec;
	readonly root = new THREE.Group();
	readonly body = new THREE.Group();
	readonly pos: THREE.Vector3;
	hp: number;
	dead = false;
	deadTime = 0;
	alerted = false;
	facing = 0;
	private legs: THREE.Object3D[] = [];
	private arms: THREE.Object3D[] = [];
	private skinMat: THREE.MeshStandardMaterial;
	private flash = 0;
	private cooldown = rand(0.5, 1.5);
	private windup = 0;
	private stride = Math.random() * 10;
	private losTimer = Math.random() * 0.5;
	private hasLos = false;
	private detour = 0;
	private detourSign = 1;
	private lastPos = new THREE.Vector3();
	private stuckTimer = 0;
	private groanTimer = rand(3, 9);
	private strafe = Math.random() < 0.5 ? 1 : -1;
	private volleyTimer = 5;
	private summonTimer = 18;
	private wander = new THREE.Vector3();
	private wanderTimer = 0;
	private knock = new THREE.Vector3();

	constructor(kind: EnemyKind, at: THREE.Vector3) {
		this.kind = kind;
		this.spec = SPEC[kind];
		this.hp = this.spec.hp;
		this.pos = at.clone();
		this.lastPos.copy(at);
		this.facing = Math.random() * Math.PI * 2;

		const s = this.spec;
		this.skinMat = new THREE.MeshStandardMaterial({ color: s.skin, roughness: 0.85, emissive: 0x000000 });
		const cloth = new THREE.MeshStandardMaterial({ color: s.cloth, roughness: 1 });
		const eye = new THREE.MeshBasicMaterial({ color: s.eye, toneMapped: false });
		const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
			const o = new THREE.Mesh(g, m);
			o.position.set(x, y, z);
			o.castShadow = true;
			parent.add(o);
			return o;
		};
		for (const side of [-1, 1]) {
			const hip = new THREE.Group();
			hip.position.set(side * 0.18, 0.92, 0);
			mesh(GEO.leg, cloth, 0, 0, 0, hip);
			this.body.add(hip);
			this.legs.push(hip);
			const sh = new THREE.Group();
			sh.position.set(side * 0.48, 1.64, 0);
			mesh(GEO.arm, this.skinMat, 0, 0, 0, sh);
			this.body.add(sh);
			this.arms.push(sh);
		}
		mesh(GEO.torso, this.skinMat, 0, 1.32, 0);
		mesh(GEO.rib, cloth, 0, 1.12, 0.01);
		mesh(GEO.rib, cloth, 0, 1.45, 0.01).rotation.z = 0.15;
		mesh(GEO.head, this.skinMat, 0, 1.98, 0.02);
		mesh(GEO.eye, eye, -0.1, 2.02, 0.245);
		mesh(GEO.eye, eye, 0.1, 2.02, 0.245);
		if (kind === 'gunner') {
			const gun = mesh(GEO.gun, cloth, 0, -0.75, 0.3, this.arms[1]);
			gun.rotation.x = Math.PI / 2;
		}
		if (kind === 'warden') {
			// armour plates and a glowing chest core
			const plate = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.7 });
			mesh(box(0.9, 0.3, 0.5), plate, 0, 1.75, 0);
			mesh(box(0.3, 0.3, 0.3), plate, -0.55, 1.8, 0);
			mesh(box(0.3, 0.3, 0.3), plate, 0.55, 1.8, 0);
			mesh(box(0.2, 0.2, 0.05), eye, 0, 1.35, 0.23);
		}
		this.body.scale.setScalar(s.scale);
		this.root.add(this.body);
		this.root.position.copy(this.pos);
	}

	get headCenter(): THREE.Vector3 {
		return new THREE.Vector3(this.pos.x, this.pos.y + 1.98 * this.spec.scale, this.pos.z);
	}
	get chest(): THREE.Vector3 {
		return new THREE.Vector3(this.pos.x, this.pos.y + 1.3 * this.spec.scale, this.pos.z);
	}
	bodyBox(): AABB {
		const r = 0.42 * this.spec.scale;
		return { minX: this.pos.x - r, maxX: this.pos.x + r, minZ: this.pos.z - r, maxZ: this.pos.z + r, h: this.pos.y + 1.75 * this.spec.scale };
	}

	hurt(amount: number, from: THREE.Vector3): boolean {
		if (this.dead) return false;
		this.hp -= amount;
		this.flash = 0.08;
		this.alerted = true;
		const push = new THREE.Vector3().subVectors(this.pos, from).setY(0).normalize();
		this.knock.addScaledVector(push, this.kind === 'warden' ? 0.3 : 2.2);
		if (this.hp <= 0) {
			this.dead = true;
			this.hp = 0;
			return true;
		}
		return false;
	}

	update(dt: number, host: EnemyHost, bolts: BoltSystem): void {
		const s = this.spec;
		this.flash = Math.max(0, this.flash - dt);
		this.skinMat.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);
		this.skinMat.emissiveIntensity = this.flash > 0 ? 0.6 : 0;

		if (this.dead) {
			this.deadTime += dt;
			this.body.rotation.x = damp(this.body.rotation.x, -Math.PI / 2, 6, dt);
			this.body.position.y = damp(this.body.position.y, 0.25 * s.scale, 6, dt);
			if (this.deadTime > 3) this.body.position.y -= dt * 0.5;
			this.root.position.copy(this.pos);
			return;
		}

		const toPlayer = new THREE.Vector3().subVectors(host.playerPos, this.pos).setY(0);
		const dist = toPlayer.length();

		this.losTimer -= dt;
		if (this.losTimer <= 0) {
			this.losTimer = 0.35;
			this.hasLos = dist < s.sight && host.world.hasLineOfSight(this.chest, host.playerEye);
			if (this.hasLos && dist < s.sight * 0.8) this.alerted = true;
		}
		if (!host.playerAlive()) this.alerted = false;

		let moveDir = new THREE.Vector3();
		let speed = 0;
		if (this.alerted) {
			const want = toPlayer.clone().normalize();
			if (this.kind === 'gunner') {
				if (dist > 20 || !this.hasLos) {
					moveDir.copy(want);
					speed = s.speed;
				} else if (dist < 10) {
					moveDir.copy(want).negate();
					speed = s.speed * 0.8;
				} else {
					moveDir.set(-want.z * this.strafe, 0, want.x * this.strafe);
					speed = s.speed * 0.6;
					if (Math.random() < dt * 0.3) this.strafe *= -1;
				}
			} else if (dist > s.reach * 0.8) {
				moveDir.copy(want);
				speed = s.speed * (this.windup > 0 ? 0.2 : 1);
			}
			this.attack(dt, dist, host, bolts);
		} else {
			// idle shamble
			this.wanderTimer -= dt;
			if (this.wanderTimer <= 0) {
				this.wanderTimer = rand(3, 7);
				this.wander.set(this.pos.x + rand(-12, 12), 0, this.pos.z + rand(-12, 12));
			}
			const w = new THREE.Vector3().subVectors(this.wander, this.pos).setY(0);
			if (w.length() > 1) {
				moveDir.copy(w.normalize());
				speed = s.speed * 0.3;
			}
		}

		// get unstuck from walls by sidestepping for a moment
		if (this.detour > 0) {
			this.detour -= dt;
			const a = this.detourSign * 1.3;
			moveDir = new THREE.Vector3(
				moveDir.x * Math.cos(a) - moveDir.z * Math.sin(a),
				0,
				moveDir.x * Math.sin(a) + moveDir.z * Math.cos(a),
			);
		}

		this.pos.addScaledVector(moveDir, speed * dt);
		this.pos.addScaledVector(this.knock, dt * 6);
		this.knock.multiplyScalar(Math.exp(-8 * dt));
		const r = 0.4 * s.scale;
		this.pos.y = host.world.groundAt(this.pos.x, this.pos.z);
		host.world.resolve(this.pos, r);

		const moved = this.pos.distanceTo(this.lastPos);
		if (speed > 0.5 && moved < speed * dt * 0.3) {
			this.stuckTimer += dt;
			if (this.stuckTimer > 0.4 && this.detour <= 0) {
				this.detour = rand(0.8, 1.6);
				this.detourSign = Math.random() < 0.5 ? 1 : -1;
				this.stuckTimer = 0;
			}
		} else this.stuckTimer = 0;
		this.lastPos.copy(this.pos);

		// face movement, or the player while attacking
		const faceDir = this.alerted && (dist < 6 || this.kind === 'gunner') ? toPlayer : moveDir;
		if (faceDir.lengthSq() > 1e-4) {
			const target = Math.atan2(faceDir.x, faceDir.z);
			this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-8 * dt));
		}

		// limbs
		this.stride += dt * speed * 2.2;
		const swing = Math.sin(this.stride) * Math.min(1, speed / 2) * 0.7;
		this.legs[0].rotation.x = swing;
		this.legs[1].rotation.x = -swing;
		const reachPose = this.kind === 'husk' || this.kind === 'warden' ? -1.35 : this.kind === 'gunner' ? -1.5 : -0.4;
		const attackPose = this.windup > 0 ? -2.4 : 0;
		for (let k = 0; k < 2; k++) {
			const base = this.alerted ? reachPose : -0.1;
			const target = attackPose || base + (k ? -swing : swing) * 0.4;
			this.arms[k].rotation.x = damp(this.arms[k].rotation.x, target, 12, dt);
		}
		this.body.rotation.z = Math.sin(this.stride * 0.5) * 0.06;

		this.root.position.copy(this.pos);
		this.root.rotation.y = this.facing;

		this.groanTimer -= dt;
		if (this.groanTimer <= 0) {
			this.groanTimer = rand(5, 12);
			if (dist < 25) host.sfx(this.kind === 'warden' ? 'roar' : 'groan', this.pos);
		}
	}

	private attack(dt: number, dist: number, host: EnemyHost, bolts: BoltSystem): void {
		const s = this.spec;
		this.cooldown -= dt;
		if (this.kind === 'gunner') {
			if (this.cooldown <= 0 && this.hasLos && dist < s.reach) {
				this.cooldown = s.cooldown + rand(-0.4, 0.6);
				const from = this.chest.add(new THREE.Vector3(Math.sin(this.facing) * 0.6, 0.2, Math.cos(this.facing) * 0.6));
				bolts.fire(from, host.playerEye.clone().add(new THREE.Vector3(rand(-0.6, 0.6), -0.4, rand(-0.6, 0.6))), 28, s.damage, 0xff4a2a);
				host.sfx('bolt', from);
			}
			return;
		}
		if (this.kind === 'warden') {
			this.volleyTimer -= dt;
			if (this.volleyTimer <= 0 && this.hasLos) {
				this.volleyTimer = rand(4, 6);
				const from = this.chest.add(new THREE.Vector3(0, 1, 0));
				for (let k = -2; k <= 2; k++) {
					const aim = host.playerEye.clone();
					const side = new THREE.Vector3(-(aim.z - from.z), 0, aim.x - from.x).normalize();
					aim.addScaledVector(side, k * 2.2);
					bolts.fire(from, aim, 24, 12, 0xff2a10);
				}
				host.sfx('bolt', from);
			}
			this.summonTimer -= dt;
			if (this.summonTimer <= 0) {
				this.summonTimer = 20;
				host.onBossSummon(this.pos);
			}
		}
		if (this.windup > 0) {
			this.windup -= dt;
			if (this.windup <= 0) {
				host.sfx('swipe', this.pos);
				if (dist < s.reach + 0.6) host.damagePlayer(s.damage, this.pos);
				if (this.kind === 'warden') host.sparks(this.pos.clone().setY(0.2), 0xffaa55, 30, 8);
			}
		} else if (this.cooldown <= 0 && dist < s.reach) {
			this.windup = this.kind === 'warden' ? 0.6 : 0.35;
			this.cooldown = s.cooldown;
		}
	}
}

interface Bolt {
	mesh: THREE.Mesh;
	vel: THREE.Vector3;
	life: number;
	damage: number;
}

export class BoltSystem {
	private readonly bolts: Bolt[] = [];
	private readonly geo = new THREE.SphereGeometry(0.16, 8, 6);
	private readonly scene: THREE.Scene;
	constructor(scene: THREE.Scene) {
		this.scene = scene;
	}

	fire(from: THREE.Vector3, to: THREE.Vector3, speed: number, damage: number, color: number): void {
		const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
		mesh.scale.set(1, 1, 2.5);
		mesh.position.copy(from);
		const vel = new THREE.Vector3().subVectors(to, from).normalize().multiplyScalar(speed);
		mesh.lookAt(from.clone().add(vel));
		this.scene.add(mesh);
		this.bolts.push({ mesh, vel, life: 4, damage });
	}

	update(dt: number, host: EnemyHost): void {
		for (let i = this.bolts.length - 1; i >= 0; i--) {
			const b = this.bolts[i];
			b.life -= dt;
			const step = b.vel.length() * dt;
			const dir = b.vel.clone().normalize();
			const hitWall = host.world.raycast(b.mesh.position, dir, step) < step;
			b.mesh.position.addScaledVector(b.vel, dt);
			const p = b.mesh.position;
			const eye = host.playerEye;
			const dx = p.x - eye.x;
			const dz = p.z - eye.z;
			const dy = p.y - (eye.y - 0.5);
			const hitPlayer = host.playerAlive() && dx * dx + dz * dz < 0.45 && Math.abs(dy) < 1.0;
			if (hitPlayer) host.damagePlayer(b.damage, p.clone().sub(b.vel));
			if (hitWall || hitPlayer || b.life <= 0) {
				host.sparks(p, 0xff5a2a, 8, 4);
				this.scene.remove(b.mesh);
				(b.mesh.material as THREE.Material).dispose();
				this.bolts.splice(i, 1);
			}
		}
	}

	clear(): void {
		for (const b of this.bolts) {
			this.scene.remove(b.mesh);
			(b.mesh.material as THREE.Material).dispose();
		}
		this.bolts.length = 0;
	}
}

export interface EnemyHit {
	enemy: Enemy;
	dist: number;
	head: boolean;
}

export class EnemyManager {
	readonly list: Enemy[] = [];
	readonly bolts: BoltSystem;
	private readonly scene: THREE.Scene;
	constructor(scene: THREE.Scene) {
		this.scene = scene;
		this.bolts = new BoltSystem(scene);
	}

	spawn(kind: EnemyKind, at: THREE.Vector3, alerted = false): Enemy {
		const e = new Enemy(kind, at);
		e.alerted = alerted;
		this.scene.add(e.root);
		this.list.push(e);
		return e;
	}

	get alive(): number {
		return this.list.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
	}

	update(dt: number, host: EnemyHost): void {
		for (const e of this.list) e.update(dt, host, this.bolts);
		// separation so crowds don't stack into one blob
		for (let i = 0; i < this.list.length; i++) {
			const a = this.list[i];
			if (a.dead) continue;
			for (let j = i + 1; j < this.list.length; j++) {
				const b = this.list[j];
				if (b.dead) continue;
				const dx = b.pos.x - a.pos.x;
				const dz = b.pos.z - a.pos.z;
				const min = 0.45 * (a.spec.scale + b.spec.scale);
				const d2 = dx * dx + dz * dz;
				if (d2 < min * min && d2 > 1e-6) {
					const d = Math.sqrt(d2);
					const push = (min - d) / 2;
					a.pos.x -= (dx / d) * push;
					a.pos.z -= (dz / d) * push;
					b.pos.x += (dx / d) * push;
					b.pos.z += (dz / d) * push;
				}
			}
		}
		for (let i = this.list.length - 1; i >= 0; i--) {
			const e = this.list[i];
			if (e.dead && e.deadTime > 6) {
				this.scene.remove(e.root);
				this.list.splice(i, 1);
			}
		}
		this.bolts.update(dt, host);
	}

	/** Alert every enemy within `radius` — gunfire carries. */
	noise(at: THREE.Vector3, radius: number): void {
		for (const e of this.list) if (!e.dead && e.pos.distanceToSquared(at) < radius * radius) e.alerted = true;
	}

	raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): EnemyHit | null {
		let best: EnemyHit | null = null;
		let bestDist = maxDist;
		for (const e of this.list) {
			if (e.dead) continue;
			const th = raySphere(o, d, e.headCenter, 0.3 * e.spec.scale);
			if (th < bestDist) {
				bestDist = th;
				best = { enemy: e, dist: th, head: true };
			}
			const tb = rayAABB(o, d, e.bodyBox(), bestDist);
			if (tb < bestDist) {
				bestDist = tb;
				best = { enemy: e, dist: tb, head: false };
			}
		}
		return best;
	}

	clear(): void {
		for (const e of this.list) this.scene.remove(e.root);
		this.list.length = 0;
		this.bolts.clear();
	}
}
