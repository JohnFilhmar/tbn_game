import { Mesh, MeshStandardMaterial, type Material, type Object3D } from 'three';

/** Narrows an object of the scene graph to a mesh. */
export function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

/** Narrows a material to the standard one every shipped asset uses. */
export function isStandardMaterial(material: Material): material is MeshStandardMaterial {
  return material instanceof MeshStandardMaterial;
}

/** Every material of a mesh, whether it has one or a list. */
export function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Every mesh under `root`, itself included. */
export function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (isMesh(object)) meshes.push(object);
  });
  return meshes;
}
