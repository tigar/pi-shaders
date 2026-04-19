#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_tex0;

#ifndef TRACK_DURATION
#define TRACK_DURATION 175.0
#endif
#define N_BANDS 8.0

float band(float idx) {
    float t = clamp(u_time / TRACK_DURATION, 0.0, 1.0);
    float y = (idx + 0.5) / N_BANDS;
    return texture2D(u_tex0, vec2(t, y)).r;
}

vec3 globals() {
    float t = clamp(u_time / TRACK_DURATION, 0.0, 1.0);
    return texture2D(u_tex0, vec2(t, 0.5)).rgb;
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.02;
        amp *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    float bass    = band(1.0);
    float mid     = band(3.0);
    float presence = band(5.0);
    float air     = band(7.0);
    vec3 g = globals();
    float onset = g.g;
    float loud  = g.b;

    float t = u_time * (0.15 + mid * 0.6);

    vec2 q = uv * 2.0;
    vec2 warp = vec2(
        fbm(q + vec2(0.0,  t)),
        fbm(q + vec2(5.2, -t))
    );
    vec2 p = uv * 2.5 + warp * (0.4 + bass * 2.5);

    float n = fbm(p + vec2(t * 0.4, -t * 0.3));

    float shim = noise(uv * 18.0 + t * 2.0) * (presence + air) * 0.4;
    n += shim;

    vec3 col = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + n + u_time * 0.05));

    col *= 0.25 + 2.0 * bass;
    col += onset * vec3(1.0, 0.9, 0.7) * 0.7;
    col += loud * 0.10 * vec3(0.3, 0.2, 0.5);

    float r = length(uv);
    col *= smoothstep(1.2, 0.2, r);

    gl_FragColor = vec4(col, 1.0);
}
