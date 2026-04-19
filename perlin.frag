#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform sampler2D u_tex0;

#ifndef TRACK_DURATION
#define TRACK_DURATION 175.0
#endif

// band index -> approx hz range:
//   0: 30-80      sub bass
//   1: 80-160     bass
//   2: 160-320    low mid
//   3: 320-640    mid
//   4: 640-1280   upper mid
//   5: 1280-2560  presence
//   6: 2560-5120  brilliance
//   7: 5120-12000 air

float sampleBand(float idx) {
    float t = clamp(u_time / TRACK_DURATION, 0.0, 1.0);
    float y = (idx + 0.5) / 8.0;
    return texture2D(u_tex0, vec2(t, y)).r;
}

// boxcar average the band over `windowSec` of time — the envelope texture is
// 22 cols/sec, so 9 samples across ~0.5s is a cheap temporal low-pass that
// rounds off the sharp attack on bass hits
float sampleBandSmooth(float idx, float windowSec) {
    float t = clamp(u_time / TRACK_DURATION, 0.0, 1.0);
    float y = (idx + 0.5) / 8.0;
    float halfWin = 0.5 * windowSec / TRACK_DURATION;
    float sum = 0.0;
    const int N = 9;
    for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);          // 0..1
        float off = mix(-halfWin, halfWin, k);
        sum += texture2D(u_tex0, vec2(clamp(t + off, 0.0, 1.0), y)).r;
    }
    return sum / float(N);
}

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 123.7))) * 400.849);
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
    float amp = 0.716;
    for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return v;
}

// thin dark line wherever `x` crosses an integer; `width` controls thickness
float strand(float x, float width) {
    float d = abs(fract(x + 0.5) - 0.5);
    return 1.0 - smoothstep(0.0, width, d);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);

    // ~0.5s window on bass so pulses ease in/out instead of snapping
    float bass       = sampleBandSmooth(1.0, 0.5);
    float brilliance = sampleBand(6.0);

    // slow drifting flow field — domain-warp uv so strands look like they flow
    float zoom = 2.0;
    vec2 p = uv * zoom;
    float progress = clamp(u_time / TRACK_DURATION, 0.0, 1.0);
	float speed = mix(0.05, 0.4, progress);  // ramps from slow to fast over the track

    vec2 flow = vec2(
        fbm(p + vec2(0.0,  u_time * speed)), // TODO, increase speed here as song progresses
        fbm(p + vec2(5.0, -u_time * speed))
    );
    // bass kicks the warp amplitude so strands swirl harder on each hit
    p += flow * (0.6 + bass * 1.4);

    // fine detail — taking contours of this gives the strand lines
    float n = fbm(p * 1.8);

    // stack two sets of contour lines at different frequencies for the dense look
    // bass also fattens the lines slightly so strands thicken on the pulse
    float w = 0.06 + bass * 0.05;
    // float lines = 0.0;
    
    // first contour
    float line1 = strand(n * 9.0, w);
    line1 = clamp(line1, 0.0, 2.0);
    
    // Second contour, fainter at 80%
    float line2 = strand(n * 4.0 + 0., w * 0.8) * 0.8;
    line2 = clamp(line2, 0.0, 2.0);
    
    // Third contour, fainter at 80%
    float line3 = strand(n * 20.0 + 0.9, w * 0.9) * 0.9;
    line3 = clamp(line3, 0.0, 2.0);
    
    // lines = clamp(lines, 0.0, 2.0);

    // brilliance smoothly rotates both background and strand color
    vec3 bg     = mix(vec3(0.93, 0.94, 0.96), vec3(0.97, 0.90, 0.82), brilliance);
    
    vec3 strandCol1 = 1.300 + 0.5 * cos(6.2 * (brilliance + vec3(0.217,0.380,0.670)));
    vec3 strandCol2 = 0.8 + 0.8 * cos(6.2 * (brilliance + vec3(0.820,0.198,0.127)));
    vec3 strandCol3 = 0.8 + 0.8 * cos(6.2 * (brilliance + vec3(0.371,0.820,0.749)));
    strandCol1 *= 0.25;
	strandCol2 *= 0.25;
    strandCol3 *= 0.25;

    vec3 color = mix(bg, strandCol1, line1);
    color      = mix(color, strandCol2, line2); 
    color = mix(color, strandCol3, line3);
    

    gl_FragColor = vec4(color, 1.0);
}
