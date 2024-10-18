uniform vec3 uColor;
uniform sampler2D uTexture;

void main() {
    vec3 color = uColor;
    // float distanceToCenter = length(gl_PointCoord - 0.5);
    // if(distanceToCenter > 0.5)
    //     discard;

    vec4 tex = texture2D(uTexture, gl_PointCoord);

    gl_FragColor = vec4(color, tex.r);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}