export type ArtifactBlendMode = "normal" | "screen" | "lighten" | "multiply";

export type HomeArtifactDefinition = {
  id: string;
  title: string;
  src: string;
};

export type HomeArtifactInstance = {
  id: string;
  artifactId: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
  rotation: number;
  blur: number;
  brightness: number;
  glow: number;
  zIndex: number;
  visible: boolean;
  blendMode: ArtifactBlendMode;
};

export const HOME_ARTIFACT_STORAGE_KEY = "dao-home-artifacts-v1";
export const HOME_ARTIFACT_EVENT = "dao-home-artifacts-change";

export const HOME_ARTIFACTS: HomeArtifactDefinition[] = [
  {
    id: "mirror",
    title: "Зеркало",
    src: "/images/artifacts/artifact-mirror-pedestal-v2.png"
  },
  {
    id: "bowl",
    title: "Чаша",
    src: "/images/artifacts/artifact-bowl-pedestal-v2.png"
  },
  {
    id: "scroll",
    title: "Свиток",
    src: "/images/artifacts/artifact-scroll-pedestal-v2.png"
  },
  {
    id: "key",
    title: "Ключ",
    src: "/images/artifacts/artifact-key-pedestal-v2.png"
  },
  {
    id: "gate",
    title: "Врата",
    src: "/images/artifacts/artifact-gate-pedestal-v2.png"
  },
  {
    id: "lantern",
    title: "Фонарь",
    src: "/images/artifacts/artifact-lantern-pedestal-v2.png"
  }
];

export const DEFAULT_HOME_ARTIFACT: Omit<HomeArtifactInstance, "id" | "artifactId"> = {
  x: 50,
  y: 64,
  width: 18,
  opacity: 0.72,
  rotation: 0,
  blur: 0,
  brightness: 1,
  glow: 0.18,
  zIndex: 3,
  visible: true,
  blendMode: "normal"
};

export function findHomeArtifact(artifactId: string) {
  return HOME_ARTIFACTS.find((artifact) => artifact.id === artifactId);
}

export function parseHomeArtifacts(value: string | null): HomeArtifactInstance[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Partial<HomeArtifactInstance> => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        ...DEFAULT_HOME_ARTIFACT,
        id: typeof item.id === "string" ? item.id : `artifact-${index}`,
        artifactId: typeof item.artifactId === "string" ? item.artifactId : HOME_ARTIFACTS[0].id,
        x: clampNumber(item.x, 0, 100, DEFAULT_HOME_ARTIFACT.x),
        y: clampNumber(item.y, 0, 100, DEFAULT_HOME_ARTIFACT.y),
        width: clampNumber(item.width, 6, 44, DEFAULT_HOME_ARTIFACT.width),
        opacity: clampNumber(item.opacity, 0, 1, DEFAULT_HOME_ARTIFACT.opacity),
        rotation: clampNumber(item.rotation, -30, 30, DEFAULT_HOME_ARTIFACT.rotation),
        blur: clampNumber(item.blur, 0, 8, DEFAULT_HOME_ARTIFACT.blur),
        brightness: clampNumber(item.brightness, 0.45, 1.6, DEFAULT_HOME_ARTIFACT.brightness),
        glow: clampNumber(item.glow, 0, 0.65, DEFAULT_HOME_ARTIFACT.glow),
        zIndex: Math.round(clampNumber(item.zIndex, 1, 20, DEFAULT_HOME_ARTIFACT.zIndex)),
        visible: item.visible !== false,
        blendMode: isBlendMode(item.blendMode) ? item.blendMode : DEFAULT_HOME_ARTIFACT.blendMode
      }))
      .filter((item) => Boolean(findHomeArtifact(item.artifactId)));
  } catch {
    return [];
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function isBlendMode(value: unknown): value is ArtifactBlendMode {
  return value === "normal" || value === "screen" || value === "lighten" || value === "multiply";
}
