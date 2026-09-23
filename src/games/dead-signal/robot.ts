import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Humanoid service robots in the spirit of Tesla's Optimus: glossy shell
 * panels over black joints, a black glass face and a red eye bar.
 *
 * Every rigid segment is merged into one vertex-coloured geometry so a robot
 * costs ~12 draw calls. Geometry is built once per palette and shared; each
 * robot only clones its materials (for hit flashes and eye state).
 */

export interface RobotPalette {
	shell: number;
	joint: number;
	visor: number;
	accent: number;
	eye: number;
	cannon: boolean;
	armored: boolean;
	slim: number; // limb thickness multiplier
}

export interface RobotRig {
	root: THREE.Group;
	body: THREE.Group;
	pelvis: THREE.Group;
	spine: THREE.Group;
	head: THREE.Group;
	hips: [THREE.Group, THREE.Group];
	knees: [THREE.Group, THREE.Group];
	shoulders: [THREE.Group, THREE.Group];
	elbows: [THREE.Group, THREE.Group];
	muzzle: THREE.Object3D | null;
	shellMat: THREE.MeshPhysicalMaterial;
	eyeMat: THREE.MeshBasicMaterial;
	coreMat: THREE.MeshBasicMaterial | null;
	meshes: THREE.Mesh[];
}

type Piece = [THREE.BufferGeometry, number];

function colored(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
	const g = geo;
	const c = new THREE.Color(color);
	const n = g.getAttribute('position').count;
	const arr = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		arr[i * 3] = c.r;
		arr[i * 3 + 1] = c.g;
		arr[i * 3 + 2] = c.b;
	}
	g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
	return g;
}

function merge(pieces: Piece[]): THREE.BufferGeometry {
	const geos = pieces.map(([g, c]) => {
		// RoundedBoxGeometry is non-indexed; normalise everything so mergeGeometries accepts the mix.
		const ng = g.index ? g.toNonIndexed() : g;
		return colored(ng, c);
	});
	const merged = mergeGeometries(geos, false);
	if (!merged) throw new Error('robot merge failed');
	merged.computeBoundingSphere();
	return merged;
}

const rbox = (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) =>
	new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)).translate(x, y, z);
const sphere = (r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) =>
	new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz).translate(x, y, z);
const capsule = (r: number, len: number, x = 0, y = 0, z = 0) => new THREE.CapsuleGeometry(r, len, 4, 12).translate(x, y, z);
const cyl = (r0: number, r1: number, h: number, x = 0, y = 0, z = 0, seg = 14) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);

interface Kit {
	pelvis: THREE.BufferGeometry;
	spine: THREE.BufferGeometry;
	head: THREE.BufferGeometry;
	eyes: THREE.BufferGeometry;
	thigh: THREE.BufferGeometry;
	shin: THREE.BufferGeometry;
	upperArm: THREE.BufferGeometry;
	forearm: THREE.BufferGeometry;
	cannonArm: THREE.BufferGeometry | null;
	core: THREE.BufferGeometry | null;
}

const kits = new Map<string, Kit>();

