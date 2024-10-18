import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import GUI from "lil-gui";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";

import particlesVertexShader from "./shaders/particles/vertex.glsl";
import particlesFragmentShader from "./shaders/particles/fragment.glsl";
import baseParticlesCompute from "./shaders/gpgpu/particles.glsl";

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });
const debugObject = {};

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Loaders
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load("./particles/4.png");
texture.flipY = false;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2);

  // Materials
  particles.material.uniforms.uResolution.value.set(
    sizes.width * sizes.pixelRatio,
    sizes.height * sizes.pixelRatio
  );

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(sizes.pixelRatio);
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  45,
  sizes.width / sizes.height,
  0.01,
  100
);
camera.position.set(0, 0, 10);
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(sizes.pixelRatio);

debugObject.clearColor = "#29191f";
renderer.setClearColor(debugObject.clearColor);
debugObject.isAnimating = false;
/**
 * Load Model
 */
const gltf = await gltfLoader.loadAsync("./model.glb");
console.log(gltf);

/**
 * Base Geometry
 */
const baseGeometry = {};
baseGeometry.instance = gltf.scene.children[0].geometry;
baseGeometry.vertexCount = baseGeometry.instance.attributes.position.count;

/**
 * Ellipses
 */
// Create Circle Geometry and scale it to make an ellipse
const geometry = new THREE.RingGeometry(2.45, 2.5, 64);
geometry.scale(1, 0.5, 1); // Scale it along the Y-axis to make it elliptical

// Create a white material
const ellipseMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
}); // White color

// Create a mesh with the elliptical geometry and the white material
const ellipseCenter = new THREE.Mesh(geometry, ellipseMaterial);
const ellipseTop = new THREE.Mesh(geometry, ellipseMaterial);
ellipseTop.position.y = 1.25;
ellipseTop.scale.x = 0.6;
const ellipseBottom = new THREE.Mesh(geometry, ellipseMaterial);
ellipseBottom.position.y = -1.25;
ellipseBottom.scale.x = 0.6;
scene.add(ellipseCenter);
scene.add(ellipseTop);
scene.add(ellipseBottom);

/**
 * GPU Compute
 */

// Sizes for data tex
const size = 100;
const particlesCount = size * size;

let mainR = 2.5;
let outerLimit = 0.08;
let innerLimit = 0.08;

const gpgpu = {};
gpgpu.size = size;
// Create computation renderer
gpgpu.computation = new GPUComputationRenderer(
  gpgpu.size,
  gpgpu.size,
  renderer
);

// Create initial state float textures
// Base particles
const baseParticlesTex = gpgpu.computation.createTexture();

const positions = new Float32Array(particlesCount * 0.5 * 3);
const outerRingGeo = new THREE.BufferGeometry();

for (let i = 0; i < particlesCount * 0.5; i++) {
  //Stride
  const i3 = i * 3;
  const i4 = i * 4;

  let theta = Math.random() * Math.PI * 2;
  let r = 0.5 * 0.5 * Math.random() * 10;

  let inout = (Math.random() - 0.5) * 2;
  let lim = inout >= 0 ? outerLimit : innerLimit;
  let rand = mainR + Math.pow(Math.random(), 3) * lim * inout;

  r = THREE.MathUtils.randFloat(0.5 * mainR, 1.2 * mainR);
  let phi = THREE.MathUtils.randFloat(0, Math.PI * 2);

  let pos = new THREE.Vector3().setFromCylindricalCoords(
    rand,
    Math.PI * 2 * Math.random(),
    0
  );

  // pos.z *= 0.5;

  //Position based on geometry
  positions[i3 + 0] = pos.x;
  positions[i3 + 1] = pos.z;
  positions[i3 + 2] = Math.random() * 0.1;
}

outerRingGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
const outerRingMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.05,
  sizeAttenuation: true,
  transparent: true,
  blendAlpha: true,
  depthWrite: false,
  alphaMap: texture,
});
const outerRingPoints = new THREE.Points(outerRingGeo, outerRingMaterial);
scene.add(outerRingPoints);

//Diamond Test
const octahedronGeometry = new THREE.OctahedronGeometry(2.5, 0);
octahedronGeometry.scale(0.5, 0.7, 0.5);
const octaTest = new THREE.Mesh(octahedronGeometry, ellipseMaterial);

const surfaceSampler = new MeshSurfaceSampler(octaTest).build();
const posOct = new THREE.Vector3();
// TES TEST
for (let i = 0; i < particlesCount; i++) {
  //Stride
  const i3 = i * 3;
  const i4 = i * 4;

  surfaceSampler.sample(posOct);

  //Position based on geometry
  baseParticlesTex.image.data[i4 + 0] = posOct.x;
  baseParticlesTex.image.data[i4 + 1] = posOct.y;
  baseParticlesTex.image.data[i4 + 2] = posOct.z;
  //Start alha at random (life start)
  baseParticlesTex.image.data[i4 + 3] = Math.random();
}

