import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import GUI from "lil-gui";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

import particlesVertexShader from "./shaders/particles/vertex.glsl";
import particlesFragmentShader from "./shaders/particles/fragment.glsl";
import baseParticlesPosCompute from "./shaders/gpgpu/particlesPos.glsl";
import baseParticlesVelCompute from "./shaders/gpgpu/particlesVel.glsl";

function movePointAlongDirection(point, direction, distance) {
  const normalizedDirection = direction.clone().normalize(); // Normalize the direction vector
  const movedPoint = point
    .clone()
    .add(normalizedDirection.multiplyScalar(distance)); // Move point

  return movedPoint;
}

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });
const debugObject = {};
debugObject.color = "#ffffff";
debugObject.isAnimating = false;
debugObject.flowFieldInfluence = 0.2;

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Loaders
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load("./particles/1.png");
texture.flipY = false;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);
// Mouse
let isAnimating = false;
const raycaster = new THREE.Raycaster();
raycaster.params.Mesh = { threshold: 4 };
const pointer = new THREE.Vector3();

// Quaternion rotation stuff
const targetQuaternion = new THREE.Quaternion(); // This will be the identity quaternion when stopping
const quaternionIncrement = new THREE.Quaternion(); // Will store incremental rotations
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
 * Mouse
 */
const meshGeo = new THREE.SphereGeometry(2.6, 32, 32);
meshGeo.scale(1, 1, 1);
const raycasterMesh = new THREE.Mesh(meshGeo, new THREE.MeshBasicMaterial());
// scene.add(raycasterMesh);

const dummy = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 32, 32),
  new THREE.MeshNormalMaterial()
);
scene.add(dummy);

window.addEventListener("mousemove", (e) => {
  pointer.x = (e.clientX / sizes.width) * 2 - 1;
  pointer.y = -(e.clientY / sizes.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObject(raycasterMesh, false);
  if (intersects.length > 0) {
    const mirrorPoint = movePointAlongDirection(
      intersects[0].point,
      raycaster.ray.direction,
      4
    );
    isAnimating = true;
    console.log(intersects[0].point, mirrorPoint);
    dummy.position.copy(intersects[0].point);
    // this.simMaterial.uniforms.uMouse.value = intersects[0].point;
    // this.positionUniforms.uMouse.value = intersects[0].point;
    gpgpu.particlesVelVariable.material.uniforms.uMouse.value =
      intersects[0].point;

    gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value = 0.7;
  } else {
    gpgpu.particlesVelVariable.material.uniforms.uMouse.value =
      new THREE.Vector3(0);
    gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value =
      debugObject.flowFieldInfluence;
    dummy.position.copy(
      gpgpu.particlesVelVariable.material.uniforms.uMouse.value
    );

    isAnimating = false;
  }
});

window.addEventListener("touchstart", (e) => {
  isAnimating = true;
  gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value = 0.7;
});

window.addEventListener("touchend", (e) => {
  isAnimating = false;
  gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value =
    debugObject.flowFieldInfluence;
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
controls.maxPolarAngle = Math.PI;
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

debugObject.clearColor = "#000000";
renderer.setClearColor(debugObject.clearColor);

/**
 * Load Model
 */
const gltf = await gltfLoader.loadAsync("./cubelogocenterglobal.glb");
const outer = gltf.scene.children[0];
// outer.scale.set(0.2, 0.2, 0.2);
const inner = outer.children[1];

const testMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const ambient = new THREE.AmbientLight(0xffffff, 1);

scene.add(ambient);

outer.traverse((child) => {
  if (child.isMesh) {
    console.log(child.material.color);
    child.material = testMat;
  }
});
scene.add(outer);

/**
 * Base Geometry
 */
const baseGeometry = {};

/**
 * GPU Compute
 */

// Sizes for data tex
const size = 128;
const particlesCount = size * size;

let mainR = 2.5;
let outerLimit = 1.8;
let innerLimit = 0.8;

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
//Position Data Texture
const baseParticlesPosTex = gpgpu.computation.createTexture();

const radius = 2.6;
for (let i = 0; i < particlesCount; i++) {
  //Stride
  const i3 = i * 3;
  const i4 = i * 4;

  //generate points on a sphere
  let theta = Math.random() * Math.PI * 2;
  let phi = Math.acos(Math.random() * 2 - 1); //between 0 and pi

  let x = Math.sin(phi) * Math.cos(theta) * radius;
  let y = Math.sin(phi) * Math.sin(theta) * radius;
  let z = Math.cos(phi) * radius;

  // pos.z *= 0.5;

  baseParticlesPosTex.image.data[i4] = x;
  baseParticlesPosTex.image.data[i4 + 1] = y;
  baseParticlesPosTex.image.data[i4 + 2] = z;
  baseParticlesPosTex.image.data[i4 + 3] = Math.random();
}

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
  // depthWrite: false,
  alphaMap: texture,
});
const outerRingPoints = new THREE.Points(outerRingGeo, outerRingMaterial);
// scene.add(outerRingPoints);

//Velocity Data Texture
const baseParticlesVelTex = gpgpu.computation.createTexture();
//Init empty i guess
for (let i = 0; i < particlesCount; i++) {
  //Stride
  const i4 = i * 4;

  baseParticlesVelTex.image.data[i4] = 0;
  baseParticlesVelTex.image.data[i4 + 1] = 0;
  baseParticlesVelTex.image.data[i4 + 2] = 0;
  baseParticlesVelTex.image.data[i4 + 3] = 0;
}
// Add texture variables
gpgpu.particlesVariable = gpgpu.computation.addVariable(
  "uParticlesPos",
  baseParticlesPosCompute,
  baseParticlesPosTex
);
gpgpu.particlesVelVariable = gpgpu.computation.addVariable(
  "uParticlesVel",
  baseParticlesVelCompute,
  baseParticlesVelTex
);
// Set variable dependencies
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [
  gpgpu.particlesVariable,
  gpgpu.particlesVelVariable,
]);
gpgpu.computation.setVariableDependencies(gpgpu.particlesVelVariable, [
  gpgpu.particlesVariable,
  gpgpu.particlesVelVariable,
]);
//Uniforms Pos
gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence =
  new THREE.Uniform(0.2);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength =
  new THREE.Uniform(0.7);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency =
  new THREE.Uniform(0.5);

