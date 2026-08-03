import { describe, expect, it } from "vitest";
import {
  avatarPositionIsBlocked,
  findAvatarExitPosition,
  resolveAvatarGroundMovement,
  type AvatarGroundCollider,
} from "./avatarCollision";

describe("avatar ground collisions", () => {
  const box: AvatarGroundCollider = {
    id: "chair",
    shape: "box",
    centerX: 2,
    centerZ: 0,
    halfWidth: 0.8,
    halfDepth: 1.2,
    rotationY: 0,
  };

  it("stops an avatar before a solid object", () => {
    const result = resolveAvatarGroundMovement({ x: 0, z: 0 }, { x: 3, z: 0 }, 0.6, [box]);
    expect(result.x).toBeLessThan(0.7);
    expect(result.z).toBe(0);
  });

  it("slides along an obstacle when the other axis remains free", () => {
    const result = resolveAvatarGroundMovement({ x: 0, z: -1.6 }, { x: 2, z: -0.6 }, 0.5, [box]);
    expect(result.x).toBeLessThan(0.8);
    expect(result.z).toBeGreaterThan(-1.6);
  });

  it("respects a round council table without square corner blocking", () => {
    const table: AvatarGroundCollider = {
      id: "table",
      shape: "circle",
      centerX: 0,
      centerZ: 0,
      radius: 3,
    };
    expect(avatarPositionIsBlocked({ x: 3.2, z: 3.2 }, 0.6, [table])).toBe(false);
    expect(avatarPositionIsBlocked({ x: 3.2, z: 0 }, 0.6, [table])).toBe(true);
  });

  it("finds a clear position behind a chair when leaving the table", () => {
    const exit = findAvatarExitPosition({ x: 2, z: 0 }, { x: 1, z: 0 }, 0.6, [box]);
    expect(exit).not.toBeNull();
    expect(exit?.x).toBeGreaterThan(5);
    expect(avatarPositionIsBlocked(exit!, 0.6, [box])).toBe(false);
  });
});
