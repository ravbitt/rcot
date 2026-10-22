import { describe, expect, it } from "vitest";
import { explodeBodies, explodeOffsets } from "./explode";
import type { Body } from "./mesh";

const cube = (name: string, x: number, y: number, z: number, s = 10): Body => ({
  name,
  positions: Float32Array.from([x, y, z, x + s, y + s, z + s]),
  indices: new Uint32Array(),
});

describe("explode", () => {
  const bodies = [cube("a", -100, 0, 0), cube("b", 90, 0, 0), cube("c", -5, 0, 0)];
  it("factor 0 no mueve nada", () => {
    expect(explodeOffsets(bodies, 0)).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    expect(explodeBodies(bodies, 0)).toBe(bodies);
  });
  it("aleja cada pieza del centro en proporción a su distancia", () => {
    // caja total x: -100..100 → centro 0; centros de las piezas: -95, 95, 0
    const off = explodeOffsets(bodies, 0.5);
    expect(off[0][0]).toBeCloseTo(-47.5);
    expect(off[1][0]).toBeCloseTo(47.5);
    expect(off[2][0]).toBeCloseTo(0);
  });
  it("las copias quedan desplazadas y el original intacto", () => {
    const e = explodeBodies(bodies, 1);
    expect(e[1].positions[0]).toBeCloseTo(185);
    expect(bodies[1].positions[0]).toBe(90);
  });
});
