export type AvatarGroundPoint = {
  x: number;
  z: number;
};

export type AvatarGroundCollider =
  | {
      id: string;
      shape: "circle";
      centerX: number;
      centerZ: number;
      radius: number;
    }
  | {
      id: string;
      shape: "box";
      centerX: number;
      centerZ: number;
      halfWidth: number;
      halfDepth: number;
      rotationY: number;
    };

const squaredDistanceToBox = (point: AvatarGroundPoint, collider: Extract<AvatarGroundCollider, { shape: "box" }>) => {
  const offsetX = point.x - collider.centerX;
  const offsetZ = point.z - collider.centerZ;
  const cosine = Math.cos(collider.rotationY);
  const sine = Math.sin(collider.rotationY);
  const localX = offsetX * cosine + offsetZ * sine;
  const localZ = -offsetX * sine + offsetZ * cosine;
  const outsideX = Math.max(Math.abs(localX) - collider.halfWidth, 0);
  const outsideZ = Math.max(Math.abs(localZ) - collider.halfDepth, 0);
  return outsideX * outsideX + outsideZ * outsideZ;
};

export const avatarIntersectsCollider = (point: AvatarGroundPoint, avatarRadius: number, collider: AvatarGroundCollider) => {
  if (collider.shape === "circle") {
    const offsetX = point.x - collider.centerX;
    const offsetZ = point.z - collider.centerZ;
    const combinedRadius = avatarRadius + collider.radius;
    return offsetX * offsetX + offsetZ * offsetZ < combinedRadius * combinedRadius;
  }
  return squaredDistanceToBox(point, collider) < avatarRadius * avatarRadius;
};

export const avatarPositionIsBlocked = (point: AvatarGroundPoint, avatarRadius: number, colliders: AvatarGroundCollider[]) =>
  colliders.some((collider) => avatarIntersectsCollider(point, avatarRadius, collider));

export const resolveAvatarGroundMovement = (
  start: AvatarGroundPoint,
  desired: AvatarGroundPoint,
  avatarRadius: number,
  colliders: AvatarGroundCollider[]
): AvatarGroundPoint => {
  if (colliders.length === 0) return { ...desired };

  const deltaX = desired.x - start.x;
  const deltaZ = desired.z - start.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const stepLength = Math.max(avatarRadius * 0.42, 0.16);
  const steps = Math.max(1, Math.ceil(distance / stepLength));
  const stepX = deltaX / steps;
  const stepZ = deltaZ / steps;
  let current = { ...start };

  for (let index = 0; index < steps; index += 1) {
    const fullStep = { x: current.x + stepX, z: current.z + stepZ };
    if (!avatarPositionIsBlocked(fullStep, avatarRadius, colliders)) {
      current = fullStep;
      continue;
    }

    const xStep = { x: fullStep.x, z: current.z };
    const zStep = { x: current.x, z: fullStep.z };
    const xAllowed = !avatarPositionIsBlocked(xStep, avatarRadius, colliders);
    const zAllowed = !avatarPositionIsBlocked(zStep, avatarRadius, colliders);

    if (xAllowed && zAllowed) {
      current = Math.abs(stepX) >= Math.abs(stepZ) ? xStep : zStep;
    } else if (xAllowed) {
      current = xStep;
    } else if (zAllowed) {
      current = zStep;
    }
  }

  return current;
};

export const findAvatarExitPosition = (
  origin: AvatarGroundPoint,
  outwardDirection: AvatarGroundPoint,
  avatarRadius: number,
  colliders: AvatarGroundCollider[],
  preferredDistance = 3.2,
  maximumDistance = 8
): AvatarGroundPoint | null => {
  const directionLength = Math.hypot(outwardDirection.x, outwardDirection.z);
  if (directionLength < 0.0001) return null;
  const normalizedX = outwardDirection.x / directionLength;
  const normalizedZ = outwardDirection.z / directionLength;
  const angleOffsets = [0, Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6, Math.PI / 4, -Math.PI / 4];

  for (let distance = preferredDistance; distance <= maximumDistance + 0.001; distance += 0.4) {
    for (const angle of angleOffsets) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const directionX = normalizedX * cosine - normalizedZ * sine;
      const directionZ = normalizedX * sine + normalizedZ * cosine;
      const candidate = {
        x: origin.x + directionX * distance,
        z: origin.z + directionZ * distance,
      };
      if (!avatarPositionIsBlocked(candidate, avatarRadius, colliders)) return candidate;
    }
  }

  return null;
};