gpgpu.particlesVariable.material.uniforms.uBaseTexture = new THREE.Uniform(
  baseParticlesPosTex
);

//Uniforms Vel
gpgpu.particlesVelVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVelVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVelVariable.material.uniforms.uFlowFieldInfluence =
  new THREE.Uniform(0.2);
gpgpu.particlesVelVariable.material.uniforms.uFlowFieldStrength =
  new THREE.Uniform(0.7);
gpgpu.particlesVelVariable.material.uniforms.uFlowFieldFrequency =
  new THREE.Uniform(0.5);
gpgpu.particlesVelVariable.material.uniforms.uMouse = new THREE.Uniform(
  new THREE.Vector3(0, 0, 0)
);
gpgpu.particlesVelVariable.material.uniforms.uMouseStrength = new THREE.Uniform(
  0.5
);
gpgpu.particlesVelVariable.material.uniforms.uBaseTexture = new THREE.Uniform(
  baseParticlesPosTex
);
console.log(gpgpu.particlesVelVariable.material.uniforms);
// Init
gpgpu.computation.init();

// DEBUG
gpgpu.debug = new THREE.Mesh(
  new THREE.PlaneGeometry(3, 3),
  new THREE.MeshBasicMaterial({
    //Get the off screen texture
    map: gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVelVariable)
      .texture,
    transparent: true,
  })
);

gpgpu.debug.position.x = 5;
scene.add(gpgpu.debug);

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
    uSize: new THREE.Uniform(0.05),
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
  // blending: THREE.AdditiveBlending,
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
  });
gui
  .addColor(debugObject, "color")
  .name("logoColor")
  .onChange((v) => {
    testMat.color.set(v);
  });

gui
  .add(gpgpu.particlesVelVariable.material.uniforms.uMouseStrength, "value")
  .min(0)
  .max(1)
  .step(0.001)
  .name("mouseStrength");

gui
  .add(debugObject, "flowFieldInfluence")
  .min(0)
  .max(1)
  .step(0.001)
  .name("uFlowFieldInfluence")
  .onChange(
    (v) =>
      (gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence.value = v)
  );
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
const transitionSpeed = 0.05;
const rotationAxisY = new THREE.Vector3(0, 1, 0); // Rotate around the Y-axis
const rotationAxisX = new THREE.Vector3(1, 0, 0); // Rotate around the Y-axis
const rotationSpeed = 0.005; // Rotation speed per frame

const clock = new THREE.Clock();
let previousTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - previousTime;

  previousTime = elapsedTime;

  // Update controls
  controls.update();

  if (isAnimating) {
    quaternionIncrement.setFromAxisAngle(rotationAxisY, rotationSpeed);
    outer.quaternion.multiplyQuaternions(quaternionIncrement, outer.quaternion);
    //X Rotation
    quaternionIncrement.setFromAxisAngle(rotationAxisX, rotationSpeed);
    inner.children[0].quaternion.multiplyQuaternions(
      quaternionIncrement,
      inner.children[0].quaternion
    );
    inner.children[1].quaternion.multiplyQuaternions(
      quaternionIncrement,
      inner.children[1].quaternion
    );
    inner.children[3].quaternion.multiplyQuaternions(
      quaternionIncrement,
      inner.children[3].quaternion
    );
  } else {
    outer.quaternion.slerp(targetQuaternion, transitionSpeed);
    inner.children[0].quaternion.slerp(targetQuaternion, transitionSpeed);
    inner.children[1].quaternion.slerp(targetQuaternion, transitionSpeed);
    inner.children[3].quaternion.slerp(targetQuaternion, transitionSpeed);
  }

  // Update GPGPU
  gpgpu.particlesVariable.material.uniforms.uTime.value = elapsedTime;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
  gpgpu.particlesVelVariable.material.uniforms.uTime.value = elapsedTime;
  gpgpu.particlesVelVariable.material.uniforms.uDeltaTime.value = deltaTime;

  // console.log(gpgpu.particlesVelVariable.material.uniforms.uDeltaTime.value);

  gpgpu.computation.compute();
  particles.material.uniforms.uParticlesTexture.value =
    gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture;

  // Render normal scene
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
