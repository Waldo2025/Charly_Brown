import * as THREE from './vendor/three/three.module.js';

let scene, camera, renderer, particles;

const canvas = document.getElementById('backgroundCanvas');
const sizes = { width: window.innerWidth, height: window.innerHeight };

scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.z = 5;
scene.add(camera);

renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(window.devicePixelRatio);

const geometry = new THREE.BufferGeometry();
const count = 1000;
const positions = new Float32Array(count * 3);

for (let i = 0; i < count * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 10;
}

geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  size: 0.03,
  color: '#ffffff'
});

particles = new THREE.Points(geometry, material);
scene.add(particles);

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsedTime = clock.getElapsedTime();
  particles.rotation.y = elapsedTime * 0.1;
  particles.rotation.x = Math.sin(elapsedTime * 0.05) * 0.05;
  renderer.render(scene, camera);
}
animate();
