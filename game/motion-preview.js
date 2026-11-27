import * as THREE from '../vendor/three.module.min.js';
import { worldAt } from './scenes.js?v=20261127e';
import { sampleMotionPath } from './prop-motion.js?v=20261127e';

export function createMotionPreview(scene) {
  const preview = new THREE.Group();
  preview.position.z = 1.9;
  scene.add(preview);
  const overlay = { transparent: true, depthTest: false, depthWrite: false };
  const lineColor = new THREE.LineBasicMaterial({ ...overlay, color: '#fff0ad' });
  const pivotColor = new THREE.LineBasicMaterial({ ...overlay, color: '#94efff' });
  const markerMaterial = new THREE.MeshBasicMaterial({ ...overlay, color: '#fff0ad' });
  const pointGeometry = new THREE.CircleGeometry(.15, 16);
  const pivotGeometry = new THREE.RingGeometry(.18, .32, 24);

  function line(points, material) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector2(point.x, point.y)));
    const mesh = new THREE.Line(geometry, material);
    mesh.renderOrder = 11;
    preview.add(mesh);
  }

  function marker(point, geometry) {
    const mesh = new THREE.Mesh(geometry, markerMaterial);
    mesh.position.set(point.x, point.y, .01);
    mesh.renderOrder = 12;
    preview.add(mesh);
  }

  return definition => {
    for (const child of preview.children) if (child.isLine) child.geometry.dispose();
    preview.clear();
    const { s, h, motion } = definition ?? {};
    if (!motion) return;
    if (motion.pivot) {
      const pivot = worldAt(motion.pivot.s, motion.pivot.h);
      line([worldAt(s, h), pivot], pivotColor);
      marker(pivot, pivotGeometry);
    }
    if (motion.path?.length) {
      if (motion.path.length > 1) line(sampleMotionPath(motion.path), lineColor);
      for (const point of motion.path) marker(worldAt(point.s, point.h), pointGeometry);
    }
  };
}
