import * as THREE from 'three';
import { Debris, type RobotPalette, type RobotRig, buildRobot } from './robot';
import { type AABB, damp, rand, rayAABB, raySphere, wrapAngle } from './util';
import type { World } from './world';

export type EnemyKind = 'husk' | 'stalker' | 'gunner' | 'warden';

interface Spec {
	name: string;
	hp: number;
	speed: number;
	scale: number;
	damage: number;
	reach: number;
	cooldown: number;
	reward: number;
	sight: number;
	palette: RobotPalette;
}

const RED = 0xff1a12;

const SPEC: Record<EnemyKind, Spec> = {
	husk: {
		name: 'OPTIMUS UNIT',
		hp: 80,
		speed: 3.3,
		scale: 1.02,
		damage: 14,
		reach: 1.7,
		cooldown: 1.1,
		reward: 10,
		sight: 32,
		palette: { shell: 0xd4d8dd, joint: 0x141518, visor: 0x040405, accent: 0x2a2c30, eye: RED, cannon: false, armored: false, slim: 1 },
	},
	stalker: {
		name: 'HUNTER UNIT',
		hp: 50,
		speed: 6.6,
		scale: 0.96,
		damage: 10,
		reach: 1.6,
		cooldown: 0.7,
		reward: 15,
		sight: 42,
		palette: { shell: 0x1b1d21, joint: 0x09090a, visor: 0x020202, accent: 0x5a0a08, eye: RED, cannon: false, armored: false, slim: 0.85 },
	},
	gunner: {
		name: 'ENFORCER UNIT',
		hp: 110,
		speed: 2.8,
		scale: 1.06,
		damage: 12,
		reach: 34,
		cooldown: 2.4,
		reward: 25,
		sight: 48,
		palette: { shell: 0x7d838c, joint: 0x17181b, visor: 0x030303, accent: 0x8a1a12, eye: RED, cannon: true, armored: false, slim: 1.1 },
	},
	warden: {
		name: 'WARDEN-9',
		hp: 2400,
		speed: 2.5,
		scale: 2.45,
		damage: 34,
		reach: 4.4,
		cooldown: 1.7,
		reward: 500,
		sight: 65,
		palette: { shell: 0x2b2d32, joint: 0x0d0d0f, visor: 0x020202, accent: 0x9a140e, eye: RED, cannon: true, armored: true, slim: 1.25 },
	},
};

export type RobotSfx = 'alert' | 'bolt' | 'swipe' | 'roar' | 'step' | 'servo' | 'charge' | 'death' | 'lunge' | 'slam';

export interface EnemyHost {
	world: World;
	playerPos: THREE.Vector3;
	playerEye: THREE.Vector3;
	cameraPos: THREE.Vector3;
	difficulty: { hp: number; damage: number };
	playerAlive(): boolean;
	damagePlayer(amount: number, from: THREE.Vector3): void;
	onEnemyKilled(e: Enemy, headshot: boolean): void;
	onBossSummon(pos: THREE.Vector3): void;
	onBossEnrage(): void;
	shockwave(pos: THREE.Vector3, radius: number): void;
	sparks(pos: THREE.Vector3, color: number, count: number, speed?: number): void;
	sfx(name: RobotSfx, pos: THREE.Vector3): void;
}

export class Enemy {
	readonly kind: EnemyKind;
	readonly spec: Spec;
	readonly rig: RobotRig;
	readonly root: THREE.Group;
	readonly pos: THREE.Vector3;
	readonly maxHp: number;
	hp: number;
	dead = false;
	deadTime = 0;
	alerted = false;
	enraged = false;
	facing = 0;
	laser: THREE.Line | null = null;
	private flash = 0;
	private cooldown = rand(0.5, 1.5);
	private windup = 0;
	private aimT = 0;
	private aimAt = new THREE.Vector3();
	private stride = Math.random() * 10;
	private lastStep = 0;
	private losTimer = Math.random() * 0.5;
	private hasLos = false;
	private detour = 0;
	private detourSign = 1;
	private lastPos = new THREE.Vector3();
	private stuckTimer = 0;
	private servoTimer = rand(2, 6);
	private strafe = Math.random() < 0.5 ? 1 : -1;
	private volleyTimer = 5;
	private summonTimer = 18;
	private lungeT = 0;
	private lungeCd = rand(2, 4);
	private wander = new THREE.Vector3();
	private wanderTimer = 0;
	private knock = new THREE.Vector3();
	private headYaw = 0;
	private eyeGlow = 0.3;
	private sparkT = 0;
	private visible = true;
	private shadowsOn = true;
	private readonly phase = Math.random() * 10;

