import * as THREE from 'three';

/**
 * Final-frame grade, applied after tone mapping: teal/orange split toning,
 * radial chromatic aberration, vignette, film grain and a red damage pulse.
 */
export const GradeShader = {
	name: 'GradeShader',
	uniforms: {
		tDiffuse: { value: null as THREE.Texture | null },
		uTime: { value: 0 },
		uHurt: { value: 0 },
		uAberration: { value: 0.0012 },
		uGrain: { value: 0.045 },
		uVignette: { value: 0.32 },
		uFlash: { value: 0 },
		uRain: { value: 0 },
		uResolution: { value: new THREE.Vector2(1, 1) },
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float uTime;
		uniform float uHurt;
		uniform float uAberration;
		uniform float uGrain;
		uniform float uVignette;
		uniform float uFlash;
		uniform float uRain;
		uniform vec2 uResolution;
		varying vec2 vUv;

		float hash(vec2 p) {
			p = fract(p * vec2(123.34, 456.21));
			p += dot(p, p + 45.32);
			return fract(p.x * p.y);
		}

		// rain beading on the lens: sparse drops that refract and slowly slide
		vec2 lensDrops(vec2 uv, float t) {
			vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
			vec2 offs = vec2(0.0);
			for (int layer = 0; layer < 2; layer++) {
				float sc = layer == 0 ? 5.0 : 9.0;
				vec2 p = uv * aspect * sc + float(layer) * 13.1;
				vec2 id = floor(p);
				vec2 f = fract(p) - 0.5;
				float h = hash(id);
				float life = fract(t * (0.08 + 0.05 * h) + h * 7.0);
				vec2 ctr = vec2(hash(id + 3.1) - 0.5, (hash(id + 7.7) - 0.5) + 0.35 - life * 0.7) * 0.6;
				float r = (layer == 0 ? 0.16 : 0.1) * (0.6 + 0.4 * hash(id + 1.3));
				vec2 d = f - ctr;
				float m = smoothstep(r, r * 0.55, length(d)) * step(0.6, h) * smoothstep(1.0, 0.6, life);
				offs += d * m * 0.9 / sc;
			}
			return offs;
		}

		void main() {
			vec2 uv = vUv + lensDrops(vUv, uTime) * uRain;
			vec2 c = uv - 0.5;
			float r2 = dot(c, c);
			float ab = uAberration * (1.0 + uHurt * 4.0) * r2 * 4.0;
			vec3 col;
			col.r = texture2D(tDiffuse, uv + c * ab).r;
			col.g = texture2D(tDiffuse, uv).g;
			col.b = texture2D(tDiffuse, uv - c * ab).b;

			// split toning: cool shadows, warm highlights
			float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
			vec3 shadows = vec3(0.86, 0.98, 1.12);
			vec3 highs = vec3(1.08, 1.0, 0.9);
			col *= mix(shadows, highs, smoothstep(0.05, 0.7, l));
			// gentle S-curve for punch, then lift the deepest shadows a touch so
			// silhouettes stay readable instead of crushing to black
			col = mix(col, col * col * (3.0 - 2.0 * col), 0.15);
			col += vec3(0.012, 0.015, 0.022) * (1.0 - smoothstep(0.0, 0.2, l));

			// lightning wash
			col += vec3(0.55, 0.62, 0.8) * uFlash * (0.35 + l);

			// vignette + hurt
			float vig = smoothstep(0.85, 0.2, r2 * 2.2);
			col *= mix(1.0 - uVignette, 1.0, vig);
			col = mix(col, col * vec3(1.35, 0.35, 0.3), uHurt * (1.0 - vig) * 0.85);

			// grain, stronger in shadows like film
			float g = hash(vUv * uResolution + fract(uTime * 13.7) * 100.0) - 0.5;
			col += g * uGrain * (1.2 - l);

			gl_FragColor = vec4(max(col, 0.0), 1.0);
		}`,
};
