import * as THREE from 'three';
import { glowTexture, rand } from './util';

/**
 * Point-sprite particles with per-particle size, colour and alpha, in one
 * draw call. Used additively for sparks, flames and embers, and with normal
 * blending for smoke and dust.
 */
export class PointFX {
	readonly points: THREE.Points;
	private readonly max: number;
	private readonly pos: Float32Array;
	private readonly col: Float32Array;
	private readonly size: Float32Array;
	private readonly alpha: Float32Array;
	private readonly base: Float32Array;
	private readonly vel: Float32Array;
	private readonly life: Float32Array;
	private readonly maxLife: Float32Array;
	private readonly grow: Float32Array;
	private readonly grav: Float32Array;
	private readonly drag: Float32Array;
	private count = 0;
	private readonly mat: THREE.ShaderMaterial;

	constructor(scene: THREE.Scene, max: number, additive: boolean, texture: THREE.Texture) {
		this.max = max;
		this.pos = new Float32Array(max * 3);
		this.col = new Float32Array(max * 3);
		this.size = new Float32Array(max);
		this.alpha = new Float32Array(max);
		this.base = new Float32Array(max);
		this.vel = new Float32Array(max * 3);
		this.life = new Float32Array(max);
		this.maxLife = new Float32Array(max);
		this.grow = new Float32Array(max);
		this.grav = new Float32Array(max);
		this.drag = new Float32Array(max);
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
		geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
		geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
		geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
		this.mat = new THREE.ShaderMaterial({
			uniforms: { uMap: { value: texture }, uScale: { value: 400 } },
			vertexShader: /* glsl */ `
				attribute vec3 aColor;
				attribute float aSize;
				attribute float aAlpha;
				uniform float uScale;
				varying vec3 vColor;
				varying float vAlpha;
				void main() {
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_PointSize = min(aSize * uScale / -mv.z, 256.0);
					gl_Position = projectionMatrix * mv;
					vColor = aColor;
					vAlpha = aAlpha;
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uMap;
				varying vec3 vColor;
				varying float vAlpha;
				void main() {
					vec4 t = texture2D(uMap, gl_PointCoord);
					gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
				}`,
			transparent: true,
			depthWrite: false,
			blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
		});
		this.points = new THREE.Points(geo, this.mat);
		this.points.frustumCulled = false;
		scene.add(this.points);
	}

	/** Point size is in world units; keep it right when the viewport changes. */
	setScale(viewportHeight: number, projectionYY: number): void {
		this.mat.uniforms.uScale.value = viewportHeight * 0.5 * projectionYY;
	}

	emit(p: THREE.Vector3, v: THREE.Vector3, life: number, size: number, color: THREE.Color, opts: { grow?: number; grav?: number; drag?: number; alpha?: number } = {}): void {
		let i = this.count;
		if (i >= this.max) i = Math.floor(Math.random() * this.max);
		else this.count++;
		this.pos.set([p.x, p.y, p.z], i * 3);
		this.vel.set([v.x, v.y, v.z], i * 3);
		this.col.set([color.r, color.g, color.b], i * 3);
		this.size[i] = size;
		this.base[i] = opts.alpha ?? 1;
		this.alpha[i] = 0;
		this.life[i] = life;
		this.maxLife[i] = life;
		this.grow[i] = opts.grow ?? 0;
		this.grav[i] = opts.grav ?? 0;
		this.drag[i] = opts.drag ?? 0;
	}