	constructor(kind: EnemyKind, at: THREE.Vector3, hpMult: number) {
		this.kind = kind;
		this.spec = SPEC[kind];
		this.maxHp = this.spec.hp * hpMult;
		this.hp = this.maxHp;
		this.pos = at.clone();
		this.lastPos.copy(at);
		this.facing = Math.random() * Math.PI * 2;
		this.rig = buildRobot(this.spec.palette, this.spec.scale);
		this.root = this.rig.root;
		this.root.position.copy(this.pos);
		if (kind === 'gunner' || kind === 'warden') {
			this.laser = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]),
				new THREE.LineBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }),
			);
			this.laser.frustumCulled = false;
		}
	}

	get headCenter(): THREE.Vector3 {
		return new THREE.Vector3(this.pos.x, this.pos.y + 1.74 * this.spec.scale + this.rig.body.position.y, this.pos.z);
	}
	get chest(): THREE.Vector3 {
		return new THREE.Vector3(this.pos.x, this.pos.y + 1.32 * this.spec.scale, this.pos.z);
	}
	bodyBox(): AABB {
		const r = 0.3 * this.spec.scale;
		return { minX: this.pos.x - r, maxX: this.pos.x + r, minZ: this.pos.z - r, maxZ: this.pos.z + r, h: this.pos.y + 1.6 * this.spec.scale };
	}
	get headRadius(): number {
		return 0.17 * this.spec.scale;
	}

	/** Returns true if this hit destroyed the unit. */
	hurt(amount: number, from: THREE.Vector3): boolean {
		if (this.dead) return false;
		this.hp -= amount;
		this.flash = 0.07;
		this.alerted = true;
		const push = new THREE.Vector3().subVectors(this.pos, from).setY(0);
		if (push.lengthSq() > 1e-6) push.normalize();
		this.knock.addScaledVector(push, this.kind === 'warden' ? 0.25 : Math.min(3, 0.06 * amount));
		if (this.hp <= 0) {
			this.dead = true;
			this.hp = 0;
			if (this.laser) (this.laser.material as THREE.LineBasicMaterial).opacity = 0;
			return true;
		}
		return false;
	}

	/** Knock parts off and start the collapse. */
	shatter(debris: Debris, from: THREE.Vector3, headshot: boolean, explosive: boolean): void {
		const away = new THREE.Vector3().subVectors(this.pos, from).setY(0).normalize();
		const fling = (obj: THREE.Object3D, power: number, r: number) => {
			const v = away.clone().multiplyScalar(power * rand(0.6, 1.2)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(2, 5), rand(-1.5, 1.5)));
			debris.detach(obj, v, r * this.spec.scale);
		};
		if (this.kind === 'warden') return; // the boss collapses whole
		if (headshot || explosive || Math.random() < 0.25) fling(this.rig.head, explosive ? 9 : 5, 0.14);
		if (explosive || Math.random() < 0.35) fling(this.rig.elbows[Math.random() < 0.5 ? 0 : 1], explosive ? 8 : 3, 0.06);
		if (explosive && Math.random() < 0.6) fling(this.rig.knees[Math.random() < 0.5 ? 0 : 1], 6, 0.08);
		this.rig.eyeMat.color.setHex(0x110000);
	}

	update(dt: number, host: EnemyHost, bolts: BoltSystem): void {
		const s = this.spec;
		const rig = this.rig;
		this.flash = Math.max(0, this.flash - dt);
		rig.shellMat.emissive.setHex(this.flash > 0 ? 0xffffff : 0x000000);
		rig.shellMat.emissiveIntensity = this.flash > 0 ? 0.5 : 0;

		// cull: skip drawing far robots, and only cast shadows close to the player
		const camD = this.pos.distanceTo(host.cameraPos);
		const vis = camD < 170;
		if (vis !== this.visible) {
			this.visible = vis;
			this.root.visible = vis;
		}
		const shadows = camD < 45;
		if (shadows !== this.shadowsOn) {
			this.shadowsOn = shadows;
			for (const m of rig.meshes) m.castShadow = shadows;
		}

		if (this.dead) {
			this.deadTime += dt;
			const t = Math.min(1, this.deadTime * 1.6);
			rig.body.rotation.x = damp(rig.body.rotation.x, -Math.PI / 2, 5, dt);
			for (let k = 0; k < 2; k++) {
				// limbs knocked off are now debris; leave their rotation to the debris sim
				if (rig.knees[k].parent === rig.hips[k]) rig.knees[k].rotation.x = t * 1.1;
				rig.hips[k].rotation.x = -t * 0.6;
			}
			rig.body.position.y = damp(rig.body.position.y, 0.22 * s.scale, 5, dt);
			if (this.deadTime > 3.5) rig.body.position.y -= dt * 0.4;
			this.sparkT -= dt;
			if (this.sparkT <= 0 && this.deadTime < 2.5 && camD < 60) {
				this.sparkT = rand(0.08, 0.3);
				host.sparks(this.chest.setY(this.pos.y + 0.35 * s.scale), Math.random() < 0.3 ? 0x7fd4ff : 0xffc860, 5, 3);
			}
			this.root.position.copy(this.pos);
			if (this.laser) (this.laser.material as THREE.LineBasicMaterial).opacity = 0;
			return;
		}

		const toPlayer = new THREE.Vector3().subVectors(host.playerPos, this.pos).setY(0);
		const dist = toPlayer.length();

		this.losTimer -= dt;
		if (this.losTimer <= 0) {
			this.losTimer = 0.3;
			this.hasLos = dist < s.sight && host.world.hasLineOfSight(this.chest, host.playerEye);
			if (this.hasLos && dist < s.sight * 0.8) this.alert(host);
		}
		if (!host.playerAlive()) {
			this.alerted = false;
			this.aimT = 0;
			this.windup = 0;
		}

		if (this.kind === 'warden' && !this.enraged && this.hp < this.maxHp * 0.5) {
			this.enraged = true;
			host.onBossEnrage();
		}
		const speedMul = this.enraged ? 1.45 : 1;

		let moveDir = new THREE.Vector3();
		let speed = 0;
		if (this.alerted) {
			const want = toPlayer.clone().normalize();
			if (this.kind === 'gunner') {
				if (dist > 22 || !this.hasLos) {
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
				if (this.aimT > 0) speed *= 0.15;
			} else if (dist > s.reach * 0.8) {
				moveDir.copy(want);
				speed = s.speed * speedMul * (this.windup > 0 ? 0.2 : 1);
			}
			if (this.kind === 'stalker') {
				this.lungeCd -= dt;
				if (this.lungeT > 0) {
					this.lungeT -= dt;
					speed = s.speed * 2.3;
				} else if (this.lungeCd <= 0 && dist < 10 && dist > 3 && this.hasLos) {
					this.lungeT = 0.45;
					this.lungeCd = rand(3, 5);
					host.sfx('lunge', this.pos);
				}
			}
			this.attack(dt, dist, host, bolts);
		} else {
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
		const r = 0.36 * s.scale;
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

		const faceDir = this.alerted && (dist < 7 || this.kind === 'gunner' || this.aimT > 0) ? toPlayer : moveDir;
		if (faceDir.lengthSq() > 1e-4) {
			const target = Math.atan2(faceDir.x, faceDir.z);
			this.facing += wrapAngle(target - this.facing) * (1 - Math.exp(-(this.kind === 'stalker' ? 12 : 7) * dt));
		}

		// head tracks the player when alerted, scans lazily otherwise
		const lookYaw = this.alerted ? wrapAngle(Math.atan2(toPlayer.x, toPlayer.z) - this.facing) : Math.sin(this.phase + performance.now() * 0.0006) * 0.6;
		this.headYaw = damp(this.headYaw, Math.max(-1.1, Math.min(1.1, lookYaw)), 9, dt);
		rig.head.rotation.y = this.headYaw;

		// eyes: dim idle, hot and pulsing when hunting
		const targetGlow = this.alerted ? 1 + Math.sin(performance.now() * 0.012 + this.phase) * 0.15 : 0.5 + Math.sin(performance.now() * 0.003 + this.phase) * 0.1;
		this.eyeGlow = damp(this.eyeGlow, targetGlow * (this.enraged ? 1.4 : 1), 10, dt);
		rig.eyeMat.color.setRGB(this.eyeGlow * 3.2, this.eyeGlow * 0.12, this.eyeGlow * 0.06);
		if (rig.coreMat) rig.coreMat.color.copy(rig.eyeMat.color).multiplyScalar(1.4);

		// gait: two-segment legs with knee flex, arms counter-swing
		this.stride += dt * speed * (2.4 / s.scale);
		const amt = Math.min(1, speed / 2.5);
		const sw = Math.sin(this.stride);
		rig.hips[0].rotation.x = sw * 0.6 * amt;
		rig.hips[1].rotation.x = -sw * 0.6 * amt;
		rig.knees[0].rotation.x = Math.max(0, -Math.cos(this.stride)) * 1.0 * amt + 0.05;
		rig.knees[1].rotation.x = Math.max(0, Math.cos(this.stride)) * 1.0 * amt + 0.05;
		rig.pelvis.position.y = 0.97 - Math.abs(Math.cos(this.stride)) * 0.03 * amt;
		rig.spine.rotation.x = damp(rig.spine.rotation.x, this.alerted ? 0.12 + amt * 0.1 : 0.02, 6, dt);
		rig.spine.rotation.y = -sw * 0.08 * amt;
		const stepPhase = Math.floor(this.stride / Math.PI);
		if (stepPhase !== this.lastStep) {
			this.lastStep = stepPhase;
			if (amt > 0.3 && camD < 22) host.sfx('step', this.pos);
		}

		const aiming = this.aimT > 0 || (this.kind === 'gunner' && this.alerted && this.hasLos && dist < s.reach);
		for (let k = 0; k < 2; k++) {
			const isCannon = k === 1 && s.palette.cannon;
			let shoulder = -sw * (k ? -1 : 1) * 0.45 * amt;
			let elbow = -0.25 - amt * 0.35;
			if (isCannon && aiming) {
				shoulder = -Math.PI / 2 + 0.05;
				elbow = 0;
			}
			if (this.windup > 0 && !isCannon) {
				shoulder = k === 0 ? -2.3 : -0.4; // haymaker wind-up
				elbow = -1.2;
			}
			rig.shoulders[k].rotation.x = damp(rig.shoulders[k].rotation.x, shoulder, 14, dt);
			rig.elbows[k].rotation.x = damp(rig.elbows[k].rotation.x, elbow, 14, dt);
		}
		rig.body.rotation.z = Math.sin(this.stride * 0.5) * 0.03 * amt;

		this.root.position.copy(this.pos);
		this.root.rotation.y = this.facing;

		// telegraph laser from the arm cannon while aiming
		if (this.laser) {
			const mat = this.laser.material as THREE.LineBasicMaterial;
			if (this.aimT > 0 && rig.muzzle) {
				this.root.updateMatrixWorld();
				const m = rig.muzzle.getWorldPosition(new THREE.Vector3());
				const pos = this.laser.geometry.getAttribute('position') as THREE.BufferAttribute;
				pos.setXYZ(0, m.x, m.y, m.z);
				const dir = this.aimAt.clone().sub(m).normalize();
				const len = host.world.raycast(m, dir, 80);
				const end = m.clone().addScaledVector(dir, len);
				pos.setXYZ(1, end.x, end.y, end.z);
				pos.needsUpdate = true;
				mat.opacity = 0.35 + (1 - this.aimT) * 0.6 * (Math.sin(performance.now() * 0.05) * 0.3 + 0.7);
			} else mat.opacity = 0;
		}

		this.servoTimer -= dt;
		if (this.servoTimer <= 0) {
			this.servoTimer = rand(4, 10);
			if (camD < 25) host.sfx(this.kind === 'warden' ? 'roar' : 'servo', this.pos);
		}
	}

	private alert(host: EnemyHost): void {
		if (this.alerted) return;
		this.alerted = true;
		host.sfx(this.kind === 'warden' ? 'roar' : 'alert', this.pos);
	}

	private attack(dt: number, dist: number, host: EnemyHost, bolts: BoltSystem): void {
		const s = this.spec;
		this.cooldown -= dt;
		const dmg = s.damage * host.difficulty.damage;
		const fire = (from: THREE.Vector3, at: THREE.Vector3, speed: number, damage: number, count = 1, spread = 0) => {
			for (let k = 0; k < count; k++) {
				const aim = at.clone();
				if (count > 1) {
					const side = new THREE.Vector3(-(aim.z - from.z), 0, aim.x - from.x).normalize();
					aim.addScaledVector(side, (k - (count - 1) / 2) * spread);
				}
				bolts.fire(from, aim, speed, damage, 0xff2414);
			}
			host.sfx('bolt', from);
		};
		const muzzle = () => {
			this.root.updateMatrixWorld();
			return this.rig.muzzle ? this.rig.muzzle.getWorldPosition(new THREE.Vector3()) : this.chest;
		};

		if (this.kind === 'gunner') {
			if (this.aimT > 0) {
				this.aimT -= dt;
				// laser tracks with lag so strafing beats it
				this.aimAt.lerp(host.playerEye.clone().add(new THREE.Vector3(0, -0.35, 0)), 1 - Math.exp(-3.5 * dt));
				if (this.aimT <= 0) {
					if (this.hasLos) fire(muzzle(), this.aimAt, 32, dmg);
					this.cooldown = s.cooldown + rand(-0.4, 0.6);
				}
			} else if (this.cooldown <= 0 && this.hasLos && dist < s.reach) {
				this.aimT = 0.75;
				this.aimAt.copy(host.playerEye).add(new THREE.Vector3(rand(-1, 1), -0.3, rand(-1, 1)));
				host.sfx('charge', this.pos);
			}
			return;
		}
		if (this.kind === 'warden') {
			this.volleyTimer -= dt * (this.enraged ? 1.6 : 1);
			if (this.aimT > 0) {
				this.aimT -= dt;
				this.aimAt.lerp(host.playerEye, 1 - Math.exp(-4 * dt));
				if (this.aimT <= 0) fire(muzzle(), this.aimAt, 26, 12 * host.difficulty.damage, this.enraged ? 7 : 5, 2.2);
			} else if (this.volleyTimer <= 0 && this.hasLos && dist > 6) {
				this.volleyTimer = rand(4, 6);
				this.aimT = 0.9;
				this.aimAt.copy(host.playerEye);
				host.sfx('charge', this.pos);
			}
			this.summonTimer -= dt;
			if (this.summonTimer <= 0 && dist < s.sight) {
				this.summonTimer = this.enraged ? 14 : 20;
				host.onBossSummon(this.pos);
			}
		}
		if (this.windup > 0) {
			this.windup -= dt;
			if (this.windup <= 0) {
				host.sfx(this.kind === 'warden' ? 'slam' : 'swipe', this.pos);
				if (this.kind === 'warden') {
					host.shockwave(this.pos, 7);
					if (dist < s.reach + 2.5) host.damagePlayer(dmg * (dist < s.reach + 0.6 ? 1 : 0.5), this.pos);
				} else if (dist < s.reach + 0.6) host.damagePlayer(dmg, this.pos);
			}
		} else if (this.cooldown <= 0 && dist < s.reach) {
			this.windup = this.kind === 'warden' ? 0.7 : 0.38;
			this.cooldown = s.cooldown * (this.enraged ? 0.7 : 1);
			host.sfx('servo', this.pos);
		}
	}

	dispose(): void {
		this.rig.shellMat.dispose();
		this.rig.eyeMat.dispose();
		this.rig.coreMat?.dispose();
		if (this.laser) {
			this.laser.geometry.dispose();
			(this.laser.material as THREE.Material).dispose();
		}
	}
}

interface Bolt {
	mesh: THREE.Mesh;
	vel: THREE.Vector3;
	life: number;
	damage: number;
}

/** Plasma bolts from Enforcers and the Warden: glowing, fast, dodgeable. */
export class BoltSystem {
	private readonly bolts: Bolt[] = [];
	private readonly geo = new THREE.CapsuleGeometry(0.07, 0.5, 4, 8).rotateX(Math.PI / 2);
	private readonly mat = new THREE.MeshBasicMaterial({ color: 0xff3a22, toneMapped: false });
	private readonly scene: THREE.Scene;
	constructor(scene: THREE.Scene) {
		this.scene = scene;
	}

	fire(from: THREE.Vector3, to: THREE.Vector3, speed: number, damage: number, color: number): void {
		this.mat.color.setHex(color).multiplyScalar(2.2);
		const mesh = new THREE.Mesh(this.geo, this.mat);
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
			const dy = p.y - (eye.y - 0.6);
			const hitPlayer = host.playerAlive() && dx * dx + dz * dz < 0.3 && Math.abs(dy) < 1.0;
			if (hitPlayer) host.damagePlayer(b.damage, p.clone().sub(b.vel));
			if (hitWall || hitPlayer || b.life <= 0) {
				host.sparks(p, 0xff5a2a, 10, 4);
				this.scene.remove(b.mesh);
				this.bolts.splice(i, 1);
			}
		}
	}

	/** Positions of live bolts (for near-miss whizz audio). */
	get live(): readonly { mesh: THREE.Mesh; vel: THREE.Vector3 }[] {
		return this.bolts;
	}

	clear(): void {
		for (const b of this.bolts) this.scene.remove(b.mesh);
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
	readonly debris: Debris;
	private readonly scene: THREE.Scene;
	constructor(scene: THREE.Scene) {
		this.scene = scene;
		this.bolts = new BoltSystem(scene);
		this.debris = new Debris(scene);
	}

	spawn(kind: EnemyKind, at: THREE.Vector3, hpMult: number, alerted = false): Enemy {
		const e = new Enemy(kind, at, hpMult);
		e.alerted = alerted;
		this.scene.add(e.root);
		if (e.laser) this.scene.add(e.laser);
		this.list.push(e);
		return e;
	}

	get alive(): number {
		return this.list.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
	}

	update(dt: number, host: EnemyHost): void {
		for (const e of this.list) e.update(dt, host, this.bolts);
		for (let i = 0; i < this.list.length; i++) {
			const a = this.list[i];
			if (a.dead) continue;
			for (let j = i + 1; j < this.list.length; j++) {
				const b = this.list[j];
				if (b.dead) continue;
				const dx = b.pos.x - a.pos.x;
				const dz = b.pos.z - a.pos.z;
				const min = 0.38 * (a.spec.scale + b.spec.scale);
				const d2 = dx * dx + dz * dz;
				if (d2 < min * min && d2 > 1e-6) {
					const d = Math.sqrt(d2);
					const push = (min - d) / 2;
					const wa = b.kind === 'warden' ? 2 : 1;
					const wb = a.kind === 'warden' ? 2 : 1;
					a.pos.x -= (dx / d) * push * (wa / ((wa + wb) / 2));
					a.pos.z -= (dz / d) * push * (wa / ((wa + wb) / 2));
					b.pos.x += (dx / d) * push * (wb / ((wa + wb) / 2));
					b.pos.z += (dz / d) * push * (wb / ((wa + wb) / 2));
				}
			}
		}
		for (let i = this.list.length - 1; i >= 0; i--) {
			const e = this.list[i];
			if (e.dead && e.deadTime > 7) this.removeAt(i);
		}
		this.bolts.update(dt, host);
		this.debris.update(dt);
	}

	private removeAt(i: number): void {
		const e = this.list[i];
		this.scene.remove(e.root);
		if (e.laser) this.scene.remove(e.laser);
		e.dispose();
		this.list.splice(i, 1);
	}

	noise(at: THREE.Vector3, radius: number): void {
		for (const e of this.list) if (!e.dead && e.pos.distanceToSquared(at) < radius * radius) e.alerted = true;
	}

	raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): EnemyHit | null {
		let best: EnemyHit | null = null;
		let bestDist = maxDist;
		for (const e of this.list) {
			if (e.dead) continue;
			const th = raySphere(o, d, e.headCenter, e.headRadius);
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
		while (this.list.length) this.removeAt(this.list.length - 1);
		this.bolts.clear();
		this.debris.clear();
	}
}
