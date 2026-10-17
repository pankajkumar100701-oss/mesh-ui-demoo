/** GLSL helpers shared by the Nebula scene. */

export const noise3 = /* glsl */ `
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

export const noise2 = /* glsl */ `
  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash2(i);
    float b = hash2(i + vec2(1.0, 0.0));
    float c = hash2(i + vec2(0.0, 1.0));
    float d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm2(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise2(p);
      p = r * p * 2.02 + 17.1;
      a *= 0.5;
    }
    return v;
  }
`;

/** Camera-facing glow quad: soft radial falloff with a hot centre. */
export const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Billboard: take the object's centre in view space and offset in screen axes.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float s = length(modelMatrix[0].xyz);
    mv.xy += position.xy * s;
    gl_Position = projectionMatrix * mv;
  }
`;

export const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = exp(-d * d * uFalloff) * (1.0 - smoothstep(0.7, 1.0, d));
    float core = exp(-d * d * uFalloff * 12.0);
    vec3 col = uColor * g + vec3(1.0) * core * 0.6;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;
