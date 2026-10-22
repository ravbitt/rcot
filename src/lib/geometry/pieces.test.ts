import { describe, expect, it } from "vitest";
import type { Body } from "./mesh";
import { baseName, bodyMeasure, groupPieces, markFor } from "./pieces";

/** Caja de lx × ly × lz con esquina en (x, y, z), girada `deg` grados alrededor de X. */
function box(name: string, [lx, ly, lz]: [number, number, number], [x, y, z] = [0, 0, 0], deg = 0): Body {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  const pts: number[] = [];
  for (const [i, j, k] of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]) {
    const py = j * ly, pz = k * lz;
    pts.push(x + i * lx, y + py * c - pz * s, z + py * s + pz * c);
  }
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { name, positions: Float32Array.from(pts), indices: Uint32Array.from(idx) };
}

/** Prisma triangular (escuadra) de catetos a × a y espesor t. */
function wedge(name: string, a: number, t: number): Body {
  const pts = [0, 0, 0, a, 0, 0, 0, a, 0, 0, 0, t, a, 0, t, 0, a, t];
  const idx = [0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5];
  return { name, positions: Float32Array.from(pts), indices: Uint32Array.from(idx) };
}

describe("bodyMeasure", () => {
  it("tabla alineada", () => {
    expect(bodyMeasure(box("t", [25, 600, 100])).dims.map(Math.round)).toEqual([600, 100, 25]);
  });
  it("tabla inclinada mide su largo real, no la caja del mundo", () => {
    const d = bodyMeasure(box("t", [25, 571, 50], [0, 0, 0], 8.1)).dims;
    expect(d[0]).toBeCloseTo(571, 1);
    expect(d[1]).toBeCloseTo(50, 1);
    expect(d[2]).toBeCloseTo(25, 1);
  });
});

describe("groupPieces", () => {
  it("agrupa piezas iguales y separa formas distintas con la misma caja", () => {
    const bodies = [
      box("Pata_FI", [100, 100, 50]),
      box("Pata_FD", [100, 100, 50], [500, 0, 0]),
      box("Taco_A", [100, 100, 25]),
      wedge("Escuadra_A_F", 100, 25),
      wedge("Escuadra_B_F", 100, 25),
      box("Remate", [640, 100, 25]),
    ];
    const { groups, bodyGroup } = groupPieces(bodies);
    expect(groups.map((g) => [g.mark, g.name, g.qty])).toEqual([
      ["A", "Remate", 1],
      ["B", "Pata", 2],
      ["C", "Taco", 1],
      ["D", "Escuadra", 2],
    ]);
    expect(bodyGroup).toEqual([1, 1, 2, 3, 3, 0]);
  });
});

describe("nombres y marcas", () => {
  it("nombre base", () => {
    expect(baseName("BandaAlta_Lat_I")).toBe("BandaAlta Lat");
    expect(baseName("Liston_Inclinado_1")).toBe("Liston Inclinado");
    expect(baseName("Cuna_Atras_D")).toBe("Cuna Atras");
  });
  it("marcas", () => {
    expect([0, 25, 26, 27].map(markFor)).toEqual(["A", "Z", "AA", "AB"]);
  });
});
