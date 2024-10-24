#include ../includes/simplexNoise4d.glsl

uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBaseTexture;

uniform vec3 uMouse;
uniform float uMouseStrength;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {

    float time = uTime * 0.2;
    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec4 position = texture(uParticlesPos, uv);
    vec3 initialPosition = texture(uBaseTexture, uv).xyz;

    vec3 velocity = texture2D(uParticlesVel, uv).xyz;
    //Friction
    velocity *= 0.95;
    // Strength
    float strength = simplexNoise4d(vec4(initialPosition.xyz + 0.0, time + 1.0));
    float influence = (uFlowFieldInfluence - 0.5) * (-2.0);
        // remap from -1 1 to 0 1
    strength = smoothstep(influence, 1.0, strength);

    // Flow Field
    vec3 flowField = vec3(simplexNoise4d(vec4(position.xyz * uFlowFieldFrequency + 0.0, time)), simplexNoise4d(vec4(position.xyz * uFlowFieldFrequency + 1.0, time)), simplexNoise4d(vec4(position.xyz * uFlowFieldFrequency + 2.0, time)));
    flowField = normalize(flowField);

    // velocity = flowField * uDeltaTime * strength * uFlowFieldStrength;

    // particle attraction to original shape force
    vec3 direction = normalize(initialPosition - position.xyz);
    float dist = length(initialPosition - position.xyz);
    if(dist > 0.01) {
        velocity += direction * 0.0001;
    }

    // mouse repel force
    float mouseDistance = distance(position.xyz, uMouse);
    float maxDistance = 0.3;
    if(mouseDistance < maxDistance) {
        vec3 direction = normalize(position.xyz - uMouse);
        velocity += direction * (1.0 - mouseDistance / maxDistance) * 0.02 * uMouseStrength;
    }

    gl_FragColor = vec4(velocity.xyz, 1.0);

}