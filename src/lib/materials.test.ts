import { describe, expect, it } from "vitest";
import type { Body } from "@/lib/geometry/mesh";
import { groupPieces } from "@/lib/geometry/pieces";
import { assignGroup, materialTotals, suggestMaterial } from "./materials";
import type { Material } from "./types";

const CATALOG: Material[] = [
  { id: "pino", name: "Pino", color: "#d9a35f", kind: "liston", thickness: null },
  { id: "mdf15", name: "MDF 15", color: "#8fa8c8", kind: "tablero", thickness: 15 },
  { id: "mdf25", name: "MDF 25", color: "#5d7fa8", kind: "tablero", thickness: 25 },
  { id: "carton", name: "Cartón piedra 3", color: "#a9a9a3", kind: "lamina", thickness: 3 },
];

function box(name: string, [lx, ly, lz]: [number, number, number], x = 0): Body {
  const pts: number[] = [];
  for (const [i, j, k] of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]) pts.push(x + i * lx, j * ly, k * lz);
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { name, positions: Float32Array.from(pts), indices: Uint32Array.from(idx) };
}

/** Arco plano (anillo de 90°) de radio interior r, ancho w y espesor t: una pieza curva. */
function arc(name: string, r: number, w: number, t: number, n = 24): Body {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((Math.PI / 2) * i) / n;
    for (const rr of [r, r + w]) for (const z of [0, t]) pts.push(rr * Math.cos(a), rr * Math.sin(a), z);
  }
  const idx: number[] = [];
  const v = (i: number, o: number, top: number) => i * 4 + o * 2 + top;
  for (let i = 0; i < n; i++) {
    const q = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
    q(v(i, 0, 0), v(i + 1, 0, 0), v(i + 1, 1, 0), v(i, 1, 0));
    q(v(i, 0, 1), v(i, 1, 1), v(i + 1, 1, 1), v(i + 1, 0, 1));
    q(v(i, 0, 0), v(i, 0, 1), v(i + 1, 0, 1), v(i + 1, 0, 0));
    q(v(i, 1, 0), v(i + 1, 1, 0), v(i + 1, 1, 1), v(i, 1, 1));
  }
  return { name, positions: Float32Array.from(pts), indices: Uint32Array.from(idx) };
}

describe("groupPieces con materiales", () => {
  it("marca curvas las piezas con arcos y rectas las tablas", () => {
    const { groups } = groupPieces([box("Lateral", [600, 400, 15]), arc("Inf_Frente", 500, 80, 25)]);
    expect(groups.find((g) => g.names[0] === "Lateral")!.curved).toBe(false);
    expect(groups.find((g) => g.names[0] === "Inf_Frente")!.curved).toBe(true);
  });
  it("separa piezas iguales de distinto material", () => {
    const bodies = [box("Tapa_1", [600, 400, 15]), box("Tapa_2", [600, 400, 15], 1000)];
    expect(groupPieces(bodies).groups).toHaveLength(1);
    const { groups } = groupPieces(bodies, { Tapa_1: "mdf15", Tapa_2: "pino" });
    expect(groups.map((g) => g.materialId).sort()).toEqual(["mdf15", "pino"]);
  });
});

describe("suggestMaterial", () => {
  it("por nombre, por espesor y si no, listón", () => {
    expect(suggestMaterial({ names: ["Carton_Frente"], dims: [900, 400, 120], curved: true }, CATALOG)).toBe("carton");
    expect(suggestMaterial({ names: ["Costilla_1"], dims: [800, 100, 15], curved: true }, CATALOG)).toBe("mdf15");
    expect(suggestMaterial({ names: ["Inf_Frente"], dims: [900, 80, 25.2], curved: true }, CATALOG)).toBe("mdf25");
    expect(suggestMaterial({ names: ["Asiento"], dims: [900, 600, 15], curved: false }, CATALOG)).toBe("mdf15");
    // tabla recta y angosta de 25 mm: madera, aunque haya un MDF 25
    expect(suggestMaterial({ names: ["BandaAlta_Lat_I"], dims: [490, 50, 25], curved: false }, CATALOG)).toBe("pino");
    expect(suggestMaterial({ names: ["Pata_FI"], dims: [100, 50, 50], curved: false }, CATALOG)).toBe("pino");
  });
});

describe("materialTotals", () => {
  it("m² para tableros, metros para listones", () => {
    const bodies = [box("Tapa_1", [1000, 500, 15]), box("Tapa_2", [1000, 500, 15], 2000), box("Pata", [700, 50, 50], 4000)];
    let map = assignGroup({}, ["Tapa_1", "Tapa_2"], "mdf15");
    map = assignGroup(map, ["Pata"], "pino");
    const t = materialTotals(groupPieces(bodies, map).groups, CATALOG);
    expect(t.map((x) => [x.material?.id, x.qty, +x.amount.toFixed(3), x.unit])).toEqual([
      ["pino", 1, 0.7, "m"],
      ["mdf15", 2, 1, "m²"],
    ]);
  });
});
