import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type AABB, canvasTexture, glowTexture, mulberry32, rayAABB } from './util';

/** City grid: 9×9 blocks on a 50 m pitch, 34 m blocks, 16 m streets. */
export const PITCH = 50;
export const BLOCK_HALF = 17;
export const GRID = 4; // blocks run from -GRID..GRID on each axis
export const BOUND = 236; // perimeter wall
export const SIDEWALK_H = 0.15;

const FACADE_M = 16; // one facade texture tile covers 16 m × 16 m

export interface Circle {
	x: number;
	z: number;
	r: number;
	h: number;
}

export interface SupplyCrate {
	pos: THREE.Vector3;
	used: boolean;
	strip: THREE.MeshStandardMaterial;
}

export interface MapRect {
	x: number;
	z: number;
	w: number;
	d: number;
	kind: 'building' | 'prop' | 'special';
}

export type LightKind = 'lamp' | 'flood' | 'fire' | 'police' | 'cyan';

export interface LightSpot {
	pos: THREE.Vector3;
	color: number;
	intensity: number;
	kind: LightKind;
	phase: number;
}

export interface RayHit {
	dist: number;
	normal: THREE.Vector3;
}

type BlockKind = 'city' | 'checkpoint' | 'relay' | 'reactor' | 'extraction' | 'park';

const SPECIAL: Record<string, BlockKind> = {
	'0,4': 'checkpoint',
	'3,-2': 'relay',
	'-3,-2': 'reactor',
	'0,-4': 'extraction',
	'0,0': 'park',
};

/** Mutable buffer used while building a merged mesh. */
class GeoBin {
	readonly geos: THREE.BufferGeometry[] = [];
	add(geo: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0): void {
		if (rotY) geo.rotateY(rotY);
		geo.translate(x, y, z);
		this.geos.push(geo);
	}
	mesh(mat: THREE.Material, shadows = true): THREE.Mesh | null {
		if (!this.geos.length) return null;
		const merged = mergeGeometries(this.geos, false);
		if (!merged) return null;
		const m = new THREE.Mesh(merged, mat);
		m.castShadow = shadows;
		m.receiveShadow = true;
		return m;
	}
}

function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
	const c = new THREE.Color(color);
	const n = geo.getAttribute('position').count;
	const arr = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) {
		arr[i * 3] = c.r;
		arr[i * 3 + 1] = c.g;
		arr[i * 3 + 2] = c.b;
	}
	geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
	return geo;
}

/** Facade with a window grid; returns the diffuse map and a matching emissive map. */
function facadeTextures(
	seed: number,
	wall: string,
	glass: string,
	litRatio: number,
): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
	const rng = mulberry32(seed);
	const S = 512;
	const cols = 6;
	const floors = 4;
	const cw = S / cols;
	const fh = S / floors;
	const lit: { x: number; y: number; w: number; h: number; c: string; blind: number }[] = [];

	const map = canvasTexture(S, S, (g) => {
		g.fillStyle = wall;
		g.fillRect(0, 0, S, S);
		// grime and rain streaks
		for (let i = 0; i < 2600; i++) {
			const v = Math.floor(rng() * 40) - 20;
			g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 400})`;
			g.fillRect(rng() * S, rng() * S, 2 + rng() * 3, 2 + rng() * 3);
		}
		for (let i = 0; i < 40; i++) {
			g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.08})`;
			g.fillRect(rng() * S, rng() * S * 0.8, 1 + rng() * 3, 40 + rng() * 160);
		}
		// floor slabs
		for (let f = 0; f < floors; f++) {
			g.fillStyle = 'rgba(0,0,0,0.35)';
			g.fillRect(0, f * fh + fh - 6, S, 6);
		}
		for (let f = 0; f < floors; f++) {
			for (let c = 0; c < cols; c++) {
				const x = c * cw + cw * 0.18;
				const y = f * fh + fh * 0.22;
				const w = cw * 0.64;
				const h = fh * 0.5;
				g.fillStyle = '#05070b';
				g.fillRect(x - 3, y - 3, w + 6, h + 6);
				g.fillStyle = glass;
				g.fillRect(x, y, w, h);
				// faint sky reflection
				const grad = g.createLinearGradient(x, y, x + w, y + h);
				grad.addColorStop(0, 'rgba(120,150,200,0.10)');
				grad.addColorStop(1, 'rgba(0,0,0,0)');
				g.fillStyle = grad;
				g.fillRect(x, y, w, h);
				g.fillStyle = 'rgba(0,0,0,0.6)';
				g.fillRect(x + w / 2 - 1, y, 2, h);
				// Bottom row of the canvas is the ground floor after flipY; keep it plinth-dark.
				if (f < floors - 1 && rng() < litRatio) {
					const warm = rng();
					const col = warm < 0.7 ? '#ffc877' : warm < 0.9 ? '#ffe3b0' : '#9fd4ff';
					lit.push({ x, y, w, h, c: col, blind: rng() < 0.4 ? rng() * 0.6 : 0 });
				}
			}
		}
		for (const l of lit) {
			g.fillStyle = l.c;
			g.fillRect(l.x, l.y, l.w, l.h);
			if (l.blind) {
				g.fillStyle = 'rgba(40,30,20,0.85)';
				g.fillRect(l.x, l.y, l.w, l.h * l.blind);
			}
		}
		// ground-floor plinth; roofs sample this strip too
		g.fillStyle = '#16171a';
		g.fillRect(0, S - 22, S, 22);
	});

	const emissive = canvasTexture(S, S, (g) => {
		g.fillStyle = '#000';
		g.fillRect(0, 0, S, S);
		for (const l of lit) {
			g.fillStyle = l.c;
			g.fillRect(l.x, l.y + l.h * l.blind, l.w, l.h * (1 - l.blind));
		}
	});
	return { map, emissive };
}

function signTexture(text: string, color: string): THREE.CanvasTexture {
	return canvasTexture(
		512,
		128,
		(g) => {
			g.fillStyle = '#050505';
			g.fillRect(0, 0, 512, 128);
			g.strokeStyle = color;
			g.lineWidth = 6;
			g.strokeRect(10, 10, 492, 108);
			let size = 76;
			do {
				g.font = `bold ${size}px "Arial Narrow", Arial, sans-serif`;
				size -= 4;
			} while (g.measureText(text).width > 440 && size > 20);
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.shadowColor = color;
			g.shadowBlur = 24;
			g.fillStyle = color;
			g.fillText(text, 256, 68);
		},
		{ repeat: false },
	);
}

interface Shop {
	x: number;
	z: number;
	w: number;
	d: number;
	side: number;
	width: number;
	along: number;
	variant: number;
}

/** Additive gradient for lamp cones and searchlight beams: bright at the apex, fading out. */
function beamMaterial(color: number, opacity: number, sky = false): THREE.MeshBasicMaterial {
	const alpha = canvasTexture(
		8,
		128,
		(g) => {
			// canvas top = uv v=1 = cone apex
			const grad = g.createLinearGradient(0, 0, 0, 128);
			grad.addColorStop(0, '#fff');
			grad.addColorStop(sky ? 0.55 : 0.35, '#555');
			grad.addColorStop(1, '#000');
			g.fillStyle = grad;
			g.fillRect(0, 0, 8, 128);
		},
		{ repeat: false, srgb: false },
	);
	return new THREE.MeshBasicMaterial({
		color,
		alphaMap: alpha,
		transparent: true,
		opacity,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.DoubleSide,
		fog: !sky,
		toneMapped: false,
	});
}

/** Height-noise asphalt turned into a tangent-space normal map. */
function asphaltNormal(): THREE.CanvasTexture {
	const S = 256;
	const h = new Float32Array(S * S);
	const rng = mulberry32(7);
	for (let i = 0; i < h.length; i++) h[i] = rng();
	for (let pass = 0; pass < 2; pass++) {
		const c = h.slice();
		for (let y = 0; y < S; y++)
			for (let x = 0; x < S; x++) {
				let sum = 0;
				for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += c[((y + dy + S) % S) * S + ((x + dx + S) % S)];
				h[y * S + x] = sum / 9;
			}
	}
	// hairline cracks
	for (let k = 0; k < 5; k++) {
		let x = rng() * S;
		let y = rng() * S;
		for (let st = 0; st < 60; st++) {
			x = (x + (rng() - 0.5) * 4 + S) % S;
			y = (y + rng() * 2 + S) % S;
			h[Math.floor(y) * S + Math.floor(x)] -= 0.6;
		}
	}
	return canvasTexture(
		S,
		S,
		(g) => {
			const img = g.createImageData(S, S);
			const n = new THREE.Vector3();
			for (let y = 0; y < S; y++)
				for (let x = 0; x < S; x++) {
					const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
					const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
					n.set(-dx * 4, -dy * 4, 1).normalize();
					const o = (y * S + x) * 4;
					img.data[o] = (n.x * 0.5 + 0.5) * 255;
					img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
					img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
					img.data[o + 3] = 255;
				}
			g.putImageData(img, 0, 0);
		},
		{ srgb: false },
	);
}

/**
 * Rain on asphalt: puddles (low roughness in the map) darken, turn mirror-glossy
 * and pick up expanding ripple rings; the whole street gets a faint ripple sheen.
 */