function buildKit(p: RobotPalette): Kit {
	const key = JSON.stringify(p);
	const cached = kits.get(key);
	if (cached) return cached;
	const s = p.slim;
	const { shell, joint, visor, accent } = p;

	const pelvis = merge([
		[rbox(0.3, 0.15, 0.2, 0.05, 0, 0, 0), shell],
		[sphere(0.07 * s, -0.1, -0.06, 0), joint],
		[sphere(0.07 * s, 0.1, -0.06, 0), joint],
		[rbox(0.12, 0.05, 0.03, 0.01, 0, -0.02, 0.1), joint],
	]);

	const spinePieces: Piece[] = [
		// segmented black abdomen
		[cyl(0.1, 0.12, 0.2, 0, 0.1, 0), joint],
		[new THREE.TorusGeometry(0.112, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, 0.06, 0), accent],
		[new THREE.TorusGeometry(0.108, 0.012, 6, 20).rotateX(Math.PI / 2).translate(0, 0.13, 0), accent],
		// chest shell, tapered by stacking two rounded boxes
		[rbox(0.44, 0.2, 0.25, 0.08, 0, 0.38, 0), shell],
		[rbox(0.34, 0.16, 0.22, 0.07, 0, 0.24, 0.005), shell],
		// black side panels + back battery pack
		[rbox(0.05, 0.26, 0.2, 0.02, -0.2, 0.31, -0.01), joint],
		[rbox(0.05, 0.26, 0.2, 0.02, 0.2, 0.31, -0.01), joint],
		[rbox(0.32, 0.3, 0.09, 0.03, 0, 0.32, -0.14), joint],
		// collar and neck
		[cyl(0.1, 0.12, 0.05, 0, 0.5, 0), joint],
		[cyl(0.04, 0.045, 0.1, 0, 0.55, 0.005), joint],
		// shoulder joints
		[sphere(0.075 * s, -0.27, 0.42, 0), joint],
		[sphere(0.075 * s, 0.27, 0.42, 0), joint],
	];
	if (p.armored) {
		spinePieces.push(
			[rbox(0.2, 0.08, 0.26, 0.04, -0.3, 0.5, 0), shell],
			[rbox(0.2, 0.08, 0.26, 0.04, 0.3, 0.5, 0), shell],
			[rbox(0.28, 0.1, 0.05, 0.02, 0, 0.3, 0.13), joint],
		);
	}
	const spine = merge(spinePieces);

	// Head: white egg shell with a black glass face wrapped round the front.
	const face = new THREE.SphereGeometry(0.123, 24, 16, Math.PI / 2 - 1.05, 2.1, 0.5, 1.85).scale(1, 1.18, 1.08).translate(0, 0.12, 0.004);
	const head = merge([
		[sphere(0.12, 0, 0.12, -0.008, 1, 1.2, 1.08), shell],
		[face, visor],
		[cyl(0.05, 0.06, 0.04, 0, 0.0, 0), joint],
	]);
	const eyes = mergeGeometries(
		[
			sphere(0.021, -0.043, 0.135, 0.13, 1.8, 0.7, 0.5),
			sphere(0.021, 0.043, 0.135, 0.13, 1.8, 0.7, 0.5),
			new THREE.BoxGeometry(0.12, 0.004, 0.004).translate(0, 0.135, 0.133),
		].map((g) => (g.index ? g.toNonIndexed() : g)),
		false,
	);
	if (!eyes) throw new Error('eye merge failed');

	const thigh = merge([
		[capsule(0.068 * s, 0.24, 0, -0.2, 0), shell],
		[rbox(0.09 * s, 0.2, 0.05, 0.02, 0, -0.2, 0.05), joint],
		[sphere(0.058 * s, 0, -0.42, 0), joint],
	]);
	const shin = merge([
		[capsule(0.056 * s, 0.26, 0, -0.2, 0.005), shell],
		[rbox(0.05 * s, 0.24, 0.04, 0.015, 0, -0.2, -0.05), joint],
		[sphere(0.045 * s, 0, -0.42, 0), joint],
		[rbox(0.1 * s, 0.06, 0.24, 0.025, 0, -0.46, 0.04), joint],
	]);
	const upperArm = merge([
		[capsule(0.055 * s, 0.17, 0, -0.15, 0), shell],
		[sphere(0.048 * s, 0, -0.3, 0), joint],
	]);
	const forearm = merge([
		[capsule(0.05 * s, 0.15, 0, -0.13, 0), shell],
		[cyl(0.035, 0.04, 0.05, 0, -0.26, 0), joint],
		[rbox(0.07, 0.1, 0.04, 0.015, 0, -0.33, 0.005), joint],
		[rbox(0.02, 0.06, 0.02, 0.008, -0.03, -0.3, 0.03), joint],
		// fingers
		[rbox(0.058, 0.05, 0.03, 0.01, 0, -0.4, 0.01), joint],
	]);
	const cannonArm = p.cannon
		? merge([
				[capsule(0.055 * s, 0.1, 0, -0.1, 0), shell],
				[cyl(0.07, 0.065, 0.34, 0, -0.28, 0, 16), joint],
				[cyl(0.08, 0.08, 0.06, 0, -0.14, 0, 16), accent],
				[cyl(0.05, 0.05, 0.06, 0, -0.47, 0, 12), joint],
				[rbox(0.05, 0.16, 0.06, 0.01, 0, -0.24, 0.08), shell],
			])
		: null;
	const core = p.armored ? new THREE.SphereGeometry(0.06, 16, 12).translate(0, 0.32, 0.135) : null;

	const kit = { pelvis, spine, head, eyes, thigh, shin, upperArm, forearm, cannonArm, core };
	kits.set(key, kit);
	return kit;
}

const RING_GEO = new THREE.TorusGeometry(0.045, 0.012, 8, 20).rotateX(Math.PI / 2).translate(0, -0.5, 0);

