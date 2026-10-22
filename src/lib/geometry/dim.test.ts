import { describe, expect, it } from "vitest";
import { angleAt, arcSweep, circle3, dim2d, dim3d, formatAngle, formatLength } from "./dim";

describe("dim3d", () => {
  it("alineada: mide la distancia real y pasa por el offset", () => {
    const g = dim3d([0, 0, 0], [300, 400, 0], [0, 0, 100], "aligned")!;
    expect(g.value).toBeCloseTo(500);
    expect(g.p1).toEqual([0, 0, 100]);
    expect(g.p2[2]).toBeCloseTo(100);
  });
  it("por eje: proyecta sobre el eje", () => {
    const g = dim3d([0, 0, 0], [300, 400, 50], [0, -100, 0], "x")!;
    expect(g.value).toBeCloseTo(300);
    expect(g.p1).toEqual([0, -100, 0]);
    expect(g.p2).toEqual([300, -100, 0]);
  });
  it("puntos iguales en alineada: sin geometría", () => {
    expect(dim3d([1, 1, 1], [1, 1, 1], [0, 0, 0], "aligned")).toBeNull();
  });
});

describe("dim2d", () => {
  it("horizontal con puntos a distinta altura", () => {
    const g = dim2d([0, 0], [600, 195], "h", -40)!;
    expect(g.value).toBe(600);
    expect(g.p1).toEqual([0, -40]);
    expect(g.p2).toEqual([600, -40]);
  });
  it("vertical", () => {
    const g = dim2d([10, 0], [0, 730], "v", 30)!;
    expect(g.value).toBe(730);
    expect(g.p1[0]).toBeCloseTo(-20);
  });
});

describe("formatLength", () => {
  it("cm con coma y sin ceros sobrantes", () => {
    expect(formatLength(750, "cm", 1)).toBe("75");
    expect(formatLength(25, "cm", 1)).toBe("2,5");
    expect(formatLength(481, "cm", 1)).toBe("48,1");
    expect(formatLength(640, "mm", 0)).toBe("640");
  });
});


describe("arcos", () => {
  it("circunferencia por tres puntos", () => {
    const r = 1280;
    const p = (deg: number): [number, number] => [r * Math.cos((deg * Math.PI) / 180), 300 + r * Math.sin((deg * Math.PI) / 180)];
    const c = circle3(p(67.5), p(90), p(112.5))!;
    expect(c.r).toBeCloseTo(1280, 6);
    expect(c.center[1]).toBeCloseTo(300, 6);
    expect(circle3([0, 0], [1, 1], [2, 2])).toBeNull();
  });
  it("barrido con sentido según el punto intermedio", () => {
    expect(arcSweep([0, 0], [1, 0], [0, 1], [-1, 0])).toBeCloseTo(Math.PI);
    expect(arcSweep([0, 0], [1, 0], [0, -1], [-1, 0])).toBeCloseTo(-Math.PI);
    expect(Math.abs(arcSweep([0, 0], [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1]))).toBeCloseTo(Math.PI / 2);
  });
  it("ángulo entre semirrectas", () => {
    expect(formatAngle(angleAt([0, 0], [10, 0], [5, 5]))).toBe("45°");
    expect(formatAngle(angleAt([0, 0], [10, 0], [-10, 0.0001]))).toBe("180°");
    expect(formatAngle((22.5 * Math.PI) / 180)).toBe("22,5°");
  });
});
