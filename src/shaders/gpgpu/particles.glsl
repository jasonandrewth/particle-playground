#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBaseTexture;

uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;

void main() {

    float time = uTime * 0.2;
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 particle = texture(uParticles, uv);
    vec4 initialPosition = texture(uBaseTexture, uv);

    if(particle.a >= 1.0) {
//clamping in 0-1 range but back to the right decimal value
        particle.a = fract(particle.a);
        particle.xyz = initialPosition.xyz;
    } else {
        // Strength
        float strength = simplexNoise4d(vec4(initialPosition.xyz + 0.0, time + 1.0));
        float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
        // remap from -1 1 to 0 1
        strength = smoothstep(influence, 1.0, strength);

    // Flow Field
        vec3 flowField = vec3(simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 0.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(particle.xyz * uFlowFieldFrequency + 2.0, time)));
        flowField = normalize(flowField);

        particle.xyz += flowField * uDeltaTime * strength * uFlowFieldStrength;

    //Decay
        particle.a += uDeltaTime * 0.25;
    }

    // particle.xyz = initialPosition.xyz;

    gl_FragColor = particle;

}