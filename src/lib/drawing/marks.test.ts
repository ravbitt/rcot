import { describe, expect, it } from "vitest";
import { placeMarks } from "./marks";

describe("placeMarks", () => {
  const bounds: [number, number, number, number] = [0, 0, 1000, 600];
  it("cada globo queda fuera de la vista, del lado de su pieza", () => {
    const [right, left] = placeMarks(
      [
        { mark: "A", color: "#000000", anchor: [900, 300] },
        { mark: "B", color: "#000000", anchor: [100, 300] },
      ],
      bounds,
      30,
      100,
    );
    expect(right[0]).toBeGreaterThan(1000);
    expect(left[0]).toBeLessThan(0);
  });
  it("los globos no se pisan", () => {
    const seeds = Array.from({ length: 8 }, (_, i) => ({ mark: String(i), color: "#000000", anchor: [900 + i, 300] as [number, number] }));
    const pos = placeMarks(seeds, bounds, 30, 100);
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++) expect(Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])).toBeGreaterThan(60);
  });
});
