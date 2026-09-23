/**
 * Xbox-style controller support via the Gamepad API (standard mapping).
 * Polled once per frame; exposes analog sticks, triggers and button edges.
 */

export const BTN = {
	A: 0,
	B: 1,
	X: 2,
	Y: 3,
	LB: 4,
	RB: 5,
	LT: 6,
	RT: 7,
	VIEW: 8,
	MENU: 9,
	L3: 10,
	R3: 11,
	UP: 12,
	DOWN: 13,
	LEFT: 14,
	RIGHT: 15,
} as const;

const DEAD = 0.16;

/** Radial deadzone with the remaining range rescaled to 0..1. */
function stick(x: number, y: number): [number, number] {
	const m = Math.hypot(x, y);
	if (m < DEAD) return [0, 0];
	const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
	return [x * k, y * k];
}

export class Pad {
	connected = false;
	/** True when the controller was the most recent input device. */
	active = false;
	moveX = 0;
	moveY = 0;
	lookX = 0;
	lookY = 0;
	lt = 0;
	rt = 0;
	private down: boolean[] = [];
	private prev: boolean[] = [];
	private index = -1;
	private repeatT = 0;

	poll(dt: number): void {
		const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
		let gp: Gamepad | null = null;
		if (this.index >= 0) gp = pads[this.index] ?? null;
		if (!gp) {
			for (const p of pads) {
				if (p && p.connected) {
					gp = p;
					this.index = p.index;
					break;
				}
			}
		}
		this.prev = this.down;
		if (!gp) {
			this.connected = false;
			this.down = [];
			this.moveX = this.moveY = this.lookX = this.lookY = this.lt = this.rt = 0;
			return;
		}
		this.connected = true;
		this.down = gp.buttons.map((b) => b.pressed);
		[this.moveX, this.moveY] = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
		[this.lookX, this.lookY] = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
		this.lt = gp.buttons[BTN.LT]?.value ?? 0;
		this.rt = gp.buttons[BTN.RT]?.value ?? 0;
		const any = this.down.some(Boolean) || Math.abs(this.moveX) + Math.abs(this.moveY) + Math.abs(this.lookX) + Math.abs(this.lookY) > 0 || this.lt > 0.1 || this.rt > 0.1;
		if (any) this.active = true;
		this.repeatT = Math.max(0, this.repeatT - dt);
	}

	held(b: number): boolean {
		return !!this.down[b];
	}

	pressed(b: number): boolean {
		return !!this.down[b] && !this.prev[b];
	}

	released(b: number): boolean {
		return !this.down[b] && !!this.prev[b];
	}

	/** Menu navigation: -1 / +1 on D-pad or stick flicks, with key-repeat. */
	navY(): number {
		if (this.pressed(BTN.UP)) return -1;
		if (this.pressed(BTN.DOWN)) return 1;
		const y = this.moveY;
		if (Math.abs(y) > 0.6 && this.repeatT <= 0) {
			this.repeatT = 0.22;
			return Math.sign(y);
		}
		if (Math.abs(y) < 0.3 && !this.held(BTN.UP) && !this.held(BTN.DOWN) && Math.abs(this.moveX) < 0.3) this.repeatT = 0;
		return 0;
	}

	navX(): number {
		if (this.pressed(BTN.LEFT)) return -1;
		if (this.pressed(BTN.RIGHT)) return 1;
		const x = this.moveX;
		if (Math.abs(x) > 0.6 && this.repeatT <= 0) {
			this.repeatT = 0.12;
			return Math.sign(x);
		}
		return 0;
	}

	rumble(strong: number, weak: number, ms: number): void {
		if (!this.active || this.index < 0) return;
		const gp = navigator.getGamepads()[this.index];
		const act = gp?.vibrationActuator as unknown as { playEffect?: (t: string, p: object) => Promise<unknown> } | undefined;
		act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch(() => undefined);
	}
}
