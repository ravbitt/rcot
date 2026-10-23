import "server-only";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import type { MeshBody, MeshData, Vec3 } from "@/lib/types";

export class ConvertError extends Error {}

export type ModelFormat = "step" | "iges" | "stl";

export function formatFromName(name: string): ModelFormat | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "step" || ext === "stp") return "step";
  if (ext === "iges" || ext === "igs") return "iges";
  if (ext === "stl") return "stl";
  return null;
}

type OcctMesh = {
  name: string;
  attributes: { position: { array: number[] } };
  index: { array: number[] };
};
type Occt = {
  ReadStepFile: (data: Uint8Array, params: object | null) => { success: boolean; meshes: OcctMesh[] };
  ReadIgesFile: (data: Uint8Array, params: object | null) => { success: boolean; meshes: OcctMesh[] };
};

let occtPromise: Promise<Occt> | null = null;
function loadOcct() {
  // OpenCascade compilado a wasm. Se carga una vez por proceso.
  occtPromise ??= (createRequire(import.meta.url)("occt-import-js") as () => Promise<Occt>)();
  return occtPromise;
}

const b64 = (a: Float32Array | Uint32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

/** Nombres de los sólidos en el orden del archivo STEP (SolidCraft los escribe en MANIFOLD_SOLID_BREP). */
function stepSolidNames(text: string) {
  return [...text.matchAll(/(?:MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS)\s*\(\s*'([^']*)'/g)].map((m) => decodeStepString(m[1]));
}

/** Decodifica los escapes de texto de STEP (\X2\00E1\X0\ → á, '' → '). */
function decodeStepString(s: string) {
  return s
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) =>
      String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))),
    )
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/''/g, "'");
}

function parseStl(buf: Buffer): { positions: Float32Array; indices: Uint32Array }[] {
  const isBinary = buf.length >= 84 && 84 + buf.readUInt32LE(80) * 50 === buf.length;
  const tris: number[] = [];
  if (isBinary) {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) tris.push(buf.readFloatLE(o + k * 4));
    }
  } else {
    const text = buf.toString("utf8");
    for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) tris.push(+m[1], +m[2], +m[3]);
  }
  if (!tris.length || tris.some((v) => !Number.isFinite(v))) throw new ConvertError("El archivo STL está vacío o dañado.");
  const positions = Float32Array.from(tris);
  const indices = new Uint32Array(positions.length / 3).map((_, i) => i);
  return [{ positions, indices }];
}

/** Convierte un modelo a la malla que usa el visor (JSON comprimido). */
export async function convertModel(data: Buffer, format: ModelFormat) {
  let parts: { name: string; positions: Float32Array; indices: Uint32Array }[];
  if (format === "stl") {
    parts = parseStl(data).map((p, i) => ({ name: `Pieza ${i + 1}`, ...p }));
  } else {
    const occt = await loadOcct();
    const params = {
      linearUnit: "millimeter",
      linearDeflectionType: "bounding_box_ratio",
      linearDeflection: 0.0005,
      angularDeflection: 0.08,
    };
    const res = format === "step" ? occt.ReadStepFile(new Uint8Array(data), params) : occt.ReadIgesFile(new Uint8Array(data), params);
    if (!res.success || !res.meshes.length) throw new ConvertError("No se pudo leer el archivo: ¿es un STEP/IGES válido?");
    const names = format === "step" ? stepSolidNames(data.toString("latin1")) : [];
    const useNames = names.length === res.meshes.length;
    parts = res.meshes.map((m, i) => ({
      name: (useNames ? names[i] : m.name) || `Pieza ${i + 1}`,
      positions: Float32Array.from(m.attributes.position.array),
      indices: Uint32Array.from(m.index.array),
    }));
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    for (let i = 0; i < p.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p.positions[i + k]);
        max[k] = Math.max(max[k], p.positions[i + k]);
      }
    }
  }
  const bodies: MeshBody[] = parts.map((p) => ({ name: p.name, positions: b64(p.positions), indices: b64(p.indices) }));
  const mesh: MeshData = { version: 1, units: "mm", bodies, bbox: [min, max] };
  return { gz: gzipSync(JSON.stringify(mesh)), bodyCount: bodies.length, bbox: mesh.bbox, names: bodies.map((b) => b.name) };
}
