// Miniatura del modelo: isométrica en color madera con sus aristas, fondo transparente.
// Se genera en el navegador (el servidor no tiene GPU) y se sube como PNG.

import * as THREE from "three";
import { bodyEdges, type Body } from "@/lib/geometry/mesh";
import { viewBasis } from "@/lib/drawing/project";

export async function renderThumbnail(bodies: Body[], width = 480, height = 360): Promise<Blob> {
  const { u, v, d } = viewBasis("iso");
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity, minD = Infinity, maxD = -Infinity;
  const p = new THREE.Vector3();
  for (const b of bodies) {
    for (let i = 0; i < b.positions.length; i += 3) {
      p.set(b.positions[i], b.positions[i + 1], b.positions[i + 2]);
      const pu = p.dot(u), pv = p.dot(v), pd = p.dot(d);
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
      minD = Math.min(minD, pd);
      maxD = Math.max(maxD, pd);
    }
  }
  // Encuadre con margen, respetando la proporción de la imagen
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
  let hw = ((maxU - minU) / 2) * 1.08, hh = ((maxV - minV) / 2) * 1.08;
  if (hw / hh > width / height) hh = (hw * height) / width;
  else hw = (hh * width) / height;
  const camera = new THREE.OrthographicCamera(cu - hw, cu + hw, cv + hh, cv - hh, 1, maxD - minD + 2);
  camera.position.copy(d.clone().multiplyScalar(minD - 1));
  camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, d.clone().negate()));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a66, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.copy(d.clone().negate().add(v.clone().multiplyScalar(0.9)).add(u.clone().multiplyScalar(-0.6)));
  scene.add(sun);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xd8b88a,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a });
  const geoms: THREE.BufferGeometry[] = [];
  for (const b of bodies) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.positions, 3));
    g.setIndex(new THREE.BufferAttribute(b.indices, 1));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mat));
    const feat = bodyEdges(b).filter((e) => e.feature);
    const lp = new Float32Array(feat.length * 6);
    feat.forEach((e, i) => lp.set([...e.a, ...e.b], i * 6));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
    scene.add(new THREE.LineSegments(lg, lineMat));
    geoms.push(g, lg);
  }
  renderer.render(scene, camera);
  const blob = await new Promise<Blob | null>((res) => renderer.domElement.toBlob(res, "image/png"));
  geoms.forEach((g) => g.dispose());
  mat.dispose();
  lineMat.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  if (!blob) throw new Error("No se pudo generar la miniatura");
  return blob;
}

/** Descarga la malla, genera la miniatura y la sube. */
export async function createThumbnail(modelId: string, fetchBodies: () => Promise<Body[]>) {
  const blob = await renderThumbnail(await fetchBodies());
  const res = await fetch(`/api/models/${modelId}/thumbnail`, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
  if (!res.ok) throw new Error(`No se pudo guardar la miniatura (${res.status})`);
}
