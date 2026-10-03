import { mkdir, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { dirname } from 'node:path';
import type { AnimationClip, Object3D } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** What the exporter needs of `FileReader`, which Node does not have. */
class BlobReader {
  onloadend: (() => void) | null = null;
  result: ArrayBuffer | string | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

const globalScope: { FileReader?: unknown } = globalThis;
globalScope.FileReader ??= BlobReader;

/** Exports an object tree and its clips as one binary glTF. */
export async function exportGlb(
  root: Object3D,
  animations: AnimationClip[] = [],
): Promise<Uint8Array> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, animations });
  if (!(result instanceof ArrayBuffer))
    throw new Error('The exporter did not return a binary glTF');
  return new Uint8Array(result);
}

/** Writes a binary glTF to `path`, creating its directory. */
export async function writeGlb(
  path: string,
  root: Object3D,
  animations: AnimationClip[] = [],
): Promise<number> {
  const bytes = await exportGlb(root, animations);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return bytes.byteLength;
}

/** Writes a manifest as formatted JSON, creating its directory. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const rounded = (_key: string, item: unknown): unknown =>
    typeof item === 'number' ? Math.round(item * 1000) / 1000 : item;
  const options = (await resolveConfig(path)) ?? {};
  await writeFile(
    path,
    await format(JSON.stringify(value, rounded), { ...options, filepath: path }),
  );
}