// Add texture variables
gpgpu.particlesVariable = gpgpu.computation.addVariable(
  "uParticles",
  baseParticlesCompute,
  baseParticlesTex
);
// Set variable dependencies
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [
  gpgpu.particlesVariable,
]);
//Uniforms
gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence =
  new THREE.Uniform(0.2);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength =
  new THREE.Uniform(0.7);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency =
  new THREE.Uniform(0.5);

gpgpu.particlesVariable.material.uniforms.uBaseTexture = new THREE.Uniform(
  baseParticlesTex
);
console.log(gpgpu.particlesVariable.material.uniforms);
// Init
gpgpu.computation.init();

// DEBUG
gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    //Get the off screen texture
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable)
      .texture,
    transparent: true,
  })
);

gpgpu.debug.position.x = 5;
// scene.add(gpgpu.debug);

/**
 * Particles
 */
const particles = {};

//Geometry
const particlesUvArray = new Float32Array(particlesCount * 2);
const sizesArray = new Float32Array(particlesCount);

for (let y = 0; y < gpgpu.size; y++) {
  for (let x = 0; x < gpgpu.size; x++) {
    const i = y * gpgpu.size + x;
    const i2 = i * 2;

    //Particles UV
    const uvX = (x + 0.5) / gpgpu.size; // U coordinate
    const uvY = (y + 0.5) / gpgpu.size; // V coordinate

    particlesUvArray[i2 + 0] = uvX;
    particlesUvArray[i2 + 1] = uvY;

    //Size
    sizesArray[i] = Math.random();
  }
}

console.log(particlesUvArray);
console.log(gpgpu.size);

particles.geometry = new THREE.BufferGeometry();
particles.geometry.setDrawRange(0, particlesCount);
particles.geometry.setAttribute(
  "aParticlesUv",
  new THREE.BufferAttribute(particlesUvArray, 2)
);
particles.geometry.setAttribute(
  "aSize",
  new THREE.Float32BufferAttribute(sizesArray, 1)
);

// Material
particles.material = new THREE.ShaderMaterial({
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms: {
    uSize: new THREE.Uniform(0.025),
    uColor: new THREE.Uniform(new THREE.Color(0xffffff)),
    uResolution: new THREE.Uniform(
      new THREE.Vector2(
        sizes.width * sizes.pixelRatio,
        sizes.height * sizes.pixelRatio
      )
    ),
    uParticlesTexture: new THREE.Uniform(),
    uTexture: new THREE.Uniform(texture),
  },
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

// Points
particles.points = new THREE.Points(particles.geometry, particles.material);
scene.add(particles.points);

/**
 * Tweaks
 */
gui.add(debugObject, "isAnimating");
gui.addColor(debugObject, "clearColor").onChange(() => {
  renderer.setClearColor(debugObject.clearColor);
});
gui
  .add(particles.material.uniforms.uSize, "value")
  .min(0)
  .max(1)
  .step(0.001)
  .name("particlesSize");
gui
  .addColor(particles.material.uniforms.uColor, "value")
  .name("particlesColor")
  .onChange((v) => {
    console.log(v, particles.material.uniforms.uColor.value);
    ellipseCenter.material.color = v;
    outerRingMaterial.color = v;
  });

gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence, "value")
  .min(0)
  .max(1)
  .step(0.001)
  .name("uFlowFieldInfluence");
gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength, "value")
  .min(0)
  .max(10)
  .step(0.01)
  .name("uFlowFieldStrength");
gui
  .add(gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency, "value")
  .min(0)
  .max(1)
  .step(0.001)
  .name("uFlowFieldFrequency");
/**
 * Animate
 */
const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - previousTime;

  previousTime = elapsedTime;

  // Update controls
  controls.update();

  if (debugObject.isAnimating) {
    particles.points.rotation.y = elapsedTime * 0.25;
    ellipseCenter.rotation.x = elapsedTime * 0.25;
    ellipseBottom.rotation.y = elapsedTime * 0.25;
    ellipseTop.rotation.y = elapsedTime * -0.25;

    outerRingPoints.rotation.y = elapsedTime * 0.25;
    outerRingPoints.rotation.x = elapsedTime * -0.25;
  }

  // Update GPGPU
  gpgpu.particlesVariable.material.uniforms.uTime.value = elapsedTime;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;

  gpgpu.computation.compute();
  particles.material.uniforms.uParticlesTexture.value =
    gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture;

  // Render normal scene
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
