import { describe, expect, it } from "vitest";
import { cleanSegments } from "./segments";

describe("cleanSegments", () => {
  it("una oculta idéntica a una visible desaparece, sin importar el orden", () => {
    const r = cleanSegments([[0, 0, 100, 0]], [[100, 0, 0, 0]]);
    expect(r.visible).toEqual([[0, 0, 100, 0]]);
    expect(r.hidden).toEqual([]);
  });
  it("una oculta más larga conserva solo la parte que no tapa la visible", () => {
    const r = cleanSegments([[20, 5, 60, 5]], [[0, 5, 100, 5]]);
    expect(r.hidden).toEqual([
      [0, 5, 20, 5],
      [60, 5, 100, 5],
    ]);
  });
  it("una oculta paralela pero desplazada se mantiene", () => {
    const r = cleanSegments([[0, 0, 100, 0]], [[0, 25, 100, 25]]);
    expect(r.hidden).toEqual([[0, 25, 100, 25]]);
  });
  it("verticales e inclinadas", () => {
    const r = cleanSegments([[10, 0, 10, 50], [0, 0, 30, 40]], [[10, -20, 10, 80], [0, 0, 60, 80]]);
    expect(r.hidden).toEqual([
      [10, -20, 10, 0],
      [10, 50, 10, 80],
      [30, 40, 60, 80],
    ]);
  });
  it("sin repetidos", () => {
    const r = cleanSegments([[0, 0, 1, 1], [1, 1, 0, 0]], []);
    expect(r.visible.length).toBe(1);
  });
});
