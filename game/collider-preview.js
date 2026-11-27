import * as THREE from '../vendor/three.module.min.js';
import { worldAt } from './scenes.js?v=20261127';

export function createColliderPreview(scene) {
  const group = new THREE.Group();
  const fill = new THREE.MeshBasicMaterial({ color: '#111015', side: THREE.DoubleSide,
    depthTest: false, depthWrite: false, transparent: true, opacity: .88 });
  const border = new THREE.LineBasicMaterial({ color: '#a4fff0', depthTest: false, depthWrite: false, transparent: true });
  const previews = new Map();
  group.visible = false;
  scene.add(group);

  function disposePreview(preview) {
    group.remove(preview.fill, preview.border);
    preview.fill.geometry.dispose();
    preview.border.geometry.dispose();
  }

  return state => {
    group.visible = Boolean(state);
    if (!state) return;
    const visibleIds = new Set(state.blocks.map(block => block.id));
    for (const [id, preview] of previews) {
      if (visibleIds.has(id)) continue;
      disposePreview(preview);
      previews.delete(id);
    }
    for (const {id, s, h, width, height} of state.blocks) {
      let preview = previews.get(id);
      if (!preview || preview.s !== s || preview.h !== h || preview.width !== width || preview.height !== height) {
        if (preview) disposePreview(preview);
        const points = [];
        const columns = Math.max(2, Math.ceil(width / 1.5));
        for (const rim of [-1, 1]) {
          for (let i = 0; i <= columns; i++) {
            const edge = worldAt(s + rim * (i / columns - .5) * width, h + rim * height / 2);
            points.push(new THREE.Vector2(edge.x, edge.y));
          }
        }
        const body = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(points)), fill);
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), border);
        body.renderOrder = 5;
        outline.renderOrder = 6;
        group.add(body, outline);
        preview = { s, h, width, height, fill: body, border: outline };
        previews.set(id, preview);
      }
      preview.border.visible = id === state.selectedId;
    }
  };
}
