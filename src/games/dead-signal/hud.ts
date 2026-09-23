import type * as THREE from 'three';
import type { MapRect } from './world';

export const CSS = /* css */ `
.ds-root{position:fixed;inset:0;overflow:hidden;background:#05070a;color:#d8dde3;
  font-family:ui-monospace,"SFMono-Regular","JetBrains Mono",Menlo,Consolas,monospace;user-select:none;-webkit-user-select:none;cursor:default}
.ds-root canvas.ds-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.ds-hud{position:absolute;inset:0;pointer-events:none;transition:opacity .4s}
.ds-hidden{display:none!important}
.ds-panel{background:rgba(8,11,15,.62);border:1px solid rgba(220,230,240,.08);backdrop-filter:blur(3px)}
.ds-label{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#8a939d}
.ds-mission{position:absolute;left:18px;top:16px;width:270px}
.ds-clock{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
.ds-clock b{font-size:22px;font-weight:600;color:#eef1f4;letter-spacing:.04em}
.ds-clock.warn b{color:#ff6a4a}
.ds-obj{padding:7px 10px;margin-bottom:5px;border-left:2px solid #e3c15a;transition:opacity .3s}
.ds-obj .t{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.14em;color:#eef1f4;font-weight:600}
.ds-obj .t i{font-style:normal;font-size:9px;color:#8a939d;letter-spacing:.2em;font-weight:400}
.ds-obj .d{font-size:10px;color:#9aa3ad;margin-top:3px;letter-spacing:.04em}
.ds-obj .bar{height:3px;background:rgba(255,255,255,.08);margin-top:6px}
.ds-obj .bar span{display:block;height:100%;background:#7dff9a;width:0}
.ds-obj.locked{border-left-color:#4a525a;opacity:.55}
.ds-obj.active{border-left-color:#7dff9a}
.ds-obj.active .t i{color:#7dff9a}
.ds-obj.done{border-left-color:#4a525a;opacity:.45}
.ds-obj.done .t{text-decoration:line-through}
.ds-map{position:absolute;right:18px;top:16px;text-align:right}
.ds-map canvas{display:block;width:160px;height:160px;border:1px solid rgba(220,230,240,.12);background:rgba(6,9,12,.7)}
.ds-district{margin-top:6px;font-size:10px;letter-spacing:.22em;color:#dfe4e8}
.ds-threat{display:inline-block;margin-top:4px;font-size:9px;letter-spacing:.2em;padding:2px 6px;border:1px solid currentColor}
.ds-vitals{position:absolute;left:18px;bottom:18px;width:250px}
.ds-salvage{font-size:13px;color:#e3c15a;margin-bottom:6px;letter-spacing:.08em}
.ds-salvage small{color:#8a939d;font-size:10px;margin-left:6px}
.ds-bars{display:grid;gap:4px}
.ds-bar{height:7px;background:rgba(255,255,255,.08);position:relative;overflow:hidden}
.ds-bar span{position:absolute;inset:0 auto 0 0;background:#e8edf2;transition:width .15s}
.ds-bar.armor span{background:#5ab8ff}
.ds-bar.armor{height:5px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.08) 0 calc(50% - 1px),transparent calc(50% - 1px) 50%)}
.ds-kit{display:flex;gap:14px;margin-top:7px;font-size:10px;letter-spacing:.16em;color:#aab3bc}
.ds-kit b{color:#eef1f4}
.ds-weapon{position:absolute;right:18px;bottom:18px;text-align:right}
.ds-weapon .n{font-size:10px;letter-spacing:.24em;color:#8a939d}
.ds-weapon .a{font-size:34px;font-weight:600;color:#eef1f4;line-height:1.1}
.ds-weapon .a small{font-size:15px;color:#8a939d;font-weight:400}
.ds-weapon .a.low{color:#ff8a5a}
.ds-weapon .r{font-size:10px;letter-spacing:.2em;color:#e3c15a;height:12px}
.ds-keys{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:4px 10px;max-width:560px;
  font-size:9px;letter-spacing:.12em;color:#8a939d;padding:6px 10px}
.ds-keys kbd{font:inherit;color:#e8edf2;border:1px solid rgba(220,230,240,.25);padding:0 4px;margin-right:4px;background:rgba(255,255,255,.04)}
.ds-cross{position:absolute;left:50%;top:50%;width:0;height:0}
.ds-cross i{position:absolute;background:rgba(240,244,248,.85);box-shadow:0 0 2px #000}
.ds-cross i:nth-child(1),.ds-cross i:nth-child(2){width:8px;height:2px;top:-1px}
.ds-cross i:nth-child(3),.ds-cross i:nth-child(4){width:2px;height:8px;left:-1px}
.ds-cross b{position:absolute;width:2px;height:2px;left:-1px;top:-1px;background:#fff}
.ds-hit{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0}
.ds-hit:before,.ds-hit:after{content:"";position:absolute;left:50%;top:0;width:2px;height:100%;margin-left:-1px;
  background:linear-gradient(#fff 0 35%,transparent 35% 65%,#fff 65%);transform:rotate(45deg)}
.ds-hit:after{transform:rotate(-45deg)}
.ds-hit.kill:before,.ds-hit.kill:after{background:linear-gradient(#ff4a3a 0 35%,transparent 35% 65%,#ff4a3a 65%)}
.ds-prompt{position:absolute;left:50%;top:60%;transform:translateX(-50%);font-size:12px;letter-spacing:.18em;color:#eef1f4;padding:6px 12px}
.ds-prompt kbd{font:inherit;color:#05070a;background:#e3c15a;padding:0 5px;margin-right:8px}
.ds-prompt .prog{height:2px;background:#e3c15a;margin-top:5px;width:0}
.ds-banner{position:absolute;left:50%;top:26%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .35s}
.ds-banner .k{font-size:10px;letter-spacing:.35em;color:#e3c15a}
.ds-banner .h{font-family:Impact,"Arial Narrow Bold","Arial Black",sans-serif;font-size:64px;letter-spacing:.04em;color:#f3f5f7;
  text-shadow:0 2px 20px rgba(0,0,0,.6);line-height:1.05}
.ds-banner .s{font-size:11px;letter-spacing:.3em;color:#aab3bc;margin-top:4px}
.ds-boss{position:absolute;left:50%;top:18px;transform:translateX(-50%);width:420px;max-width:50vw;text-align:center}
.ds-boss .ds-bar{height:6px;margin-top:5px}
.ds-boss .ds-bar span{background:#ff4a2a}
.ds-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse at center,transparent 45%,rgba(160,10,10,.55) 100%)}
.ds-dmg{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px 0 0 -110px;pointer-events:none}
.ds-dmg i{position:absolute;left:50%;top:0;width:60px;height:14px;margin-left:-30px;border-radius:50%/100% 100% 0 0;
  border-top:4px solid rgba(255,60,40,.9);transform-origin:50% 110px;opacity:0}
.ds-toast{position:absolute;left:50%;top:66%;transform:translateX(-50%);font-size:11px;letter-spacing:.18em;color:#e3c15a;opacity:0;transition:opacity .3s}
.ds-marker{position:absolute;transform:translate(-50%,-100%);text-align:center;font-size:9px;letter-spacing:.2em;color:#e3c15a;white-space:nowrap}
.ds-marker i{display:block;width:10px;height:10px;margin:0 auto 3px;border:2px solid currentColor;transform:rotate(45deg)}
.ds-marker.green{color:#7dff9a}
.ds-marker.red{color:#ff5a3a}
.ds-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;
  background:radial-gradient(ellipse at center,rgba(5,7,10,.55),rgba(5,7,10,.92))}
.ds-menu{min-width:280px;padding:22px 26px;text-align:center}
.ds-menu h1{font-family:Impact,"Arial Narrow Bold","Arial Black",sans-serif;font-weight:400;font-size:clamp(44px,9vw,96px);letter-spacing:.06em;margin:0;color:#f3f5f7;line-height:.95}
.ds-menu h1 span{color:#e3c15a}
.ds-menu h2{font-size:10px;letter-spacing:.4em;color:#8a939d;font-weight:400;margin:6px 0 22px}
.ds-menu h3{font-size:10px;letter-spacing:.35em;color:#8a939d;font-weight:400;margin:0 0 14px}
.ds-menu p{font-size:11px;line-height:1.7;color:#aab3bc;max-width:460px;margin:0 auto 20px;letter-spacing:.04em}
.ds-btn{display:block;width:220px;margin:6px auto;padding:8px 0;font:inherit;font-size:10px;letter-spacing:.3em;text-transform:uppercase;
  color:#cfd5db;background:rgba(255,255,255,.03);border:1px solid rgba(220,230,240,.14);cursor:pointer}
.ds-btn:hover,.ds-btn:focus-visible{border-color:#e3c15a;color:#fff;outline:none}
.ds-btn.primary{background:#e3c15a;color:#0a0b0d;border-color:#e3c15a;font-weight:700}
.ds-btn.primary:hover{background:#f0d27a}
.ds-set{display:grid;grid-template-columns:120px 160px 40px;align-items:center;gap:10px;margin:10px auto;justify-content:center;font-size:10px;letter-spacing:.18em;color:#aab3bc;text-align:left}
.ds-set input[type=range]{accent-color:#e3c15a;width:100%}
.ds-set output{color:#eef1f4;text-align:right}
.ds-stats{display:grid;grid-template-columns:auto auto;gap:6px 30px;justify-content:center;font-size:11px;letter-spacing:.14em;margin:0 0 22px;color:#aab3bc}
.ds-stats b{color:#eef1f4;text-align:right}
.ds-back{position:absolute;left:18px;bottom:16px;font-size:10px;letter-spacing:.2em;color:#8a939d;text-decoration:none;pointer-events:auto}
.ds-back:hover{color:#e3c15a}
.ds-touch-note{font-size:10px;letter-spacing:.14em;color:#ff8a5a;margin-top:14px}
.ds-fullmap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(3,5,8,.82);pointer-events:none}
.ds-fullmap canvas{width:min(80vh,80vw);height:min(80vh,80vw);border:1px solid rgba(220,230,240,.15)}
.ds-seg{display:inline-flex;border:1px solid rgba(220,230,240,.14)}
.ds-seg button{font:inherit;font-size:9px;letter-spacing:.2em;padding:6px 10px;background:transparent;color:#aab3bc;border:0;border-right:1px solid rgba(220,230,240,.1);cursor:pointer;text-transform:uppercase}
.ds-seg button:last-child{border-right:0}
.ds-seg button.on{background:#e3c15a;color:#0a0b0d;font-weight:700}
.ds-seg-row{display:grid;grid-template-columns:120px auto;align-items:center;gap:10px;justify-content:center;margin:10px auto;font-size:10px;letter-spacing:.18em;color:#aab3bc;text-align:left}
.ds-feed{position:absolute;right:18px;top:238px;text-align:right;font-size:10px;letter-spacing:.14em;line-height:1.9}
.ds-feed div{transition:opacity .6s;color:#cfd5db}
.ds-feed b{color:#ff5a3a;font-weight:600}
.ds-feed i{font-style:normal;color:#e3c15a}
.ds-fps{position:absolute;right:18px;bottom:92px;font-size:9px;letter-spacing:.2em;color:#6a737c}
.ds-diff{display:flex;gap:8px;justify-content:center;margin:0 0 14px}
.ds-diff .ds-btn{width:150px;margin:0}
.ds-diff small{display:block;font-size:8px;letter-spacing:.14em;opacity:.7;margin-top:4px;text-transform:none}
.ds-overlay.ds-title{justify-content:flex-start;background:linear-gradient(90deg,rgba(4,6,9,.92) 0%,rgba(4,6,9,.7) 38%,rgba(4,6,9,.08) 72%,rgba(4,6,9,0) 100%)}
.ds-title .ds-menu{text-align:left;padding-left:clamp(20px,7vw,110px);max-width:560px}
.ds-title .ds-menu p{margin-left:0}
.ds-title .ds-btn{margin-left:0}
.ds-title .ds-menu h1{font-size:clamp(48px,8vw,112px)}
.ds-title .ds-tag{font-size:9px;letter-spacing:.4em;color:#ff4a3a;margin-bottom:10px}
@media (max-width:760px){.ds-keys{display:none}.ds-mission{width:210px;transform:scale(.9);transform-origin:0 0}.ds-map canvas{width:110px;height:110px}.ds-banner .h{font-size:40px}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (html) e.innerHTML = html;
	parent.appendChild(e);
	return e;
}

export type ObjState = 'locked' | 'contract' | 'active' | 'done';
export interface ObjectiveView {
	title: string;
	desc: string;
	state: ObjState;
	progress?: number;
}

export interface MapMarker {
	x: number;
	z: number;
	color: string;
	label?: string;
}

export class Hud {
	readonly root: HTMLElement;
	readonly hud: HTMLElement;
	private clock: HTMLElement;
	private clockBox: HTMLElement;
	private objBox: HTMLElement;
	private mapCanvas: HTMLCanvasElement;
	private mapCtx: CanvasRenderingContext2D;
	private fullMap: HTMLElement;
	private fullCanvas: HTMLCanvasElement;
	private fullCtx: CanvasRenderingContext2D;
	private district: HTMLElement;
	private threat: HTMLElement;
	private salvage: HTMLElement;
	private hp: HTMLElement;
	private armor: HTMLElement;
	private kit: HTMLElement;
	private wName: HTMLElement;
	private wAmmo: HTMLElement;
	private wReload: HTMLElement;
	private cross: HTMLElement;
	private hit: HTMLElement;
	private prompt: HTMLElement;
	private banner: HTMLElement;
	private boss: HTMLElement;
	private bossBar: HTMLElement;
	private vignette: HTMLElement;
	private dmgArcs: HTMLElement[] = [];
	private toast: HTMLElement;
	private markers: HTMLElement;
	private feedBox: HTMLElement;
	private fps: HTMLElement;
	private hitT = 0;
	private bannerT = 0;
	private toastT = 0;
	private lastObj = '';
	private staticMap: HTMLCanvasElement | null = null;

	constructor(root: HTMLElement) {
		this.root = root;
		const style = document.createElement('style');
		style.textContent = CSS;
		root.appendChild(style);
		const hud = el('div', 'ds-hud ds-hidden', root);
		this.hud = hud;

		this.markers = el('div', '', hud);
		const mission = el('div', 'ds-mission', hud);
		this.clockBox = el('div', 'ds-clock', mission, '<span class="ds-label">Mission</span><b>15:00</b>');
		this.clock = this.clockBox.querySelector('b') as HTMLElement;
		this.objBox = el('div', '', mission);

		const map = el('div', 'ds-map', hud);
		this.mapCanvas = el('canvas', '', map);
		this.mapCanvas.width = this.mapCanvas.height = 320;
		const mc = this.mapCanvas.getContext('2d');
		if (!mc) throw new Error('2D canvas unavailable');
		this.mapCtx = mc;
		this.district = el('div', 'ds-district', map, 'CHECKPOINT DISTRICT');
		this.threat = el('div', 'ds-threat', map, 'LOW THREAT');

		const vit = el('div', 'ds-vitals', hud);
		this.salvage = el('div', 'ds-salvage', vit, '◆ 0');
		const bars = el('div', 'ds-bars', vit);
		const hpBar = el('div', 'ds-bar', bars);
		this.hp = el('span', '', hpBar);
		const arBar = el('div', 'ds-bar armor', bars);
		this.armor = el('span', '', arBar);
		this.kit = el('div', 'ds-kit', vit);

		const wep = el('div', 'ds-weapon', hud);
		this.wReload = el('div', 'r', wep);
		this.wAmmo = el('div', 'a', wep);
		this.wName = el('div', 'n', wep);

		el(
			'div',
			'ds-keys ds-panel',
			hud,
			[
				['WASD', 'move'],
				['SHIFT', 'sprint'],
				['C', 'crouch'],
				['SPACE', 'jump'],
				['LMB', 'fire'],
				['RMB', 'aim'],
				['R', 'reload'],
				['1/2', 'switch'],
				['E', 'interact'],
				['G', 'grenade'],
				['F', 'plate'],
				['M', 'map'],
				['ESC', 'pause'],
			]
				.map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`)
				.join(''),
		);

		this.cross = el('div', 'ds-cross', hud, '<i></i><i></i><i></i><i></i><b></b>');
		this.hit = el('div', 'ds-hit', hud);
		this.prompt = el('div', 'ds-prompt ds-panel ds-hidden', hud);
		this.banner = el('div', 'ds-banner', hud);
		this.toast = el('div', 'ds-toast', hud);
		this.boss = el('div', 'ds-boss ds-hidden', hud, '<div class="ds-label">WARDEN-9</div>');
		const bb = el('div', 'ds-bar', this.boss);
		this.bossBar = el('span', '', bb);
		this.vignette = el('div', 'ds-vignette', hud);
		const dmg = el('div', 'ds-dmg', hud);
		for (let k = 0; k < 6; k++) this.dmgArcs.push(el('i', '', dmg));

		this.feedBox = el('div', 'ds-feed', hud);
		this.fps = el('div', 'ds-fps ds-hidden', hud);
		this.fullMap = el('div', 'ds-fullmap ds-hidden', root);
		this.fullCanvas = el('canvas', '', this.fullMap);
		this.fullCanvas.width = this.fullCanvas.height = 900;
		const fc = this.fullCanvas.getContext('2d');
		if (!fc) throw new Error('2D canvas unavailable');
		this.fullCtx = fc;
	}

	show(on: boolean): void {
		this.hud.classList.toggle('ds-hidden', !on);
		if (!on) this.fullMap.classList.add('ds-hidden');
	}

	toggleMap(on: boolean): void {
		this.fullMap.classList.toggle('ds-hidden', !on);
	}

	buildMap(rects: MapRect[], bound: number): void {
		const c = document.createElement('canvas');
		c.width = c.height = 1024;
		const g = c.getContext('2d');
		if (!g) return;
		const s = 1024 / (bound * 2);
		g.fillStyle = '#0b1015';
		g.fillRect(0, 0, 1024, 1024);
		g.fillStyle = '#161d24';
		g.fillRect(0, 0, 1024, 1024);
		for (const r of rects) {
			g.fillStyle = r.kind === 'building' ? '#2c3640' : r.kind === 'prop' ? '#252c33' : '#1c252c';
			g.fillRect((r.x - r.w / 2 + bound) * s, (r.z - r.d / 2 + bound) * s, r.w * s, r.d * s);
			if (r.kind === 'building') {
				g.strokeStyle = '#3a4652';
				g.strokeRect((r.x - r.w / 2 + bound) * s, (r.z - r.d / 2 + bound) * s, r.w * s, r.d * s);
			}
		}
		this.staticMap = c;
	}

	/** Player-centred, north-up minimap. */
	drawMap(player: THREE.Vector3, yaw: number, enemies: { x: number; z: number; boss: boolean }[], markers: MapMarker[], bound: number): void {
		const draw = (g: CanvasRenderingContext2D, size: number, cx: number, cz: number, range: number, labels: boolean) => {
			g.clearRect(0, 0, size, size);
			if (!this.staticMap) return;
			const s = size / (range * 2);
			const ms = 1024 / (bound * 2);
			g.save();
			g.globalAlpha = 0.95;
			g.drawImage(this.staticMap, (cx - range + bound) * ms, (cz - range + bound) * ms, range * 2 * ms, range * 2 * ms, 0, 0, size, size);
			g.restore();
			const tx = (x: number) => (x - cx + range) * s;
			const tz = (z: number) => (z - cz + range) * s;
			for (const e of enemies) {
				g.fillStyle = e.boss ? '#ff2a10' : '#ff5a4a';
				const r = e.boss ? size / 50 : size / 110;
				g.beginPath();
				g.arc(tx(e.x), tz(e.z), r, 0, Math.PI * 2);
				g.fill();
			}
			for (const m of markers) {
				let x = tx(m.x);
				let z = tz(m.z);
				const pad = size * 0.04;
				x = Math.min(size - pad, Math.max(pad, x));
				z = Math.min(size - pad, Math.max(pad, z));
				g.save();
				g.translate(x, z);
				g.rotate(Math.PI / 4);
				g.strokeStyle = m.color;
				g.lineWidth = size / 120;
				const r = size / 40;
				g.strokeRect(-r / 2, -r / 2, r, r);
				g.restore();
				if (labels && m.label) {
					g.fillStyle = m.color;
					g.font = `${Math.round(size / 55)}px ui-monospace, monospace`;
					g.textAlign = 'center';
					g.fillText(m.label, x, z - size / 35);
				}
			}
			// player arrow
			g.save();
			g.translate(tx(player.x), tz(player.z));
			g.rotate(-yaw);
			g.fillStyle = '#f3f5f7';
			const a = size / 28;
			g.beginPath();
			g.moveTo(0, -a);
			g.lineTo(a * 0.6, a * 0.7);
			g.lineTo(0, a * 0.35);
			g.lineTo(-a * 0.6, a * 0.7);
			g.closePath();
			g.fill();
			g.restore();
		};
		draw(this.mapCtx, 320, player.x, player.z, 70, false);
		if (!this.fullMap.classList.contains('ds-hidden')) draw(this.fullCtx, 900, 0, 0, bound, true);
	}

	setClock(seconds: string, warn: boolean): void {
		this.clock.textContent = seconds;
		this.clockBox.classList.toggle('warn', warn);
	}

	setObjectives(list: ObjectiveView[]): void {
		const key = JSON.stringify(list.map((o) => [o.title, o.desc, o.state]));
		if (key !== this.lastObj) {
			this.lastObj = key;
			const tag: Record<ObjState, string> = { locked: 'LOCKED', contract: 'CONTRACT', active: 'ACTIVE', done: 'COMPLETE' };
			this.objBox.innerHTML = list
				.map(
					(o) =>
						`<div class="ds-obj ds-panel ${o.state}"><div class="t">${o.title}<i>${tag[o.state]}</i></div><div class="d">${o.desc}</div>${
							o.progress !== undefined ? '<div class="bar"><span></span></div>' : ''
						}</div>`,
				)
				.join('');
		}
		const bars = this.objBox.querySelectorAll<HTMLElement>('.bar span');
		let b = 0;
		for (const o of list) if (o.progress !== undefined && bars[b]) bars[b++].style.width = `${Math.round(o.progress * 100)}%`;
	}

	setDistrict(name: string, threat: number): void {
		this.district.textContent = name;
		const [label, color] = threat > 6 ? ['HIGH THREAT', '#ff5a3a'] : threat > 2 ? ['MODERATE', '#e3c15a'] : ['LOW THREAT', '#7dff9a'];
		this.threat.textContent = label;
		this.threat.style.color = color;
	}

	private vitalsKey = '';

	setVitals(hp: number, armor: number, salvage: number, plates: number, frags: number, gained: number): void {
		const key = `${Math.ceil(hp)}|${Math.ceil(armor)}|${salvage}|${plates}|${frags}|${gained}`;
		if (key === this.vitalsKey) return;
		this.vitalsKey = key;
		this.hp.style.width = `${Math.max(0, hp)}%`;
		this.hp.style.background = hp < 35 ? '#ff5a4a' : '#e8edf2';
		this.armor.style.width = `${armor}%`;
		this.salvage.innerHTML = `◆ ${salvage}${gained ? `<small>+${gained}</small>` : ''}`;
		this.kit.innerHTML = `<span><b>${plates}</b> PLATES [F]</span><span><b>${frags}</b> FRAG [G]</span>`;
	}

	private weaponKey = '';

	setWeapon(name: string, ammo: number, mag: number, reserve: number, status: string): void {
		const key = `${name}|${ammo}|${reserve}|${status}`;
		if (key === this.weaponKey) return;
		this.weaponKey = key;
		this.wName.textContent = name;
		this.wAmmo.innerHTML = `${ammo}<small> / ${reserve}</small>`;
		this.wAmmo.classList.toggle('low', ammo <= Math.ceil(mag * 0.25));
		this.wReload.textContent = status;
	}

	setCrosshair(spreadPx: number, ads: boolean): void {
		const lines = this.cross.querySelectorAll<HTMLElement>('i');
		const g = 4 + spreadPx;
		lines[0].style.left = `${-g - 8}px`;
		lines[1].style.left = `${g}px`;
		lines[2].style.top = `${-g - 8}px`;
		lines[3].style.top = `${g}px`;
		this.cross.style.opacity = ads ? '0' : '1';
	}

	hitmarker(kill: boolean): void {
		this.hit.classList.toggle('kill', kill);
		this.hitT = kill ? 0.35 : 0.18;
	}

	setPrompt(html: string | null, progress = 0): void {
		if (!html) {
			this.prompt.classList.add('ds-hidden');
			return;
		}
		this.prompt.classList.remove('ds-hidden');
		this.prompt.innerHTML = `${html}${progress > 0 ? `<div class="prog" style="width:${Math.round(progress * 100)}%"></div>` : ''}`;
	}

	showBanner(kicker: string, head: string, sub = '', dur = 3): void {
		this.banner.innerHTML = `<div class="k">${kicker}</div><div class="h">${head}</div><div class="s">${sub}</div>`;
		this.bannerT = dur;
	}

	/** Kill feed line; fades out after a few seconds. */
	feed(html: string): void {
		const line = el('div', '', this.feedBox, html);
		setTimeout(() => (line.style.opacity = '0'), 3200);
		setTimeout(() => line.remove(), 4000);
		while (this.feedBox.children.length > 5) this.feedBox.firstElementChild?.remove();
	}

	setFps(fps: number | null, scale: number): void {
		this.fps.classList.toggle('ds-hidden', fps === null);
		if (fps !== null) this.fps.textContent = `${fps} FPS · ${Math.round(scale * 100)}% RES`;
	}

	showToast(text: string): void {
		this.toast.textContent = text;
		this.toastT = 1.6;
	}

	setBoss(frac: number | null): void {
		this.boss.classList.toggle('ds-hidden', frac === null);
		if (frac !== null) this.bossBar.style.width = `${frac * 100}%`;
	}

	damageFrom(angle: number): void {
		const arc = this.dmgArcs.find((a) => Number(a.dataset.t ?? 0) <= 0) ?? this.dmgArcs[0];
		arc.style.transform = `rotate(${angle}rad)`;
		arc.dataset.t = '1';
	}

	setMarkers(list: { x: number; y: number; label: string; color: 'gold' | 'green' | 'red'; visible: boolean }[]): void {
		while (this.markers.children.length < list.length) el('div', 'ds-marker', this.markers, '<i></i><span></span>');
		Array.from(this.markers.children).forEach((node, i) => {
			const m = list[i];
			const e = node as HTMLElement;
			if (!m || !m.visible) {
				e.style.display = 'none';
				return;
			}
			e.style.display = '';
			e.style.left = `${m.x}px`;
			e.style.top = `${m.y}px`;
			e.className = `ds-marker ${m.color === 'gold' ? '' : m.color}`;
			const span = e.querySelector('span');
			if (span) span.textContent = m.label;
		});
	}

	tick(dt: number, hurt: number): void {
		this.hitT = Math.max(0, this.hitT - dt);
		this.hit.style.opacity = String(Math.min(1, this.hitT * 8));
		this.bannerT -= dt;
		this.banner.style.opacity = this.bannerT > 0 ? '1' : '0';
		this.toastT -= dt;
		this.toast.style.opacity = this.toastT > 0 ? '1' : '0';
		this.vignette.style.opacity = String(Math.min(1, hurt));
		for (const a of this.dmgArcs) {
			const t = Math.max(0, Number(a.dataset.t ?? 0) - dt * 0.8);
			a.dataset.t = String(t);
			a.style.opacity = String(t);
		}
	}

	// ── menus ───────────────────────────────────────────────────────────────

	overlay(html: string): HTMLElement {
		this.clearOverlay();
		const o = el('div', 'ds-overlay', this.root);
		o.dataset.overlay = '1';
		el('div', 'ds-menu', o, html);
		return o;
	}

	clearOverlay(): void {
		this.root.querySelectorAll('[data-overlay]').forEach((n) => n.remove());
	}
}