function wetShader(mat: THREE.MeshStandardMaterial, time: { value: number }): void {
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = time;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
			.replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
				varying vec3 vWPos;
				uniform float uTime;
				vec2 dsHash(vec2 p) {
					p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
					return fract(sin(p) * 43758.5453);
				}
				vec2 dsRipple(vec2 p, float t) {
					vec2 acc = vec2(0.0);
					vec2 cell = floor(p);
					vec2 f = fract(p);
					for (int j = -1; j <= 1; j++) {
						for (int i = -1; i <= 1; i++) {
							vec2 o = vec2(float(i), float(j));
							vec2 h = dsHash(cell + o);
							float ph = fract(t * (0.7 + h.y * 0.6) + h.x);
							vec2 d = f - (o + h);
							float r = length(d);
							float w = r - ph * 0.8;
							float ring = sin(w * 42.0) * exp(-w * w * 240.0) * (1.0 - ph) * (1.0 - ph);
							acc += (r > 1e-4 ? d / r : vec2(0.0)) * ring;
						}
					}
					return acc;
				}`,
			)
			.replace(
				'#include <roughnessmap_fragment>',
				`#include <roughnessmap_fragment>
				float dsWet = 1.0 - smoothstep(0.15, 0.5, roughnessFactor);
				diffuseColor.rgb *= mix(0.85, 0.35, dsWet);
				roughnessFactor = mix(roughnessFactor * 0.8, 0.03, dsWet);`,
			)
			.replace(
				'#include <normal_fragment_maps>',
				`#include <normal_fragment_maps>
				{
					float fade = 1.0 - smoothstep(12.0, 40.0, length(vWPos - cameraPosition));
					if (fade > 0.0) {
						vec2 rp = dsRipple(vWPos.xz * 2.4, uTime) + dsRipple(vWPos.xz * 3.3 + 17.0, uTime * 1.13);
						vec3 rN = vec3(rp.x, 0.0, rp.y) * 0.3 * (0.15 + dsWet * 0.85) * fade;
						normal = normalize(normal + (viewMatrix * vec4(rN, 0.0)).xyz);
					}
				}`,
			);
	};
	mat.customProgramCacheKey = () => 'ds-wet-asphalt';
}

/** Four ground-floor shop variants in a 2×2 atlas: lit store, shutter, dark wreck, neon bar. */
function storefrontAtlas(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
	const draw = (g: CanvasRenderingContext2D, emissive: boolean) => {
		const rng = mulberry32(404);
		for (let v = 0; v < 4; v++) {
			const x0 = (v % 2) * 512;
			const y0 = v < 2 ? 0 : 256; // canvas top half = uv top half after flipY
			g.save();
			g.translate(x0, y0);
			g.beginPath();
			g.rect(0, 0, 512, 256);
			g.clip();
			const fill = (c: string) => {
				g.fillStyle = c;
				g.fillRect(0, 0, 512, 256);
			};
			if (v === 0) {
				// lit convenience store
				if (emissive) {
					fill('#000');
					const grad = g.createLinearGradient(0, 30, 0, 230);
					grad.addColorStop(0, '#fff2d0');
					grad.addColorStop(1, '#c98a40');
					g.fillStyle = grad;
					g.fillRect(24, 34, 464, 200);
					g.fillStyle = 'rgba(0,0,0,0.75)';
					for (let k = 0; k < 4; k++) g.fillRect(40 + k * 115, 90, 90, 12);
					for (let k = 0; k < 14; k++) g.fillRect(40 + rng() * 420, 150 + rng() * 70, 14 + rng() * 20, 30 + rng() * 40);
					g.fillStyle = '#ff3a3a';
					g.fillRect(24, 8, 464, 20);
				} else {
					fill('#1a1b1e');
					g.fillStyle = '#e8d8b0';
					g.fillRect(24, 34, 464, 200);
					g.fillStyle = '#7a1a14';
					g.fillRect(24, 8, 464, 20);
					for (let k = 0; k < 18; k++) rng();
				}
				g.fillStyle = '#0d0e10';
				for (let k = 0; k <= 4; k++) g.fillRect(20 + k * 116, 30, 8, 210);
				g.fillRect(20, 124, 472, 6);
			} else if (v === 1) {
				// rolling shutter + graffiti
				fill(emissive ? '#000' : '#4a4c50');
				if (!emissive) {
					for (let y = 10; y < 256; y += 9) {
						g.fillStyle = y % 18 ? '#55585c' : '#3a3c40';
						g.fillRect(16, y, 480, 5);
					}
					const tags = ['#e0403a', '#3ac0e0', '#e0c03a', '#e8e8e8'];
					g.lineWidth = 9;
					g.lineCap = 'round';
					for (let k = 0; k < 5; k++) {
						g.strokeStyle = tags[k % tags.length];
						g.beginPath();
						let x = 60 + rng() * 380;
						let y = 60 + rng() * 140;
						g.moveTo(x, y);
						for (let st = 0; st < 6; st++) {
							x += (rng() - 0.3) * 60;
							y += (rng() - 0.5) * 60;
							g.lineTo(x, y);
						}
						g.stroke();
					}
				}
			} else if (v === 2) {
				// dead store: cracked glass, one monitor still glowing
				fill(emissive ? '#000' : '#0b0d10');
				if (!emissive) {
					g.strokeStyle = 'rgba(200,220,255,0.25)';
					g.lineWidth = 2;
					for (let k = 0; k < 12; k++) {
						g.beginPath();
						g.moveTo(180, 110);
						g.lineTo(180 + (rng() - 0.5) * 400, 110 + (rng() - 0.5) * 250);
						g.stroke();
					}
				}
				g.fillStyle = emissive ? '#3a78ff' : '#9ab8ff';
				g.fillRect(300, 130, 60, 40);
			} else {
				// neon bar front
				fill(emissive ? '#000' : '#120d14');
				g.strokeStyle = '#ff2f8a';
				g.lineWidth = 7;
				g.shadowColor = '#ff2f8a';
				g.shadowBlur = emissive ? 20 : 0;
				g.strokeRect(30, 30, 452, 200);
				g.font = 'bold 64px "Arial Narrow", Arial, sans-serif';
				g.textAlign = 'center';
				g.fillStyle = '#39e8ff';
				g.shadowColor = '#39e8ff';
				g.fillText('OPEN', 256, 150);
				if (emissive) {
					g.fillStyle = 'rgba(160,60,200,0.35)';
					g.fillRect(40, 40, 432, 180);
				}
			}
			g.restore();
		}
	};
	return {
		map: canvasTexture(1024, 512, (g) => draw(g, false), { repeat: false }),
		emissive: canvasTexture(1024, 512, (g) => draw(g, true), { repeat: false }),
	};
}

export class World {
	readonly group = new THREE.Group();
	readonly boxes: AABB[] = [];
	readonly circles: Circle[] = [];
	readonly rects: MapRect[] = [];
	readonly supplies: SupplyCrate[] = [];
	readonly spawn = new THREE.Vector3(0, 0, 214);
	readonly relayPos = new THREE.Vector3(3 * PITCH, 0, -2 * PITCH);
	readonly reactorPos = new THREE.Vector3(-3 * PITCH, 0, -2 * PITCH);
	readonly extractionPos = new THREE.Vector3(0, 0, -4 * PITCH);
	/** Positions on streets where spawns are valid. */
	readonly streetNodes: THREE.Vector3[] = [];

	private readonly hash = new Map<number, number[]>();
	readonly lights: LightSpot[] = [];
	/** Burning barrels; the game emits flame particles from these. */
	readonly fires: THREE.Vector3[] = [];
	private readonly lightPool: THREE.PointLight[] = [];
	private readonly assigned: (LightSpot | null)[] = [];
	private lightBudget = 10;
	private lightTimer = 0;
	private readonly groundTime = { value: 0 };
	private cones: THREE.InstancedMesh | null = null;
	private readonly policeRed = new THREE.MeshBasicMaterial({ color: 0xff1a1a, toneMapped: false });
	private readonly policeBlue = new THREE.MeshBasicMaterial({ color: 0x1a4dff, toneMapped: false });
	private readonly trafficMat = new THREE.MeshBasicMaterial({ color: 0xffa21a, toneMapped: false });
	private readonly searchlights: THREE.Object3D[] = [];
	private carGeo: THREE.BufferGeometry | null = null;
	private readonly blinkMat: THREE.MeshBasicMaterial;
	private readonly beaconMat: THREE.MeshBasicMaterial;
	private readonly reactorMat: THREE.MeshStandardMaterial;
	private readonly padLightMat: THREE.MeshBasicMaterial;
	private readonly relayDish: THREE.Object3D;
	private relayActive = false;
	private extractionLive = false;

	constructor(scene: THREE.Scene) {
		scene.add(this.group);
		const rng = mulberry32(1337);

		this.blinkMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
		this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
		this.padLightMat = new THREE.MeshBasicMaterial({ color: 0x331111 });
		this.reactorMat = new THREE.MeshStandardMaterial({
			color: 0x0a2a30,
			emissive: 0x33e6ff,
			emissiveIntensity: 2,
		});

		this.buildGround();
		const facades = [
			facadeTextures(11, '#55535a', '#0d1219', 0.2),
			facadeTextures(23, '#5c4238', '#10141a', 0.16),
			facadeTextures(37, '#3c4552', '#0c1522', 0.24),
			facadeTextures(51, '#66625a', '#0e1116', 0.14),
		];
		const facadeMats = facades.map(
			(f) =>
				new THREE.MeshStandardMaterial({
					map: f.map,
					emissiveMap: f.emissive,
					emissive: 0xffffff,
					emissiveIntensity: 0.9,
					roughness: 0.82,
					envMapIntensity: 0.6,
				}),
		);
		const bins = facadeMats.map(() => new GeoBin());
		const roofBin = new GeoBin();
		const antennaLights: THREE.Vector3[] = [];
		const signs: { pos: THREE.Vector3; rot: number; text: string; color: string }[] = [];
		const shops: Shop[] = [];

		for (let i = -GRID; i <= GRID; i++) {
			for (let j = -GRID; j <= GRID; j++) {
				const cx = i * PITCH;
				const cz = j * PITCH;
				const kind = SPECIAL[`${i},${j}`] ?? 'city';
				if (kind !== 'city') {
					this.rects.push({ x: cx, z: cz, w: BLOCK_HALF * 2, d: BLOCK_HALF * 2, kind: 'special' });
					continue;
				}
				for (const lot of this.subdivide(rng)) {
					const inset = 0.6 + rng() * 1.6;
					const w = lot.w - inset * 2;
					const d = lot.d - inset * 2;
					const x = cx + lot.x;
					const z = cz + lot.z;
					const centrality = 1 - Math.min(1, Math.hypot(x, z) / 260);
					let h = 10 + rng() * 22 + centrality * rng() * 40;
					if (rng() < 0.08) h += 30;
					h = Math.round(h / 4) * 4;
					const v = Math.floor(rng() * bins.length);
					bins[v].geos.push(this.buildingGeo(x, z, w, h, d, rng));
					this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
					this.rects.push({ x, z, w, d, kind: 'building' });
					for (let side = 0; side < 4; side++) {
						if (rng() > 0.5) continue;
						const faceW = side < 2 ? d : w;
						const sw = Math.min(faceW - 2, 5 + rng() * 6);
						if (sw < 3) continue;
						const along = (rng() - 0.5) * (faceW - sw - 1);
						const variant = Math.floor(rng() * 4);
						shops.push({ x, z, w, d, side, width: sw, along, variant });
					}
					// roof clutter
					roofBin.add(new THREE.BoxGeometry(w + 0.4, 0.8, d + 0.4), x, h + 0.4, z);
					const units = 1 + Math.floor(rng() * 3);
					for (let u = 0; u < units; u++) {
						roofBin.add(
							new THREE.BoxGeometry(1.5 + rng() * 2, 1 + rng(), 1.5 + rng() * 2),
							x + (rng() - 0.5) * (w - 4),
							h + 1.2,
							z + (rng() - 0.5) * (d - 4),
						);
					}
					if (h > 44) {
						roofBin.add(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), x, h + 4.5, z);
						antennaLights.push(new THREE.Vector3(x, h + 9, z));
					}
					if (rng() < 0.22) {
						const side = Math.floor(rng() * 4);
						const texts = ['NOODLE', '24 HR', 'HOTEL', 'PHARMACY', 'BAR', 'PAWN', 'OPEN', 'MOTEL', 'LIQUOR'];
						const colors = ['#ff3d7f', '#36e0ff', '#ffb02e', '#8bff5a', '#ff5a36'];
						const sx = side === 0 ? x + w / 2 + 0.12 : side === 1 ? x - w / 2 - 0.12 : x;
						const sz = side === 2 ? z + d / 2 + 0.12 : side === 3 ? z - d / 2 - 0.12 : z;
						const rot = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI;
						signs.push({
							pos: new THREE.Vector3(sx, 4.6 + rng() * 3, sz),
							rot,
							text: texts[Math.floor(rng() * texts.length)],
							color: colors[Math.floor(rng() * colors.length)],
						});
					}
				}
			}
		}

		bins.forEach((b, i) => {
			const m = b.mesh(facadeMats[i]);
			if (m) this.group.add(m);
		});
		const roof = roofBin.mesh(new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.95, envMapIntensity: 0.2 }));
		if (roof) this.group.add(roof);

		for (const p of antennaLights) {
			const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), this.blinkMat);
			m.position.copy(p);
			this.group.add(m);
		}
		for (const s of signs) {
			const tex = signTexture(s.text, s.color);
			const m = new THREE.Mesh(
				new THREE.PlaneGeometry(5, 1.25),
				new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
			);
			m.position.copy(s.pos);
			m.rotation.y = s.rot;
			this.group.add(m);
		}

		this.buildStorefronts(shops);
		this.buildSkyline(facadeMats[0], rng);
		this.buildStreets(rng);
		this.buildCheckpoint();
		this.buildRelay();
		this.buildReactor();
		this.buildExtraction();
		this.buildPark(rng);
		this.buildPerimeter();
		this.buildPolice();
		this.buildFires();
		this.buildSearchlights();

		this.relayDish = this.group.getObjectByName('relay-dish') ?? new THREE.Object3D();

		for (let k = 0; k < 16; k++) {
			const l = new THREE.PointLight(0xffc27a, 0, 24, 1.6);
			l.visible = k < this.lightBudget;
			this.lightPool.push(l);
			this.assigned.push(null);
			this.group.add(l);
		}
	}

	// ── generation ──────────────────────────────────────────────────────────

	private subdivide(rng: () => number): { x: number; z: number; w: number; d: number }[] {
		const S = BLOCK_HALF * 2;
		const alley = 3;
		const r = rng();
		if (r < 0.3) return [{ x: 0, z: 0, w: S, d: S }];
		if (r < 0.65) {
			const half = (S - alley) / 2;
			const off = (half + alley) / 2;
			return rng() < 0.5
				? [
						{ x: -off, z: 0, w: half, d: S },
						{ x: off, z: 0, w: half, d: S },
					]
				: [
						{ x: 0, z: -off, w: S, d: half },
						{ x: 0, z: off, w: S, d: half },
					];
		}
		const q = (S - alley) / 2;
		const o = (q + alley) / 2;
		return [
			{ x: -o, z: -o, w: q, d: q },
			{ x: o, z: -o, w: q, d: q },
			{ x: -o, z: o, w: q, d: q },
			{ x: o, z: o, w: q, d: q },
		];
	}

	/** Box with UVs scaled so the facade tile keeps real-world size on every face. */
	private buildingGeo(x: number, z: number, w: number, h: number, d: number, rng: () => number): THREE.BufferGeometry {
		const geo = new THREE.BoxGeometry(w, h, d);
		const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
		// face order: +x, -x, +y, -y, +z, -z
		const faceWidth = [d, d, 0, 0, w, w];
		for (let f = 0; f < 6; f++) {
			const shift = Math.floor(rng() * 6) / 6;
			for (let k = 0; k < 4; k++) {
				const i = f * 4 + k;
				if (f === 2 || f === 3) {
					uv.setXY(i, 0.5, 0.01);
				} else {
					uv.setXY(i, uv.getX(i) * (faceWidth[f] / FACADE_M) + shift, uv.getY(i) * (h / FACADE_M));
				}
			}
		}
		geo.translate(x, h / 2, z);
		return geo;
	}

	private buildSkyline(mat: THREE.Material, rng: () => number): void {
		const bin = new GeoBin();
		for (let a = 0; a < 90; a++) {
			const ang = (a / 90) * Math.PI * 2;
			const r = 290 + rng() * 120;
			const w = 20 + rng() * 30;
			const h = 30 + rng() * 90;
			const geo = new THREE.BoxGeometry(w, h, w);
			const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
			for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / FACADE_M), uv.getY(i) * (h / FACADE_M));
			bin.add(geo, Math.cos(ang) * r, h / 2, Math.sin(ang) * r, rng() * Math.PI);
		}
		const m = bin.mesh(mat, false);
		if (m) this.group.add(m);
	}

	private buildGround(): void {
		const asphalt = canvasTexture(512, 512, (g) => {
			g.fillStyle = '#17181c';
			g.fillRect(0, 0, 512, 512);
			for (let i = 0; i < 9000; i++) {
				const v = Math.random();
				g.fillStyle = `rgba(${v > 0.5 ? '200,200,210' : '0,0,0'},${0.03 + Math.random() * 0.06})`;
				g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
			}
			g.strokeStyle = 'rgba(0,0,0,0.55)';
			g.lineWidth = 1.5;
			for (let i = 0; i < 7; i++) {
				g.beginPath();
				let x = Math.random() * 512;
				let y = Math.random() * 512;
				g.moveTo(x, y);
				for (let s = 0; s < 8; s++) {
					x += (Math.random() - 0.5) * 60;
					y += (Math.random() - 0.5) * 60;
					g.lineTo(x, y);
				}
				g.stroke();
			}
		});
		// Puddles: dark and glossy in the roughness map.
		const puddles: [number, number, number, number][] = [];
		for (let i = 0; i < 7; i++) puddles.push([Math.random() * 512, Math.random() * 512, 30 + Math.random() * 70, 14 + Math.random() * 40]);
		const rough = canvasTexture(
			512,
			512,
			(g) => {
				g.fillStyle = '#c8c8c8';
				g.fillRect(0, 0, 512, 512);
				for (const [x, y, rx, ry] of puddles) {
					g.fillStyle = '#141414';
					g.beginPath();
					g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
					g.fill();
				}
			},
			{ srgb: false },
		);
		asphalt.repeat.set(60, 60);
		rough.repeat.set(60, 60);
		const normal = asphaltNormal();
		normal.repeat.set(60, 60);
		const groundMat = new THREE.MeshStandardMaterial({
			map: asphalt,
			roughnessMap: rough,
			roughness: 1,
			metalness: 0.2,
			normalMap: normal,
			normalScale: new THREE.Vector2(0.35, 0.35),
			envMapIntensity: 1.25,
		});
		wetShader(groundMat, this.groundTime);
		const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
		ground.rotation.x = -Math.PI / 2;
		ground.receiveShadow = true;
		this.group.add(ground);

		const tile = canvasTexture(256, 256, (g) => {
			g.fillStyle = '#34353a';
			g.fillRect(0, 0, 256, 256);
			for (let i = 0; i < 3000; i++) {
				g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
				g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
			}
			g.strokeStyle = '#1e1f23';
			g.lineWidth = 3;
			for (let k = 0; k <= 256; k += 64) {
				g.beginPath();
				g.moveTo(k, 0);
				g.lineTo(k, 256);
				g.moveTo(0, k);
				g.lineTo(256, k);
				g.stroke();
			}
		});
		const bin = new GeoBin();
		for (let i = -GRID; i <= GRID; i++) {
			for (let j = -GRID; j <= GRID; j++) {
				const geo = new THREE.BoxGeometry(BLOCK_HALF * 2, SIDEWALK_H, BLOCK_HALF * 2);
				const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
				for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 17, uv.getY(k) * 17);
				bin.add(geo, i * PITCH, SIDEWALK_H / 2, j * PITCH);
			}
		}
		const walks = bin.mesh(new THREE.MeshStandardMaterial({ map: tile, roughness: 0.55, envMapIntensity: 0.6 }), false);
		if (walks) this.group.add(walks);
	}

	private buildStreets(rng: () => number): void {
		const lines = [];
		for (let k = -GRID - 1; k <= GRID; k++) lines.push(k * PITCH + PITCH / 2);
		// Dashed centre lines, skipping intersections.
		const dash = new THREE.PlaneGeometry(0.22, 3);
		dash.rotateX(-Math.PI / 2);
		const dashes: THREE.Matrix4[] = [];
		const m4 = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const up = new THREE.Vector3(0, 1, 0);
		for (const s of lines) {
			for (let t = -BOUND + 4; t < BOUND - 4; t += 7) {
				const nearCross = lines.some((c) => Math.abs(t - c) < 10);
				if (nearCross) continue;
				dashes.push(new THREE.Matrix4().compose(new THREE.Vector3(s, 0.02, t), q.identity(), new THREE.Vector3(1, 1, 1)));
				dashes.push(
					new THREE.Matrix4().compose(
						new THREE.Vector3(t, 0.02, s),
						new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2),
						new THREE.Vector3(1, 1, 1),
					),
				);
			}
			// street nodes for spawning: intersections
			for (const c of lines) this.streetNodes.push(new THREE.Vector3(s, 0, c));
		}
		const dashMesh = new THREE.InstancedMesh(dash, new THREE.MeshStandardMaterial({ color: 0xb59a3a, roughness: 0.6 }), dashes.length);
		dashes.forEach((m, i) => dashMesh.setMatrixAt(i, m));
		this.group.add(dashMesh);

		// Crosswalk stripes on each intersection approach.
		const stripe = new THREE.PlaneGeometry(0.6, 4);
		stripe.rotateX(-Math.PI / 2);
		const stripes: THREE.Matrix4[] = [];
		for (const sx of lines) {
			for (const sz of lines) {
				for (let k = -3; k <= 3; k++) {
					const o = k * 1.2;
					stripes.push(m4.clone().compose(new THREE.Vector3(sx + o, 0.021, sz + 10.5), q.identity(), new THREE.Vector3(1, 1, 1)));
					stripes.push(m4.clone().compose(new THREE.Vector3(sx + o, 0.021, sz - 10.5), q.identity(), new THREE.Vector3(1, 1, 1)));
					const r = new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2);
					stripes.push(m4.clone().compose(new THREE.Vector3(sx + 10.5, 0.021, sz + o), r, new THREE.Vector3(1, 1, 1)));
					stripes.push(m4.clone().compose(new THREE.Vector3(sx - 10.5, 0.021, sz + o), r, new THREE.Vector3(1, 1, 1)));
				}
			}
		}
		const stripeMesh = new THREE.InstancedMesh(
			stripe,
			new THREE.MeshStandardMaterial({ color: 0x8d8d86, roughness: 0.7 }),
			stripes.length,
		);
		stripes.forEach((m, i) => stripeMesh.setMatrixAt(i, m));
		this.group.add(stripeMesh);

		// Street lamps along both axes, alternating sides.
		const lampSpots: { x: number; z: number; ax: number; az: number }[] = [];
		for (const s of lines) {
			let n = 0;
			for (let t = -BOUND + 12; t < BOUND - 8; t += 26) {
				if (lines.some((c) => Math.abs(t - c) < 11)) continue;
				const side = n++ % 2 === 0 ? 1 : -1;
				lampSpots.push({ x: s + side * 8.6, z: t, ax: -side, az: 0 });
				lampSpots.push({ x: t, z: s + side * 8.6, ax: 0, az: -side });
			}
		}
		const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 7.4, 6);
		const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.2);
		const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.9);
		const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.4 });
		const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
		const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
		const arms = new THREE.InstancedMesh(armGeo, poleMat, lampSpots.length);
		const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
		poles.castShadow = arms.castShadow = true;
		const glowPos: number[] = [];
		const poolMats: THREE.Matrix4[] = [];
		const coneMats: THREE.Matrix4[] = [];
		lampSpots.forEach((l, i) => {
			const rot = Math.atan2(l.ax, l.az);
			const r = new THREE.Quaternion().setFromAxisAngle(up, rot);
			poles.setMatrixAt(i, m4.clone().compose(new THREE.Vector3(l.x, 3.7, l.z), q.identity(), new THREE.Vector3(1, 1, 1)));
			arms.setMatrixAt(i, m4.clone().compose(new THREE.Vector3(l.x + l.ax, 7.3, l.z + l.az), r, new THREE.Vector3(1, 1, 1)));
			const hx = l.x + l.ax * 1.9;
			const hz = l.z + l.az * 1.9;
			const broken = rng() < 0.12;
			heads.setMatrixAt(i, m4.clone().compose(new THREE.Vector3(hx, 7.2, hz), r, new THREE.Vector3(1, 1, 1)));
			heads.setColorAt(i, new THREE.Color(broken ? 0x222222 : 0xffe2b0));
			this.addBox(l.x - 0.2, l.x + 0.2, l.z - 0.2, l.z + 0.2, 7.4, false);
			if (!broken) {
				glowPos.push(hx, 7.05, hz);
				poolMats.push(m4.clone().compose(new THREE.Vector3(hx, 0.17, hz), q.identity(), new THREE.Vector3(1, 1, 1)));
				this.addLight(new THREE.Vector3(hx, 6.8, hz));
				coneMats.push(m4.clone().compose(new THREE.Vector3(hx, 3.6, hz), q.identity(), new THREE.Vector3(1, 1, 1)));
			}
		});
		this.group.add(poles, arms, heads);

		const glowGeo = new THREE.BufferGeometry();
		glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
		const glow = new THREE.Points(
			glowGeo,
			new THREE.PointsMaterial({
				size: 4.5,
				map: glowTexture('rgba(255,210,150,1)', 'rgba(255,180,100,0)'),
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				color: 0xffd6a0,
				opacity: 0.8,
			}),
		);
		this.group.add(glow);

		const poolGeo = new THREE.PlaneGeometry(12, 12);
		poolGeo.rotateX(-Math.PI / 2);
		const pools = new THREE.InstancedMesh(
			poolGeo,
			new THREE.MeshBasicMaterial({
				map: glowTexture('rgba(255,190,120,1)', 'rgba(255,160,80,0)'),
				transparent: true,
				opacity: 0.22,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				polygonOffset: true,
				polygonOffsetFactor: -2,
			}),
			poolMats.length,
		);
		poolMats.forEach((m, i) => pools.setMatrixAt(i, m));
		this.group.add(pools);

		// Volumetric-looking light cones: additive, fading from the lamp head down.
		const coneGeo = new THREE.ConeGeometry(3.4, 7.2, 28, 1, true);
		const cones = new THREE.InstancedMesh(coneGeo, beamMaterial(0xffc98a, 0.055), coneMats.length);
		coneMats.forEach((m, i) => cones.setMatrixAt(i, m));
		cones.frustumCulled = false;
		this.cones = cones;
		this.group.add(cones);

		this.buildTrafficLights(lines, rng);

		this.buildCars(lines, rng);
		this.buildClutter(rng);
	}

	private buildCars(lines: number[], rng: () => number): void {
		const parts: THREE.BufferGeometry[] = [];
		const body = paint(new THREE.BoxGeometry(1.9, 0.75, 4.4), 0xffffff);
		body.translate(0, 0.62, 0);
		const cabin = paint(new THREE.BoxGeometry(1.7, 0.62, 2.3), 0xdddddd);
		cabin.translate(0, 1.3, -0.2);
		const glass = paint(new THREE.BoxGeometry(1.74, 0.46, 2.0), 0x0a0c10);
		glass.translate(0, 1.32, -0.2);
		parts.push(body, cabin, glass);
		for (const [x, z] of [
			[0.86, 1.35],
			[-0.86, 1.35],
			[0.86, -1.35],
			[-0.86, -1.35],
		]) {
			const w = paint(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), 0x111111);
			w.rotateZ(Math.PI / 2);
			w.translate(x, 0.36, z);
			parts.push(w);
		}
		const tail = paint(new THREE.BoxGeometry(1.6, 0.14, 0.05), 0x550808);
		tail.translate(0, 0.8, -2.21);
		parts.push(tail);
		const geo = mergeGeometries(parts, false);
		if (!geo) return;
		this.carGeo = geo;
		const colors = [0x2b3240, 0x5a1d1d, 0x6b6b6b, 0x9b9b95, 0x1f3b2c, 0x2a2a2a, 0x4a3b22];
		const spots: THREE.Matrix4[] = [];
		const tints: THREE.Color[] = [];
		const up = new THREE.Vector3(0, 1, 0);
		for (const s of lines) {
			for (let t = -BOUND + 10; t < BOUND - 10; t += 9) {
				if (lines.some((c) => Math.abs(t - c) < 13)) continue;
				for (const vertical of [true, false]) {
					if (rng() > 0.13) continue;
					const side = rng() < 0.5 ? 1 : -1;
					const lane = side * 5.4;
					const x = vertical ? s + lane : t;
					const z = vertical ? t : s + lane;
					const wreck = rng() < 0.25;
					const rot = (vertical ? 0 : Math.PI / 2) + (rng() < 0.5 ? 0 : Math.PI) + (wreck ? (rng() - 0.5) * 0.7 : 0);
					const mat = new THREE.Matrix4().compose(
						new THREE.Vector3(x, 0, z),
						new THREE.Quaternion().setFromAxisAngle(up, rot),
						new THREE.Vector3(1, 1, 1),
					);
					spots.push(mat);
					tints.push(new THREE.Color(colors[Math.floor(rng() * colors.length)]).multiplyScalar(wreck ? 0.5 : 1));
					const hw = vertical ? 1.1 : 2.3;
					const hd = vertical ? 2.3 : 1.1;
					this.addBox(x - hw, x + hw, z - hd, z + hd, 1.6);
					this.rects.push({ x, z, w: hw * 2, d: hd * 2, kind: 'prop' });
				}
			}
		}
		const mesh = new THREE.InstancedMesh(
			geo,
			new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 }),
			spots.length,
		);
		spots.forEach((m, i) => {
			mesh.setMatrixAt(i, m);
			mesh.setColorAt(i, tints[i]);
		});
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.group.add(mesh);
	}

	/** Jersey barriers and dumpsters to break up sight lines. */
	private buildClutter(rng: () => number): void {
		const barrierGeo = new THREE.BoxGeometry(3.2, 1.0, 0.6);
		const dumpGeo = new THREE.BoxGeometry(2.2, 1.4, 1.4);
		const bMats: THREE.Matrix4[] = [];
		const dMats: THREE.Matrix4[] = [];
		for (let k = 0; k < 70; k++) {
			const i = Math.floor(rng() * (GRID * 2 + 1)) - GRID;
			const j = Math.floor(rng() * (GRID * 2 + 1)) - GRID;
			const vertical = rng() < 0.5;
			const along = (rng() - 0.5) * 28;
			const lane = (rng() - 0.5) * 10;
			const sx = i * PITCH + PITCH / 2;
			const sz = j * PITCH;
			const x = vertical ? sx + lane : i * PITCH + along;
			const z = vertical ? sz + along : j * PITCH + PITCH / 2 + lane;
			if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 18) continue;
			const rot = vertical ? (rng() < 0.5 ? 0 : Math.PI / 2) : rng() < 0.5 ? Math.PI / 2 : 0;
			const m = new THREE.Matrix4().compose(
				new THREE.Vector3(x, 0.5, z),
				new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
				new THREE.Vector3(1, 1, 1),
			);
			const hw = Math.abs(Math.cos(rot)) > 0.5 ? 1.6 : 0.3;
			const hd = Math.abs(Math.cos(rot)) > 0.5 ? 0.3 : 1.6;
			if (rng() < 0.7) {
				bMats.push(m);
				this.addBox(x - hw, x + hw, z - hd, z + hd, 1);
				this.rects.push({ x, z, w: hw * 2, d: hd * 2, kind: 'prop' });
			} else {
				m.setPosition(x, 0.7, z);
				dMats.push(m);
				this.addBox(x - 1.1, x + 1.1, z - 0.7, z + 0.7, 1.4);
				this.rects.push({ x, z, w: 2.2, d: 1.4, kind: 'prop' });
			}
		}
		const b = new THREE.InstancedMesh(barrierGeo, new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 0.9 }), bMats.length);
		bMats.forEach((m, i) => b.setMatrixAt(i, m));
		const d = new THREE.InstancedMesh(dumpGeo, new THREE.MeshStandardMaterial({ color: 0x1f3a2a, roughness: 0.7, metalness: 0.3 }), dMats.length);
		dMats.forEach((m, i) => d.setMatrixAt(i, m));
		b.castShadow = d.castShadow = true;
		this.group.add(b, d);
	}

	private supplyCrate(x: number, z: number, rot = 0): void {
		const g = new THREE.Group();
		const box = new THREE.Mesh(
			new THREE.BoxGeometry(1.6, 0.9, 1.0),
			new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.8 }),
		);
		box.position.y = 0.45;
		box.castShadow = true;
		const strip = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x7dff9a, emissiveIntensity: 1.2 });
		const s = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 1.02), strip);
		s.position.y = 0.72;
		g.add(box, s);
		g.position.set(x, 0, z);
		g.rotation.y = rot;
		this.group.add(g);
		this.addBox(x - 0.8, x + 0.8, z - 0.8, z + 0.8, 0.9);
		this.supplies.push({ pos: new THREE.Vector3(x, 0, z), used: false, strip });
	}

	private buildCheckpoint(): void {
		const cx = 0;
		const cz = 4 * PITCH;
		const concrete = new THREE.MeshStandardMaterial({ color: 0x77766f, roughness: 0.9 });
		const sand = new THREE.MeshStandardMaterial({ color: 0x6b5d40, roughness: 1 });
		const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, h: number, collide = true) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, z);
			m.castShadow = m.receiveShadow = true;
			this.group.add(m);
			if (collide) {
				geo.computeBoundingBox();
				const bb = geo.boundingBox;
				if (bb) this.addBox(x + bb.min.x, x + bb.max.x, z + bb.min.z, z + bb.max.z, h);
			}
			return m;
		};
		// barrier gates across the northern street exit
		for (let k = -3; k <= 3; k++) if (Math.abs(k) > 1) add(new THREE.BoxGeometry(3.2, 1, 0.6), concrete, cx + k * 3.4, 0.5, cz - 20, 1);
		// sandbag nests
		for (const [x, z] of [
			[-9, -10],
			[9, -10],
		]) {
			add(new THREE.BoxGeometry(4, 1.1, 1), sand, cx + x, 0.55, cz + z, 1.1);
			add(new THREE.BoxGeometry(1, 1.1, 3), sand, cx + x + (x < 0 ? -2 : 2), 0.55, cz + z + 1.5, 1.1);
		}
		// tent
		const tent = new THREE.Mesh(
			new THREE.CylinderGeometry(0.01, 4.5, 3.5, 4, 1),
			new THREE.MeshStandardMaterial({ color: 0x3a4430, roughness: 1 }),
		);
		tent.rotation.y = Math.PI / 4;
		tent.scale.set(1.4, 1, 1);
		tent.position.set(cx + 8, 1.75, cz + 8);
		tent.castShadow = true;
		this.group.add(tent);
		this.addBox(cx + 3.5, cx + 12.5, cz + 4, cz + 12, 3.5);
		// floodlight masts (they also join the lamp list so the light pool picks them up)
		for (const x of [-14, 14]) {
			add(new THREE.CylinderGeometry(0.15, 0.2, 9, 6), concrete, cx + x, 4.5, cz - 14, 9);
			const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.4), new THREE.MeshBasicMaterial({ color: 0xe9f3ff }));
			head.position.set(cx + x, 9, cz - 14);
			this.group.add(head);
			this.addLight(new THREE.Vector3(cx + x, 8.5, cz - 15), 0xdfe9ff, 90, 'flood');
		}
		const sign = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 2),
			new THREE.MeshBasicMaterial({ map: signTexture('CHECKPOINT 3', '#e3c15a'), toneMapped: false }),
		);
		sign.position.set(cx, 4.2, cz - 20.4);
		this.group.add(sign);
		add(new THREE.BoxGeometry(0.2, 4, 0.2), concrete, cx - 3.9, 2, cz - 20.4, 4);
		add(new THREE.BoxGeometry(0.2, 4, 0.2), concrete, cx + 3.9, 2, cz - 20.4, 4);
		this.supplyCrate(cx - 6, cz + 6, 0.3);
	}

	private buildRelay(): void {
		const { x: cx, z: cz } = this.relayPos;
		const colors = [0x8a2b1c, 0x1c4a6a, 0x6a5a1c, 0x2d5a2d, 0x555555];
		const rng = mulberry32(99);
		const bin: { geo: THREE.BufferGeometry; color: number }[] = [];
		const place = (x: number, z: number, rotated: boolean, stack: number) => {
			for (let s = 0; s < stack; s++) {
				const geo = new THREE.BoxGeometry(rotated ? 6 : 2.5, 2.6, rotated ? 2.5 : 6);
				geo.translate(cx + x, 1.3 + s * 2.6, cz + z);
				bin.push({ geo, color: colors[Math.floor(rng() * colors.length)] });
			}
			this.addBox(cx + x - (rotated ? 3 : 1.25), cx + x + (rotated ? 3 : 1.25), cz + z - (rotated ? 1.25 : 3), cz + z + (rotated ? 1.25 : 3), 2.6 * stack);
			this.rects.push({ x: cx + x, z: cz + z, w: rotated ? 6 : 2.5, d: rotated ? 2.5 : 6, kind: 'prop' });
		};
		place(-11, -10, false, 2);
		place(-8, -10, false, 1);
		place(11, -9, true, 2);
		place(10, 11, false, 1);
		place(-11, 10, true, 3);
		place(0, 13, true, 1);
		place(13, 2, false, 1);
		const merged = mergeGeometries(bin.map((b) => paint(b.geo, b.color)), false);
		if (merged) {
			const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4 }));
			m.castShadow = m.receiveShadow = true;
			this.group.add(m);
		}
		// lattice tower
		const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.5, metalness: 0.6 });
		const tower = new THREE.Group();
		for (const [x, z] of [
			[-1, -1],
			[1, -1],
			[-1, 1],
			[1, 1],
		]) {
			const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 16, 0.18), steel);
			leg.position.set(x, 8, z);
			leg.castShadow = true;
			tower.add(leg);
		}
		for (let y = 1; y < 16; y += 2) {
			for (const r of [0, Math.PI / 2]) {
				for (const s of [-1, 1]) {
					const brace = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.08), steel);
					brace.position.set(r ? s : 0, y, r ? 0 : s);
					brace.rotation.set(0, r, 0.6);
					tower.add(brace);
				}
			}
		}
		const dish = new THREE.Group();
		dish.name = 'relay-dish';
		const bowl = new THREE.Mesh(
			new THREE.SphereGeometry(1.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
			new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
		);
		bowl.rotation.x = Math.PI / 2 + 0.4;
		dish.add(bowl);
		dish.position.set(0, 15, 0);
		tower.add(dish);
		const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), this.beaconMat);
		beacon.position.set(0, 16.4, 0);
		tower.add(beacon);
		const console = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.8), steel);
		console.position.set(0, 0.65, 2.2);
		const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshBasicMaterial({ color: 0x3affb0 }));
		screen.position.set(0, 1.0, 2.61);
		screen.rotation.x = -0.3;
		tower.add(console, screen);
		tower.position.set(cx, 0, cz);
		this.group.add(tower);
		this.addBox(cx - 1.2, cx + 1.2, cz - 1.2, cz + 1.2, 16);
		this.addBox(cx - 0.7, cx + 0.7, cz + 1.8, cz + 2.6, 1.3);
		this.addLight(new THREE.Vector3(cx, 6, cz + 4), 0xffd2a0, 45);
		this.supplyCrate(cx + 6, cz - 14);
	}

	private buildReactor(): void {
		const { x: cx, z: cz } = this.reactorPos;
		const hull = new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.8 });
		const core = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, 16, 32), hull);
		core.position.set(cx + 5, 8, cz + 5);
		core.castShadow = core.receiveShadow = true;
		const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull);
		dome.position.set(cx + 5, 16, cz + 5);
		this.group.add(core, dome);
		for (const y of [3, 8, 13]) {
			const ring = new THREE.Mesh(new THREE.TorusGeometry(9.55, 0.18, 6, 48), this.reactorMat);
			ring.rotation.x = Math.PI / 2;
			ring.position.set(cx + 5, y, cz + 5);
			this.group.add(ring);
		}
		this.circles.push({ x: cx + 5, z: cz + 5, r: 9.6, h: 25 });
		this.addBox(cx - 1.8, cx + 11.8, cz - 1.8, cz + 11.8, 25); // bullet blocker (inside the collision circle)
		// cooling tower (hyperboloid)
		const pts: THREE.Vector2[] = [];
		for (let i = 0; i <= 12; i++) {
			const t = i / 12;
			const k = t < 0.65 ? (0.65 - t) / 0.65 : (t - 0.65) / 0.35;
			pts.push(new THREE.Vector2(4.5 + (t < 0.65 ? 3.2 : 1.5) * k * k, t * 26));
		}
		const tower = new THREE.Mesh(
			new THREE.LatheGeometry(pts, 32),
			new THREE.MeshStandardMaterial({ color: 0x6d6c68, roughness: 0.95, side: THREE.DoubleSide }),
		);
		tower.position.set(cx - 8, 0, cz - 8);
		tower.castShadow = true;
		this.group.add(tower);
		this.circles.push({ x: cx - 8, z: cz - 8, r: 7.4, h: 26 });
		this.addBox(cx - 12.5, cx - 3.5, cz - 12.5, cz - 3.5, 26);
		const sign = new THREE.Mesh(
			new THREE.PlaneGeometry(9, 2.2),
			new THREE.MeshBasicMaterial({ map: signTexture('HALCYON', '#36e0ff'), toneMapped: false }),
		);
		sign.position.set(cx + 5, 3.2, cz + 16.3);
		this.group.add(sign);
		this.addLight(new THREE.Vector3(cx + 5, 4, cz + 17), 0x5fe8ff, 60, 'cyan');
		this.supplyCrate(cx + 13, cz - 12, 0.8);
	}

	private buildExtraction(): void {
		const { x: cx, z: cz } = this.extractionPos;
		const padTex = canvasTexture(
			512,
			512,
			(g) => {
				g.fillStyle = '#222326';
				g.beginPath();
				g.arc(256, 256, 256, 0, Math.PI * 2);
				g.fill();
				g.strokeStyle = '#d9c35a';
				g.lineWidth = 14;
				g.beginPath();
				g.arc(256, 256, 220, 0, Math.PI * 2);
				g.stroke();
				g.fillStyle = '#e8e8e2';
				g.font = 'bold 300px Arial, sans-serif';
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.fillText('H', 256, 270);
			},
			{ repeat: false },
		);
		const pad = new THREE.Mesh(
			new THREE.CylinderGeometry(11, 11.4, 0.4, 48),
			[
				new THREE.MeshStandardMaterial({ color: 0x2a2b2e }),
				new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.6 }),
				new THREE.MeshStandardMaterial({ color: 0x2a2b2e }),
			],
		);
		pad.position.set(cx, 0.2, cz);
		pad.receiveShadow = true;
		this.group.add(pad);
		for (let k = 0; k < 16; k++) {
			const a = (k / 16) * Math.PI * 2;
			const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), this.padLightMat);
			l.position.set(cx + Math.cos(a) * 10.6, 0.45, cz + Math.sin(a) * 10.6);
			this.group.add(l);
		}
		// perimeter lights
		for (const [x, z] of [
			[-15, -15],
			[15, -15],
			[-15, 15],
			[15, 15],
		]) {
			const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
			pole.position.set(cx + x, 3, cz + z);
			this.group.add(pole);
			this.addBox(cx + x - 0.2, cx + x + 0.2, cz + z - 0.2, cz + z + 0.2, 6);
		}
		this.addLight(new THREE.Vector3(cx, 7, cz), 0xe6eeff, 60, 'flood');
	}

	private buildPark(rng: () => number): void {
		const bark = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 1 });
		const bin = new GeoBin();
		for (let k = 0; k < 14; k++) {
			const x = (rng() - 0.5) * 30;
			const z = (rng() - 0.5) * 30;
			if (Math.hypot(x, z) < 6) continue;
			const h = 4 + rng() * 3;
			bin.add(new THREE.CylinderGeometry(0.15, 0.3, h, 5), x, h / 2, z);
			for (let b = 0; b < 4; b++) {
				const br = new THREE.CylinderGeometry(0.04, 0.1, 2 + rng() * 1.5, 4);
				br.rotateZ(0.7 + rng() * 0.5);
				br.rotateY(rng() * Math.PI * 2);
				br.translate(0, h * (0.55 + rng() * 0.4), 0);
				bin.add(br, x, 0, z);
			}
			this.circles.push({ x, z, r: 0.35, h });
		}
		const trees = bin.mesh(bark);
		if (trees) this.group.add(trees);
		// statue
		const stone = new THREE.MeshStandardMaterial({ color: 0x5e6260, roughness: 0.9 });
		const plinth = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), stone);
		plinth.position.set(0, 1.2, 0);
		const fig = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.2, 8), stone);
		fig.position.set(0, 4, 0);
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), stone);
		head.position.set(0, 5.9, 0);
		for (const m of [plinth, fig, head]) {
			m.castShadow = true;
			this.group.add(m);
		}
		this.addBox(-1.5, 1.5, -1.5, 1.5, 6.4);
		// abandoned bus
		const bus = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 11), new THREE.MeshStandardMaterial({ color: 0x8a6a1e, roughness: 0.6, metalness: 0.3 }));
		bus.position.set(-10, 1.6, 9);
		bus.rotation.y = 0.35;
		bus.castShadow = true;
		this.group.add(bus);
		this.addBox(-13, -7, 3.5, 14.5, 3);
		this.rects.push({ x: -10, z: 9, w: 6, d: 11, kind: 'prop' });
		this.supplyCrate(6, -8);
	}

	private buildPerimeter(): void {
		const mat = new THREE.MeshStandardMaterial({ color: 0x3c3d40, roughness: 0.95 });
		const H = 7;
		const L = BOUND * 2 + 2;
		const specs: [number, number, number, number][] = [
			[0, -BOUND - 0.5, L, 1],
			[0, BOUND + 0.5, L, 1],
			[-BOUND - 0.5, 0, 1, L],
			[BOUND + 0.5, 0, 1, L],
		];
		for (const [x, z, w, d] of specs) {
			const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mat);
			m.position.set(x, H / 2, z);
			m.receiveShadow = true;
			this.group.add(m);
			this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, H);
		}
	}

	// ── collision ───────────────────────────────────────────────────────────

	private addBox(minX: number, maxX: number, minZ: number, maxZ: number, h: number, blocksBullets = true): void {
		const idx = this.boxes.length;
		this.boxes.push({ minX, maxX, minZ, maxZ, h });
		if (!blocksBullets) this.thin.add(idx);
		if (idx >= this.rayMark.length) {
			const mark = new Int32Array(Math.max(64, idx * 2));
			mark.set(this.rayMark);
			this.rayMark = mark;
			const thin = new Uint8Array(mark.length);
			thin.set(this.thinFlag);
			this.thinFlag = thin;
		}
		this.thinFlag[idx] = blocksBullets ? 0 : 1;
		for (let i = Math.floor(minX / 20); i <= Math.floor(maxX / 20); i++) {
			for (let j = Math.floor(minZ / 20); j <= Math.floor(maxZ / 20); j++) {
				const key = i * 1000 + j;
				let list = this.hash.get(key);
				if (!list) this.hash.set(key, (list = []));
				list.push(idx);
			}
		}
	}
	private readonly thin = new Set<number>();

	/** Push a circle of radius r at `p` out of every collider. Returns true if it touched one. */
	resolve(p: THREE.Vector3, r: number): boolean {
		let hit = false;
		const seen = new Set<number>();
		for (let i = Math.floor((p.x - r) / 20); i <= Math.floor((p.x + r) / 20); i++) {
			for (let j = Math.floor((p.z - r) / 20); j <= Math.floor((p.z + r) / 20); j++) {
				const list = this.hash.get(i * 1000 + j);
				if (!list) continue;
				for (const idx of list) {
					if (seen.has(idx)) continue;
					seen.add(idx);
					const b = this.boxes[idx];
					if (p.y > b.h) continue;
					const nx = Math.max(b.minX, Math.min(p.x, b.maxX));
					const nz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
					let dx = p.x - nx;
					let dz = p.z - nz;
					const d2 = dx * dx + dz * dz;
					if (d2 >= r * r) continue;
					hit = true;
					if (d2 > 1e-9) {
						const d = Math.sqrt(d2);
						p.x += (dx / d) * (r - d);
						p.z += (dz / d) * (r - d);
					} else {
						// centre is inside the box: leave along the shallowest axis
						const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
						const m = pen.indexOf(Math.min(...pen));
						dx = m === 0 ? -1 : m === 1 ? 1 : 0;
						dz = m === 2 ? -1 : m === 3 ? 1 : 0;
						p.x += dx * (pen[m] + r);
						p.z += dz * (pen[m] + r);
					}
				}
			}
		}
		for (const c of this.circles) {
			const dx = p.x - c.x;
			const dz = p.z - c.z;
			const d = Math.hypot(dx, dz);
			const min = c.r + r;
			if (d < min && d > 1e-6 && p.y < c.h) {
				p.x += (dx / d) * (min - d);
				p.z += (dz / d) * (min - d);
				hit = true;
			}
		}
		return hit;
	}

	/** Distance along a normalized ray to the first solid surface (ground included). */
	raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
		return this.trace(o, d, maxDist);
	}

	/** Like raycast, plus the surface normal at the hit (for impact decals). */
	raycastHit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): RayHit {
		const dist = this.trace(o, d, maxDist);
		const normal = new THREE.Vector3(0, 1, 0);
		const b = this.lastHit;
		if (b) {
			const px = o.x + d.x * dist;
			const py = o.y + d.y * dist;
			const pz = o.z + d.z * dist;
			let best = Math.abs(py - b.h);
			const cand: [number, number, number, number][] = [
				[Math.abs(px - b.minX), -1, 0, 0],
				[Math.abs(px - b.maxX), 1, 0, 0],
				[Math.abs(pz - b.minZ), 0, 0, -1],
				[Math.abs(pz - b.maxZ), 0, 0, 1],
			];
			for (const [e, nx, ny, nz] of cand) {
				if (e < best) {
					best = e;
					normal.set(nx, ny, nz);
				}
			}
		}
		return { dist, normal };
	}

	/**
	 * Walk the 20 m collision grid along the ray (2D DDA) and slab-test only the
	 * boxes in the cells it crosses. Records the box it hit in `lastHit`.
	 */
	private trace(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
		let best = maxDist;
		this.lastHit = null;
		if (d.y < 0 && -o.y / d.y < best) best = -o.y / d.y;
		const stamp = ++this.rayStamp;
		const C = 20;
		let cx = Math.floor(o.x / C);
		let cz = Math.floor(o.z / C);
		const stepX = d.x > 0 ? 1 : -1;
		const stepZ = d.z > 0 ? 1 : -1;
		const tDeltaX = Math.abs(d.x) > 1e-9 ? C / Math.abs(d.x) : Infinity;
		const tDeltaZ = Math.abs(d.z) > 1e-9 ? C / Math.abs(d.z) : Infinity;
		let tMaxX = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? cx + 1 : cx) * C - o.x) / d.x : Infinity;
		let tMaxZ = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? cz + 1 : cz) * C - o.z) / d.z : Infinity;
		let tEnter = 0;
		for (let guard = 0; guard < 256 && tEnter <= best; guard++) {
			const list = this.hash.get(cx * 1000 + cz);
			if (list) {
				for (const idx of list) {
					if (this.rayMark[idx] === stamp || this.thinFlag[idx]) continue;
					this.rayMark[idx] = stamp;
					const b = this.boxes[idx];
					const t = rayAABB(o, d, b, best);
					if (t < best) {
						best = t;
						this.lastHit = b;
					}
				}
			}
			if (tMaxX < tMaxZ) {
				tEnter = tMaxX;
				tMaxX += tDeltaX;
				cx += stepX;
			} else {
				tEnter = tMaxZ;
				tMaxZ += tDeltaZ;
				cz += stepZ;
			}
		}
		return best;
	}
	private lastHit: AABB | null = null;
	private rayStamp = 0;
	private rayMark = new Int32Array(0);
	private thinFlag = new Uint8Array(0);

	hasLineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean {
		const d = new THREE.Vector3().subVectors(b, a);
		const len = d.length();
		d.divideScalar(len);
		return this.raycast(a, d, len) >= len - 0.05;
	}

	groundAt(x: number, z: number): number {
		const i = Math.round(x / PITCH);
		const j = Math.round(z / PITCH);
		if (Math.abs(i) > GRID || Math.abs(j) > GRID) return 0;
		return Math.abs(x - i * PITCH) <= BLOCK_HALF && Math.abs(z - j * PITCH) <= BLOCK_HALF ? SIDEWALK_H : 0;
	}

	district(x: number, z: number): string {
		if (z > 120) return 'CHECKPOINT DISTRICT';
		if (z < -150) return 'NORTHGATE';
		if (x > 75) return 'KESSLER YARDS';
		if (x < -75) return 'HALCYON HEIGHTS';
		return 'OLD MARKET';
	}

	setRelayActive(on: boolean): void {
		this.relayActive = on;
	}
	setExtractionLive(on: boolean): void {
		this.extractionLive = on;
	}

	update(t: number, dt: number, player: THREE.Vector3): void {
		this.blinkMat.color.setHex(Math.sin(t * 3) > 0.6 ? 0xff2a2a : 0x220404);
		const beaconOn = Math.sin(t * (this.relayActive ? 10 : 2.5)) > 0;
		this.beaconMat.color.setHex(this.relayActive ? (beaconOn ? 0x3aff7a : 0x0a3a1a) : beaconOn ? 0xff3b30 : 0x3a0a08);
		this.relayDish.rotation.y += dt * (this.relayActive ? 1.2 : 0.15);
		this.reactorMat.emissiveIntensity = 1.6 + Math.sin(t * 1.7) * 0.6;
		const chase = (Math.floor(t * 12) % 16) / 16;
		this.padLightMat.color.setHex(this.extractionLive ? (chase < 0.5 ? 0xff4a2a : 0x4a0a05) : 0x331111);

		this.groundTime.value = t;
		this.trafficMat.color.setHex(Math.sin(t * 3.4) > 0 ? 0xffa21a : 0x2a1a05);
		const strobe = Math.floor(t * 5) % 2 === 0;
		this.policeRed.color.setHex(strobe ? 0xff1a1a : 0x220404);
		this.policeBlue.color.setHex(strobe ? 0x060a22 : 0x2a5dff);
		this.searchlights.forEach((s, i) => {
			s.rotation.z = Math.sin(t * 0.23 + i * 2.1) * 0.5;
			s.rotation.x = Math.cos(t * 0.17 + i * 1.3) * 0.35 - 0.1;
		});

		// Hand the pooled point lights to the nearest sources.
		this.lightTimer -= dt;
		if (this.lightTimer <= 0) {
			this.lightTimer = 0.35;
			const near = this.lights
				.map((l) => ({ l, d: l.pos.distanceToSquared(player) }))
				.sort((a, b) => a.d - b.d)
				.slice(0, this.lightBudget);
			this.lightPool.forEach((light, i) => {
				const n = i < this.lightBudget ? near[i] : undefined;
				this.assigned[i] = n ? n.l : null;
				if (n) {
					light.position.copy(n.l.pos);
					light.color.setHex(n.l.color);
				}
			});
		}
		this.lightPool.forEach((light, i) => {
			const s = this.assigned[i];
			if (!s) {
				light.intensity = 0;
				return;
			}
			let k = 1;
			if (s.kind === 'fire') k = 0.7 + 0.2 * Math.sin(t * 13 + s.phase) * Math.sin(t * 7.3 + s.phase * 2) + Math.random() * 0.15;
			else if (s.kind === 'police') light.color.setHex(Math.floor(t * 5 + s.phase) % 2 === 0 ? 0xff1a1a : 0x2a5dff);
			else if (s.kind === 'lamp' && s.phase < 0.6) k = Math.sin(t * 23 + s.phase * 40) > -0.6 ? 1 : 0.15; // failing ballast
			light.intensity = s.intensity * k;
		});
	}

	/** Quality knobs that can change at runtime. */
	setQuality(lights: number, cones: boolean): void {
		this.lightBudget = Math.min(lights, this.lightPool.length);
		this.lightPool.forEach((l, i) => (l.visible = i < this.lightBudget));
		this.lightTimer = 0;
		if (this.cones) this.cones.visible = cones;
		for (const s of this.searchlights) s.visible = cones;
	}

	private addLight(pos: THREE.Vector3, color = 0xffc27a, intensity = 38, kind: LightKind = 'lamp'): void {
		this.lights.push({ pos, color, intensity, kind, phase: Math.random() * 10 });
	}

	// ── set dressing ────────────────────────────────────────────────────────

	private buildStorefronts(shops: Shop[]): void {
		const { map, emissive } = storefrontAtlas();
		const geos: THREE.BufferGeometry[] = [];
		const awnings: THREE.BufferGeometry[] = [];
		for (const sh of shops) {
			const g = new THREE.PlaneGeometry(sh.width, 3.3);
			const uv = g.getAttribute('uv') as THREE.BufferAttribute;
			const ox = (sh.variant % 2) * 0.5;
			const oy = sh.variant < 2 ? 0.5 : 0;
			for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + uv.getX(i) * 0.5, oy + uv.getY(i) * 0.5);
			const rot = sh.side === 0 ? Math.PI / 2 : sh.side === 1 ? -Math.PI / 2 : sh.side === 2 ? 0 : Math.PI;
			const off = 0.06;
			const px = sh.side === 0 ? sh.x + sh.w / 2 + off : sh.side === 1 ? sh.x - sh.w / 2 - off : sh.x + sh.along;
			const pz = sh.side === 2 ? sh.z + sh.d / 2 + off : sh.side === 3 ? sh.z - sh.d / 2 - off : sh.z + sh.along;
			g.rotateY(rot);
			g.translate(px, 1.85, pz);
			geos.push(g);
			if (sh.variant === 0 || sh.variant === 3) {
				const a = new THREE.BoxGeometry(sh.width + 0.4, 0.12, 1.3);
				a.rotateX(0.25);
				a.rotateY(rot);
				const n = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
				a.translate(px + n.x * 0.6, 3.75, pz + n.z * 0.6);
				awnings.push(paint(a, sh.variant === 0 ? 0x5a1a14 : 0x1a2a3a));
			}
		}
		const merged = geos.length ? mergeGeometries(geos, false) : null;
		if (merged) {
			const m = new THREE.Mesh(
				merged,
				new THREE.MeshStandardMaterial({
					map,
					emissiveMap: emissive,
					emissive: 0xffffff,
					emissiveIntensity: 1.1,
					roughness: 0.25,
					metalness: 0.1,
					envMapIntensity: 0.8,
				}),
			);
			m.receiveShadow = true;
			this.group.add(m);
		}
		const aw = awnings.length ? mergeGeometries(awnings, false) : null;
		if (aw) {
			const m = new THREE.Mesh(aw, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
			m.castShadow = true;
			this.group.add(m);
		}
	}

	private buildTrafficLights(lines: number[], rng: () => number): void {
		const spots: [number, number][] = [];
		for (const sx of lines)
			for (const sz of lines) if (Math.abs(sx) < BOUND - 20 && Math.abs(sz) < BOUND - 20 && rng() < 0.55) spots.push([sx + 8.8, sz + 8.8]);
		const pole = new THREE.InstancedMesh(
			new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6),
			new THREE.MeshStandardMaterial({ color: 0x25272b, metalness: 0.5, roughness: 0.5 }),
			spots.length,
		);
		const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 1.0, 0.36), new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.6 }), spots.length);
		const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.trafficMat, spots.length * 4);
		const m = new THREE.Matrix4();
		spots.forEach(([x, z], i) => {
			pole.setMatrixAt(i, m.makeTranslation(x, 2.8, z));
			head.setMatrixAt(i, m.makeTranslation(x, 5.2, z));
			// one amber lens facing each approach
			lamp.setMatrixAt(i * 4, m.makeTranslation(x + 0.1, 5.2, z));
			lamp.setMatrixAt(i * 4 + 1, m.makeTranslation(x - 0.1, 5.2, z));
			lamp.setMatrixAt(i * 4 + 2, m.makeTranslation(x, 5.2, z + 0.1));
			lamp.setMatrixAt(i * 4 + 3, m.makeTranslation(x, 5.2, z - 0.1));
			this.addBox(x - 0.15, x + 0.15, z - 0.15, z + 0.15, 5.6, false);
		});
		pole.castShadow = true;
		this.group.add(pole, head, lamp);
	}

	private buildPolice(): void {
		if (!this.carGeo) return;
		const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9ea3ab, roughness: 0.25, metalness: 0.6, envMapIntensity: 1.2 });
		const barMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
		const lensGeo = new THREE.BoxGeometry(0.5, 0.14, 0.26);
		const spots: [number, number, number][] = [
			[-12, 171, 0.35],
			[11, 168, -0.5],
			[150, -71, 1.4],
			[21, 22, 0.2],
			[-150, -71, -1.2],
		];
		for (const [x, z, rot] of spots) {
			const car = new THREE.Group();
			const body = new THREE.Mesh(this.carGeo, mat);
			body.castShadow = true;
			const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.3), barMat);
			bar.position.set(0, 1.68, -0.2);
			const red = new THREE.Mesh(lensGeo, this.policeRed);
			red.position.set(-0.32, 1.72, -0.2);
			const blue = new THREE.Mesh(lensGeo, this.policeBlue);
			blue.position.set(0.32, 1.72, -0.2);
			car.add(body, bar, red, blue);
			car.position.set(x, 0, z);
			car.rotation.y = rot;
			this.group.add(car);
			this.addBox(x - 1.6, x + 1.6, z - 1.6, z + 1.6, 1.6);
			this.rects.push({ x, z, w: 3.2, d: 3.2, kind: 'prop' });
			this.addLight(new THREE.Vector3(x, 2.2, z), 0xff1a1a, 55, 'police');
		}
	}

	private buildFires(): void {
		const rust = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9, metalness: 0.4, side: THREE.DoubleSide });
		const embers = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
		const barrel = new THREE.CylinderGeometry(0.32, 0.3, 0.95, 14, 1, true);
		const coals = new THREE.CircleGeometry(0.3, 14).rotateX(-Math.PI / 2);
		const spots: [number, number][] = [
			[-13, 193],
			[13, 190],
			[139, -91],
			[-5, 13],
			[75, 42],
			[-75, -18],
			[26, -142],
			[-122, 58],
			[-138, -86],
			[8, -186],
		];
		for (const [x, z] of spots) {
			const b = new THREE.Mesh(barrel, rust);
			b.position.set(x, 0.62, z);
			b.castShadow = true;
			const glow = new THREE.Mesh(coals, embers);
			glow.position.set(x, 1.0, z);
			this.group.add(b, glow);
			this.circles.push({ x, z, r: 0.35, h: 1.1 });
			this.fires.push(new THREE.Vector3(x, 1.05, z));
			this.addLight(new THREE.Vector3(x, 1.8, z), 0xff8a3a, 32, 'fire');
		}
	}

	private buildSearchlights(): void {
		const geo = new THREE.ConeGeometry(7, 170, 24, 1, true).translate(0, -85, 0).rotateX(Math.PI);
		const mat = beamMaterial(0xcfe0ff, 0.028, true);
		for (const x of [-14, 14]) {
			const beam = new THREE.Mesh(geo, mat);
			beam.position.set(x, 9.3, 4 * PITCH - 14);
			beam.frustumCulled = false;
			this.group.add(beam);
			this.searchlights.push(beam);
		}
	}
}
