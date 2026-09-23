import * as THREE from 'three';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Frame-rate independent exponential approach of `a` toward `b`. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
	a + (b - a) * (1 - Math.exp(-lambda * dt));
export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
export const wrapAngle = (a: number): number => {
	const t = (a + Math.PI) % (Math.PI * 2);
	return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
};

/** Deterministic PRNG so the city is identical on every visit. */
export function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const g = c.getContext('2d');
	if (!g) throw new Error('2D canvas unavailable');
	return [c, g];
}

export function canvasTexture(
	w: number,
	h: number,
	draw: (g: CanvasRenderingContext2D) => void,
	{ repeat = true, srgb = true }: { repeat?: boolean; srgb?: boolean } = {},
): THREE.CanvasTexture {
	const [c, g] = makeCanvas(w, h);
	draw(g);
	const t = new THREE.CanvasTexture(c);
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

/** Soft radial falloff used for lamp halos, muzzle flashes and eye glints. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
	return canvasTexture(
		128,
		128,
		(g) => {
			const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
			grad.addColorStop(0, inner);
			grad.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.45)'));
			grad.addColorStop(1, outer);
			g.fillStyle = grad;
			g.fillRect(0, 0, 128, 128);
		},
		{ repeat: false },
	);
}

/** Axis-aligned box on the ground plane, from y=0 up to `h`. */
export interface AABB {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	h: number;
}

/** Slab test: distance along a normalized ray to the box, or Infinity. */
export function rayAABB(o: THREE.Vector3, d: THREE.Vector3, b: AABB, maxDist: number): number {
	let tmin = 0;
	let tmax = maxDist;
	const axes: [number, number, number, number][] = [
		[o.x, d.x, b.minX, b.maxX],
		[o.y, d.y, 0, b.h],
		[o.z, d.z, b.minZ, b.maxZ],
	];
	for (const [oo, dd, lo, hi] of axes) {
		if (Math.abs(dd) < 1e-8) {
			if (oo < lo || oo > hi) return Infinity;
			continue;
		}
		let t1 = (lo - oo) / dd;
		let t2 = (hi - oo) / dd;
		if (t1 > t2) [t1, t2] = [t2, t1];
		tmin = Math.max(tmin, t1);
		tmax = Math.min(tmax, t2);
		if (tmin > tmax) return Infinity;
	}
	return tmin;
}

export function raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number {
	const ox = o.x - c.x;
	const oy = o.y - c.y;
	const oz = o.z - c.z;
	const b = ox * d.x + oy * d.y + oz * d.z;
	const cc = ox * ox + oy * oy + oz * oz - r * r;
	const disc = b * b - cc;
	if (disc < 0) return Infinity;
	const t = -b - Math.sqrt(disc);
	return t >= 0 ? t : Infinity;
}

export function formatClock(seconds: number): string {
	const s = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