export function buildRobot(p: RobotPalette, scale: number): RobotRig {
	const kit = buildKit(p);
	const shellMat = new THREE.MeshPhysicalMaterial({
		vertexColors: true,
		roughness: 0.32,
		metalness: 0.15,
		clearcoat: 0.85,
		clearcoatRoughness: 0.18,
		envMapIntensity: 1.3,
		emissive: 0x000000,
	});
	const eyeMat = new THREE.MeshBasicMaterial({ color: p.eye, toneMapped: false });
	const coreMat = kit.core ? new THREE.MeshBasicMaterial({ color: p.eye, toneMapped: false }) : null;
	const meshes: THREE.Mesh[] = [];
	const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => {
		const m = new THREE.Mesh(geo, mat);
		m.castShadow = true;
		parent.add(m);
		meshes.push(m);
		return m;
	};

	const root = new THREE.Group();
	const body = new THREE.Group();
	root.add(body);
	const pelvis = new THREE.Group();
	pelvis.position.y = 0.97;
	body.add(pelvis);
	mesh(kit.pelvis, shellMat, pelvis);

	const hips: THREE.Group[] = [];
	const knees: THREE.Group[] = [];
	for (const side of [-1, 1]) {
		const hip = new THREE.Group();
		hip.position.set(side * 0.1, -0.06, 0);
		mesh(kit.thigh, shellMat, hip);
		const knee = new THREE.Group();
		knee.position.y = -0.42;
		mesh(kit.shin, shellMat, knee);
		hip.add(knee);
		pelvis.add(hip);
		hips.push(hip);
		knees.push(knee);
	}

	const spine = new THREE.Group();
	spine.position.y = 0.07;
	pelvis.add(spine);
	mesh(kit.spine, shellMat, spine);
	if (kit.core && coreMat) mesh(kit.core, coreMat, spine).castShadow = false;

	const head = new THREE.Group();
	head.position.y = 0.58;
	spine.add(head);
	mesh(kit.head, shellMat, head);
	mesh(kit.eyes, eyeMat, head).castShadow = false;

	const shoulders: THREE.Group[] = [];
	const elbows: THREE.Group[] = [];
	let muzzle: THREE.Object3D | null = null;
	for (const side of [-1, 1]) {
		const sh = new THREE.Group();
		sh.position.set(side * 0.27, 0.42, 0);
		const right = side === 1;
		if (right && kit.cannonArm) {
			mesh(kit.cannonArm, shellMat, sh);
			const elbow = new THREE.Group(); // cannon arm is rigid; elbow kept for a uniform rig
			sh.add(elbow);
			elbows.push(elbow);
			const ring = new THREE.Mesh(RING_GEO, eyeMat);
			sh.add(ring);
			muzzle = new THREE.Object3D();
			muzzle.position.set(0, -0.52, 0);
			sh.add(muzzle);
		} else {
			mesh(kit.upperArm, shellMat, sh);
			const elbow = new THREE.Group();
			elbow.position.y = -0.3;
			mesh(kit.forearm, shellMat, elbow);
			sh.add(elbow);
			elbows.push(elbow);
		}
		spine.add(sh);
		shoulders.push(sh);
	}

	body.scale.setScalar(scale);
	return {
		root,
		body,
		pelvis,
		spine,
		head,
		hips: hips as [THREE.Group, THREE.Group],
		knees: knees as [THREE.Group, THREE.Group],
		shoulders: shoulders as [THREE.Group, THREE.Group],
		elbows: elbows as [THREE.Group, THREE.Group],
		muzzle,
		shellMat,
		eyeMat,
		coreMat,
		meshes,
	};
}

// ── debris ─────────────────────────────────────────────────────────────────

interface Piece3 {
	obj: THREE.Object3D;
	vel: THREE.Vector3;
	spin: THREE.Vector3;
	life: number;
	radius: number;
}

/** Limbs and heads knocked off destroyed robots. */
export class Debris {
	private readonly list: Piece3[] = [];
	private readonly scene: THREE.Scene;
	constructor(scene: THREE.Scene) {
		this.scene = scene;
	}

	/** Re-parent `obj` into world space (keeping its pose) and throw it. */
	detach(obj: THREE.Object3D, vel: THREE.Vector3, radius: number): void {
		this.scene.attach(obj);
		this.list.push({
			obj,
			vel,
			spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
			life: 6,
			radius,
		});
		if (this.list.length > 60) this.remove(0);
	}

	private remove(i: number): void {
		this.scene.remove(this.list[i].obj);
		this.list.splice(i, 1);
	}

	update(dt: number): void {
		for (let i = this.list.length - 1; i >= 0; i--) {
			const d = this.list[i];
			d.life -= dt;
			d.vel.y -= 18 * dt;
			d.obj.position.addScaledVector(d.vel, dt);
			d.obj.rotation.x += d.spin.x * dt;
			d.obj.rotation.y += d.spin.y * dt;
			d.obj.rotation.z += d.spin.z * dt;
			if (d.obj.position.y < d.radius) {
				d.obj.position.y = d.radius;
				if (Math.abs(d.vel.y) > 1) d.vel.y = -d.vel.y * 0.35;
				else d.vel.y = 0;
				d.vel.x *= 0.6;
				d.vel.z *= 0.6;
				d.spin.multiplyScalar(0.6);
			}
			if (d.life < 1.5) d.obj.position.y -= dt * 0.25;
			if (d.life <= 0) this.remove(i);
		}
	}

	clear(): void {
		while (this.list.length) this.remove(0);
	}
}
