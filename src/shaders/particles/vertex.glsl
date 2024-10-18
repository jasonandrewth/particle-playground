uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;

varying vec3 vColor;

attribute float aSize;
attribute vec2 aParticlesUv;
attribute vec3 aColor;

void main() {

    //Compute Texture
    vec4 particle = texture(uParticlesTexture, aParticlesUv);
    vec3 newPos = particle.xyz;
    // Final position
    vec4 modelPosition = modelMatrix * vec4(newPos, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;
    gl_Position = projectedPosition;

    // Point Size
    float sizeIn = smoothstep(0.0, 0.1, particle.a);
    float sizeOut = 1.0 - smoothstep(0.7, 1.0, particle.a);
    float size = min(sizeIn, sizeOut);

    // Point size
    gl_PointSize = size * uSize * aSize * uResolution.y;
    gl_PointSize *= (1.0 / -viewPosition.z);

}