	burst(at: THREE.Vector3, color: THREE.Color, n: number, speed: number, life: number, size: number, grav = 9): void {
		const v = new THREE.Vector3();
		for (let k = 0; k < n; k++) {
			v.set(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
			this.emit(at, v, life * rand(0.5, 1.2), size * rand(0.6, 1.3), color, { grav, drag: 1.5 });
		}
	}

	update(dt: number): void {
		for (let i = 0; i < this.count; i++) {
			this.life[i] -= dt;
			if (this.life[i] <= 0) {
				// swap-remove with the last live particle
				const last = --this.count;
				if (i !== last) {
					this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
					this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
					this.col.copyWithin(i * 3, last * 3, last * 3 + 3);
					this.size[i] = this.size[last];
					this.alpha[i] = this.alpha[last];
					this.base[i] = this.base[last];
					this.life[i] = this.life[last];
					this.maxLife[i] = this.maxLife[last];
					this.grow[i] = this.grow[last];
					this.grav[i] = this.grav[last];
					this.drag[i] = this.drag[last];
				}
				i--;
				continue;
			}
			const o = i * 3;
			const d = Math.exp(-this.drag[i] * dt);
			this.vel[o] *= d;
			this.vel[o + 1] = this.vel[o + 1] * d - this.grav[i] * dt;
			this.vel[o + 2] *= d;
			this.pos[o] += this.vel[o] * dt;
			this.pos[o + 1] += this.vel[o + 1] * dt;
			this.pos[o + 2] += this.vel[o + 2] * dt;
			if (this.pos[o + 1] < 0.03) {
				this.pos[o + 1] = 0.03;
				this.vel[o + 1] = Math.abs(this.vel[o + 1]) * 0.3;
			}
			this.size[i] += this.grow[i] * dt;
			const t = this.life[i] / this.maxLife[i];
			// quick fade-in, long fade-out
			this.alpha[i] = this.base[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 12 + 0.15);
		}
		const geo = this.points.geometry;
		geo.setDrawRange(0, this.count);
		for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
	}

	clear(): void {
		this.count = 0;
		this.points.geometry.setDrawRange(0, 0);
	}
}

export const sparkTexture = (): THREE.Texture => glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

export function smokeTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const g = c.getContext('2d');
	if (g) {
		for (let k = 0; k < 6; k++) {
			const x = 20 + Math.random() * 24;
			const y = 20 + Math.random() * 24;
			const grad = g.createRadialGradient(x, y, 0, x, y, 26);
			grad.addColorStop(0, 'rgba(255,255,255,0.35)');
			grad.addColorStop(1, 'rgba(255,255,255,0)');
			g.fillStyle = grad;
			g.fillRect(0, 0, 64, 64);
		}
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

/** Bullet holes and scorch marks, oriented to the surface they hit. */
export class Decals {
	private readonly mesh: THREE.InstancedMesh;
	private readonly max = 220;
	private next = 0;
	private readonly m4 = new THREE.Matrix4();
	private readonly q = new THREE.Quaternion();
	private readonly spin = new THREE.Quaternion();
	private readonly z = new THREE.Vector3(0, 0, 1);

	constructor(scene: THREE.Scene) {
		const c = document.createElement('canvas');
		c.width = c.height = 64;
		const g = c.getContext('2d');
		if (g) {
			const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
			grad.addColorStop(0, 'rgba(0,0,0,1)');
			grad.addColorStop(0.18, 'rgba(8,6,5,0.95)');
			grad.addColorStop(0.35, 'rgba(30,24,20,0.55)');
			grad.addColorStop(1, 'rgba(0,0,0,0)');
			g.fillStyle = grad;
			g.fillRect(0, 0, 64, 64);
			g.strokeStyle = 'rgba(0,0,0,0.5)';
			for (let k = 0; k < 6; k++) {
				const a = Math.random() * Math.PI * 2;
				g.beginPath();
				g.moveTo(32, 32);
				g.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
				g.stroke();
			}
		}
		const tex = new THREE.CanvasTexture(c);
		tex.colorSpace = THREE.SRGBColorSpace;
		this.mesh = new THREE.InstancedMesh(
			new THREE.PlaneGeometry(1, 1),
			new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 }),
			this.max,
		);
		this.mesh.count = 0;
		this.mesh.frustumCulled = false;
		scene.add(this.mesh);
	}

	add(at: THREE.Vector3, normal: THREE.Vector3, size: number): void {
		this.q.setFromUnitVectors(this.z, normal);
		this.spin.setFromAxisAngle(this.z, Math.random() * Math.PI * 2);
		this.q.multiply(this.spin);
		this.m4.compose(at.clone().addScaledVector(normal, 0.012), this.q, new THREE.Vector3(size, size, size));
		this.mesh.setMatrixAt(this.next, this.m4);
		this.next = (this.next + 1) % this.max;
		this.mesh.count = Math.min(this.max, this.mesh.count + 1);
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	clear(): void {
		this.mesh.count = 0;
		this.next = 0;
	}
}

/** Short-lived additive quads for tracers and expanding shock rings. */
export class Streaks {
	private readonly scene: THREE.Scene;
	private readonly tracers: { mesh: THREE.Mesh; t: number }[] = [];
	private readonly rings: { mesh: THREE.Mesh; t: number; max: number; radius: number }[] = [];
	private readonly tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1).translate(0, 0, 0.5);
	private readonly tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
	private readonly ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);

	constructor(scene: THREE.Scene) {
		this.scene = scene;
	}

	tracer(from: THREE.Vector3, to: THREE.Vector3): void {
		const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
		mesh.position.copy(from);
		mesh.lookAt(to);
		mesh.scale.z = from.distanceTo(to);
		this.scene.add(mesh);
		this.tracers.push({ mesh, t: 0.05 });
	}

	ring(at: THREE.Vector3, radius: number, color: number): void {
		const mesh = new THREE.Mesh(
			this.ringGeo,
			new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
		);
		mesh.position.copy(at).setY(at.y + 0.08);
		this.scene.add(mesh);
		this.rings.push({ mesh, t: 0, max: 0.55, radius });
	}

	update(dt: number): void {
		for (let i = this.tracers.length - 1; i >= 0; i--) {
			const tr = this.tracers[i];
			tr.t -= dt;
			if (tr.t <= 0) {
				this.scene.remove(tr.mesh);
				this.tracers.splice(i, 1);
			}
		}
		for (let i = this.rings.length - 1; i >= 0; i--) {
			const r = this.rings[i];
			r.t += dt;
			const k = r.t / r.max;
			r.mesh.scale.setScalar(0.5 + k * r.radius);
			(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
			if (k >= 1) {
				this.scene.remove(r.mesh);
				(r.mesh.material as THREE.Material).dispose();
				this.rings.splice(i, 1);
			}
		}
	}

	clear(): void {
		for (const t of this.tracers) this.scene.remove(t.mesh);
		for (const r of this.rings) {
			this.scene.remove(r.mesh);
			(r.mesh.material as THREE.Material).dispose();
		}
		this.tracers.length = 0;
		this.rings.length = 0;
	}
}
