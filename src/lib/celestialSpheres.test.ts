import { describe, expect, it } from "vitest";

import { getDiametricLuminaryPositions } from "@/lib/celestialSpheres";

describe("getDiametricLuminaryPositions", () => {
  it("keeps both luminaries on the same fixed-radius orbit", () => {
    const radius = 96;
    const centerY = -14;
    const positions = getDiametricLuminaryPositions(1.17, radius, centerY, Math.PI / 8);

    expect(positions.sun.clone().setY(positions.sun.y - centerY).length()).toBeCloseTo(radius, 8);
    expect(positions.moon.clone().setY(positions.moon.y - centerY).length()).toBeCloseTo(radius, 8);
  });

  it("places the Moon exactly opposite the Sun", () => {
    const centerY = 31;
    const positions = getDiametricLuminaryPositions(2.43, 72, centerY, Math.PI / 10);
    const sunOffset = positions.sun.clone().setY(positions.sun.y - centerY);
    const moonOffset = positions.moon.clone().setY(positions.moon.y - centerY);

    expect(moonOffset.x).toBeCloseTo(-sunOffset.x, 8);
    expect(moonOffset.y).toBeCloseTo(-sunOffset.y, 8);
    expect(moonOffset.z).toBeCloseTo(-sunOffset.z, 8);
  });

  it("keeps both luminaries at one height on the horizontal Vedic orbit", () => {
    const positions = getDiametricLuminaryPositions(0.73, 88, 42, 0);

    expect(positions.sun.y).toBeCloseTo(42, 8);
    expect(positions.moon.y).toBeCloseTo(42, 8);
  });
});
