import * as THREE from 'three';
import { damp } from './util';

/**
 * The extraction gunship: flies in from the north while the player holds the
 * LZ, hovers with its searchlight on the pad, then settles low for pickup.
 */
export class Helicopter {
	readonly root = new THREE.Group();
	readonly light: THREE.SpotLight;
	private readonly rotor = new THREE.Group();
	private readonly tailRotor = new THREE.Group();
	private readonly navRed: THREE.MeshBasicMaterial;
	private readonly navGreen: THREE.MeshBasicMaterial;
	private readonly strobe: THREE.MeshBasicMaterial;
	private readonly beam: THREE.Mesh;
	private readonly pad: THREE.Vector3;
	private active = false;
	private t = 0;
	readonly pos = new THREE.Vector3();

	constructor(scene: THREE.Scene, pad: THREE.Vector3) {
		this.pad = pad.clone();
		const hull = new THREE.MeshStandardMaterial({ color: 0x2c3128, roughness: 0.55, metalness: 0.45 });
		const dark = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.6, metalness: 0.5 });
		const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1016, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
		const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, z);
			m.castShadow = true;
			parent.add(m);
			return m;
		};
		add(new THREE.CapsuleGeometry(1.25, 3.6, 6, 16).rotateX(Math.PI / 2).scale(1, 0.9, 1), hull, 0, 0, 0);
		add(new THREE.SphereGeometry(1.15, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.85, 0.9), glass, 0, 0.1, 2.4);
		add(new THREE.CylinderGeometry(0.35, 0.55, 6, 12).rotateX(Math.PI / 2), hull, 0, 0.35, -5.2);
		add(new THREE.BoxGeometry(0.12, 1.8, 1.1), hull, 0, 1.1, -7.9);
		add(new THREE.BoxGeometry(2.4, 0.1, 0.7), hull, 0, 0.5, -7.4);
		add(new THREE.BoxGeometry(1.4, 0.6, 1.6), dark, 0, 1.25, 0.2); // engine housing
		add(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8), dark, 0, 1.75, 0.2);
		for (const side of [-1, 1]) {
			add(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8).rotateX(Math.PI / 2), dark, side * 1.0, -1.35, 0.3);
			add(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark, side * 1.0, -1.05, 1.3);
			add(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark, side * 1.0, -1.05, -0.8);
			add(new THREE.BoxGeometry(0.4, 0.4, 1.4), dark, side * 1.45, -0.2, 0.9); // rocket pods
		}
		const blade = new THREE.BoxGeometry(0.28, 0.04, 7.2).translate(0, 0, 3.6);
		for (let k = 0; k < 4; k++) {
			const b = new THREE.Mesh(blade, dark);
			b.rotation.y = (k / 4) * Math.PI * 2;
			this.rotor.add(b);
		}
		this.rotor.position.set(0, 2.05, 0.2);
		this.root.add(this.rotor);
		const tblade = new THREE.BoxGeometry(0.05, 1.3, 0.14);
		for (let k = 0; k < 2; k++) {
			const b = new THREE.Mesh(tblade, dark);
			b.rotation.x = k * Math.PI * 0.5;
			this.tailRotor.add(b);
		}
		this.tailRotor.position.set(0.2, 1.1, -7.9);
		this.root.add(this.tailRotor);

		this.navRed = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
		this.navGreen = new THREE.MeshBasicMaterial({ color: 0x20ff60, toneMapped: false });
		this.strobe = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
		const lamp = new THREE.SphereGeometry(0.12, 8, 6);
		add(lamp, this.navRed, -1.25, 0.5, -7.4).castShadow = false;
		add(lamp, this.navGreen, 1.25, 0.5, -7.4).castShadow = false;
		add(lamp, this.strobe, 0, 2.0, -7.9).castShadow = false;

		// searchlight: a real spot plus a visible additive cone
		this.light = new THREE.SpotLight(0xe8f0ff, 0, 90, 0.32, 0.4, 1.1);
		this.light.position.set(0, -1.2, 2.4);
		this.light.target.position.set(0, -30, 8);
		this.root.add(this.light, this.light.target);
		const beamGeo = new THREE.ConeGeometry(4.5, 32, 24, 1, true).translate(0, -16, 0);
		const alpha = document.createElement('canvas');
		alpha.width = 4;
		alpha.height = 64;
		const g = alpha.getContext('2d');
		if (g) {
			const grad = g.createLinearGradient(0, 0, 0, 64);
			grad.addColorStop(0, '#fff');
			grad.addColorStop(1, '#000');
			g.fillStyle = grad;
			g.fillRect(0, 0, 4, 64);
		}
		this.beam = new THREE.Mesh(
			beamGeo,
			new THREE.MeshBasicMaterial({
				color: 0xdfe8ff,
				alphaMap: new THREE.CanvasTexture(alpha),
				transparent: true,
				opacity: 0.08,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				side: THREE.DoubleSide,
				toneMapped: false,
			}),
		);
		this.beam.position.copy(this.light.position);
		this.beam.rotation.x = -0.22; // tip the cone forward toward the light's target
		this.root.add(this.beam);

		// Never toggle visibility: hiding a light changes the light count and
		// forces every material to recompile. Park it far below the map instead.
		this.root.position.set(0, -600, 0);
		scene.add(this.root);
	}

	/** Begin the approach. */
	start(): void {
		this.active = true;
		this.t = 0;
		this.pos.copy(this.startPos());
		this.root.position.copy(this.pos);
	}

	stop(): void {
		this.active = false;
		this.light.intensity = 0;
		this.root.position.set(0, -600, 0);
	}

	private startPos(): THREE.Vector3 {
		return new THREE.Vector3(this.pad.x + 60, 70, this.pad.z - 380);
	}

	get flying(): boolean {
		return this.active;
	}

	/** `progress` is the LZ hold progress (0..1); the gunship's position tracks it. */
	update(dt: number, time: number, progress: number): void {
		if (!this.active) return;
		this.t += dt;
		const approach = Math.min(1, this.t / 14); // fly-in takes ~14 s regardless of hold progress
		const e = 1 - Math.pow(1 - approach, 3);
		const start = this.startPos();
		const hover = new THREE.Vector3(this.pad.x + 6, 22, this.pad.z + 6);
		const low = new THREE.Vector3(this.pad.x + 2, 5.5, this.pad.z + 2);
		const target = start.clone().lerp(hover, e);
		const settle = Math.max(0, (progress - 0.75) / 0.25);
		target.lerp(low, settle * approach);
		target.y += Math.sin(time * 1.3) * 0.35;
		const vel = target.clone().sub(this.pos);
		this.pos.x = damp(this.pos.x, target.x, 2, dt);
		this.pos.y = damp(this.pos.y, target.y, 2, dt);
		this.pos.z = damp(this.pos.z, target.z, 2, dt);
		this.root.position.copy(this.pos);
		const heading = Math.atan2(this.pad.x - this.pos.x, this.pad.z - this.pos.z);
		this.root.rotation.y = damp(this.root.rotation.y, approach < 1 ? heading : heading + Math.sin(time * 0.2) * 0.4, 1.5, dt);
		this.root.rotation.x = damp(this.root.rotation.x, Math.min(0.3, vel.length() * 0.01), 2, dt); // nose-down when moving
		this.rotor.rotation.y += dt * 38;
		this.tailRotor.rotation.x += dt * 60;
		const blink = Math.sin(time * 6) > 0.85;
		this.strobe.color.setHex(Math.sin(time * 9) > 0.93 ? 0xffffff : 0x111111);
		this.navRed.color.setHex(blink ? 0x220404 : 0xff2020);
		this.navGreen.color.setHex(blink ? 0x042208 : 0x20ff60);
		this.light.intensity = 220 * approach;
		this.light.target.position.set(0, -30, 8 - approach * 6);
	}
}
