"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOM_WIDTH = 54;
const ROOM_DEPTH = 54;
const ROOM_HEIGHT = 18;
const CHAIR_COUNT = 12;

type ModelPlacement = {
  slug: string;
  url: string;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
};

const createChairPlacements = (): ModelPlacement[] => {
  const radius = 13.4;
  return Array.from({ length: CHAIR_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / CHAIR_COUNT;
    const angleDeg = THREE.MathUtils.radToDeg(angle);
    return {
      slug: `92-council-chair-v2-${String(index + 1).padStart(2, "0")}`,
      url: "/models/meshy/generated/92-council-chair-v2.glb",
      position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as const,
      rotation: [0, -angleDeg + 90, 0] as const,
      scale: [4.55, 4.55, 4.55] as const,
    };
  });
};

const CORE_MODELS: ModelPlacement[] = [
  {
    slug: "82-council-round-marble-gold-table",
    url: "/models/meshy/generated/82-council-round-marble-gold-table.glb",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [13.8, 6.2, 13.8],
  },
  ...createChairPlacements(),
  {
    slug: "106-inner-temple-doorway-portal",
    url: "/models/meshy/generated/106-inner-temple-doorway-portal.glb",
    position: [0, 0, -25.7],
    rotation: [0, 0, 0],
    scale: [10.5, 10.5, 10.5],
  },
  {
    slug: "84-white-gold-gothic-column-north-west",
    url: "/models/meshy/generated/84-white-gold-gothic-column.glb",
    position: [-22, 0, -22],
    rotation: [0, 0, 0],
    scale: [15, 12.2, 15],
  },
  {
    slug: "84-white-gold-gothic-column-north-east",
    url: "/models/meshy/generated/84-white-gold-gothic-column.glb",
    position: [22, 0, -22],
    rotation: [0, 0, 0],
    scale: [15, 12.2, 15],
  },
  {
    slug: "84-white-gold-gothic-column-south-west",
    url: "/models/meshy/generated/84-white-gold-gothic-column.glb",
    position: [-22, 0, 22],
    rotation: [0, 0, 0],
    scale: [15, 12.2, 15],
  },
  {
    slug: "84-white-gold-gothic-column-south-east",
    url: "/models/meshy/generated/84-white-gold-gothic-column.glb",
    position: [22, 0, 22],
    rotation: [0, 0, 0],
    scale: [15, 12.2, 15],
  },
];

const configureTexture = (texture: THREE.Texture, repeat = 1) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

const configureWallTexture = (texture: THREE.Texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

const cropTexture = (texture: THREE.Texture, col: 0 | 1, rowFromTop: 0 | 1) => {
  const clone = texture.clone();
  clone.colorSpace = THREE.SRGBColorSpace;
  clone.wrapS = THREE.ClampToEdgeWrapping;
  clone.wrapT = THREE.ClampToEdgeWrapping;
  clone.repeat.set(0.5, 0.5);
  clone.offset.set(col * 0.5, rowFromTop === 0 ? 0.5 : 0);
  clone.needsUpdate = true;
  return clone;
};

const normalizeLoadedModel = (object: THREE.Object3D) => {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z, 0.001);
  object.scale.multiplyScalar(1 / maxSize);
  object.updateMatrixWorld(true);
  const normalizedBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  normalizedBox.getCenter(center);
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= normalizedBox.min.y;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });
};

const makeFallbackModel = (slug: string) => {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: "#d7b56a", metalness: 0.55, roughness: 0.42 });
  if (slug.includes("table")) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 96), material);
    top.position.y = 0.42;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.42, 48), material);
    base.position.y = 0.21;
    group.add(top, base);
  } else if (slug.includes("chair")) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), material);
    seat.position.y = 0.32;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.08), material);
    back.position.set(0, 0.61, 0.18);
    group.add(seat, back);
  } else if (slug.includes("column")) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1, 32), material);
    shaft.position.y = 0.5;
    group.add(shaft);
  } else if (slug.includes("portal")) {
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), material);
    const right = left.clone();
    left.position.set(-0.28, 0.5, 0);
    right.position.set(0.28, 0.5, 0);
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 16, 64, Math.PI), material);
    top.position.y = 1;
    top.rotation.z = Math.PI;
    group.add(left, right, top);
  }
  return group;
};

const addWallPlane = (scene: THREE.Scene, material: THREE.Material, position: THREE.Vector3, rotation: THREE.Euler, width: number, height: number) => {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  wall.position.copy(position);
  wall.rotation.copy(rotation);
  wall.receiveShadow = true;
  scene.add(wall);
  return wall;
};

export function AssembledRoomScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Собираю комнату");
  const totalModels = useMemo(() => CORE_MODELS.length, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#050807");
    scene.fog = new THREE.Fog("#050807", 44, 96);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / Math.max(mount.clientHeight, 1), 0.1, 240);
    camera.position.set(20, 11.5, 34);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 5.2, 0);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 9;
    controls.maxDistance = 58;
    controls.update();

    scene.add(new THREE.HemisphereLight("#fff4d6", "#18332a", 1.4));
    const sun = new THREE.DirectionalLight("#ffe1a1", 3.45);
    sun.position.set(-14, 28, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const tableLight = new THREE.PointLight("#ffe4a4", 12, 34, 1.8);
    tableLight.position.set(0, 7, 0);
    scene.add(tableLight);
    const portalLight = new THREE.PointLight("#ffd06f", 18, 44, 1.65);
    portalLight.position.set(0, 8, -22);
    scene.add(portalLight);

    const textureLoader = new THREE.TextureLoader();
    const floorTexture = configureTexture(textureLoader.load("/images/inner-council/council-floor-generated.png"), 1);
    const ceilingTexture = configureTexture(textureLoader.load("/images/inner-council/council-ceiling-generated.png"), 1);
    const backMuralTexture = configureWallTexture(textureLoader.load("/images/inner-council/council-hall-white-gold-garden.png"));
    const sideMuralTexture = configureWallTexture(textureLoader.load("/images/inner-council/council-hall-black-gold-vista.png"));
    const frontMuralTexture = configureWallTexture(textureLoader.load("/images/inner-council/council-hall-golden-table-close.png"));
    const panelTexture = configureWallTexture(textureLoader.load("/images/optimization/temple-2d-replacement-panels-v2.png"));

    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, metalness: 0.22, roughness: 0.32 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexture, metalness: 0.16, roughness: 0.42, side: THREE.DoubleSide });
    const backWallMaterial = new THREE.MeshStandardMaterial({ map: backMuralTexture, metalness: 0.08, roughness: 0.55, side: THREE.DoubleSide });
    const sideWallMaterial = new THREE.MeshStandardMaterial({ map: sideMuralTexture, metalness: 0.08, roughness: 0.58, side: THREE.DoubleSide });
    const frontWallMaterial = new THREE.MeshStandardMaterial({ map: frontMuralTexture, metalness: 0.1, roughness: 0.52, side: THREE.DoubleSide });
    const waterPanelMaterial = new THREE.MeshStandardMaterial({ map: cropTexture(panelTexture, 0, 1), metalness: 0.08, roughness: 0.38, transparent: true, opacity: 0.72, side: THREE.DoubleSide });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH), ceilingMaterial);
    ceiling.position.y = ROOM_HEIGHT;
    ceiling.rotation.x = Math.PI / 2;
    scene.add(ceiling);

    addWallPlane(scene, backWallMaterial, new THREE.Vector3(0, ROOM_HEIGHT / 2, -ROOM_DEPTH / 2), new THREE.Euler(0, 0, 0), ROOM_WIDTH, ROOM_HEIGHT);
    addWallPlane(scene, frontWallMaterial, new THREE.Vector3(0, ROOM_HEIGHT / 2, ROOM_DEPTH / 2), new THREE.Euler(0, Math.PI, 0), ROOM_WIDTH, ROOM_HEIGHT);
    addWallPlane(scene, sideWallMaterial, new THREE.Vector3(-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0), new THREE.Euler(0, Math.PI / 2, 0), ROOM_DEPTH, ROOM_HEIGHT);
    addWallPlane(scene, sideWallMaterial.clone(), new THREE.Vector3(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0), ROOM_DEPTH, ROOM_HEIGHT);

    const goldLineMaterial = new THREE.MeshStandardMaterial({ color: "#d9b15e", metalness: 0.75, roughness: 0.28 });
    const blackMarbleMaterial = new THREE.MeshStandardMaterial({ color: "#17130f", metalness: 0.3, roughness: 0.44 });
    const makeTrim = (name: string, position: THREE.Vector3, scale: THREE.Vector3, material = goldLineMaterial) => {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      trim.name = name;
      trim.position.copy(position);
      trim.scale.copy(scale);
      trim.castShadow = true;
      trim.receiveShadow = true;
      scene.add(trim);
    };

    makeTrim("rear-floor-gold-trim", new THREE.Vector3(0, 0.08, -ROOM_DEPTH / 2 + 0.08), new THREE.Vector3(ROOM_WIDTH, 0.06, 0.08));
    makeTrim("front-floor-gold-trim", new THREE.Vector3(0, 0.08, ROOM_DEPTH / 2 - 0.08), new THREE.Vector3(ROOM_WIDTH, 0.06, 0.08));
    makeTrim("left-floor-gold-trim", new THREE.Vector3(-ROOM_WIDTH / 2 + 0.08, 0.08, 0), new THREE.Vector3(0.08, 0.06, ROOM_DEPTH));
    makeTrim("right-floor-gold-trim", new THREE.Vector3(ROOM_WIDTH / 2 - 0.08, 0.08, 0), new THREE.Vector3(0.08, 0.06, ROOM_DEPTH));
    makeTrim("rear-ceiling-gold-trim", new THREE.Vector3(0, ROOM_HEIGHT - 0.08, -ROOM_DEPTH / 2 + 0.08), new THREE.Vector3(ROOM_WIDTH, 0.06, 0.08));
    makeTrim("front-ceiling-gold-trim", new THREE.Vector3(0, ROOM_HEIGHT - 0.08, ROOM_DEPTH / 2 - 0.08), new THREE.Vector3(ROOM_WIDTH, 0.06, 0.08));

    const dais = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 16.2, 0.42, 160), blackMarbleMaterial);
    dais.position.y = 0.21;
    dais.receiveShadow = true;
    scene.add(dais);
    const daisRing = new THREE.Mesh(new THREE.TorusGeometry(15.65, 0.08, 12, 192), goldLineMaterial);
    daisRing.position.y = 0.48;
    daisRing.rotation.x = Math.PI / 2;
    scene.add(daisRing);

    const waterPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 5.2),
      new THREE.MeshPhysicalMaterial({
        color: "#8fd8c7",
        transparent: true,
        opacity: 0.34,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.18,
        side: THREE.DoubleSide,
      })
    );
    waterPlane.position.set(18.5, 0.52, 18.5);
    waterPlane.rotation.x = -Math.PI / 2;
    scene.add(waterPlane);
    const waterBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(10, 7.2), waterPanelMaterial);
    waterBackdrop.position.set(26.7, 6.2, 16);
    waterBackdrop.rotation.y = -Math.PI / 2;
    scene.add(waterBackdrop);

    const loader = new GLTFLoader();
    let loadedModels = 0;
    CORE_MODELS.forEach((model) => {
      loader.load(
        model.url,
        (gltf) => {
          const object = gltf.scene;
          normalizeLoadedModel(object);
          object.name = model.slug;
          object.position.set(model.position[0], model.position[1], model.position[2]);
          object.rotation.set(
            THREE.MathUtils.degToRad(model.rotation[0]),
            THREE.MathUtils.degToRad(model.rotation[1]),
            THREE.MathUtils.degToRad(model.rotation[2])
          );
          object.scale.set(model.scale[0], model.scale[1], model.scale[2]);
          scene.add(object);
          loadedModels += 1;
          setStatus(`Комната собрана: 2D зал + ${loadedModels}/${totalModels} 3D объектов`);
        },
        undefined,
        () => {
          const fallback = makeFallbackModel(model.slug);
          fallback.name = `${model.slug}-fallback`;
          fallback.position.set(model.position[0], model.position[1], model.position[2]);
          fallback.rotation.set(
            THREE.MathUtils.degToRad(model.rotation[0]),
            THREE.MathUtils.degToRad(model.rotation[1]),
            THREE.MathUtils.degToRad(model.rotation[2])
          );
          fallback.scale.set(model.scale[0], model.scale[1], model.scale[2]);
          scene.add(fallback);
          loadedModels += 1;
          setStatus(`Комната собрана: часть GLB заменена временной геометрией (${loadedModels}/${totalModels})`);
        }
      );
    });

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      waterPlane.position.y = 0.52 + Math.sin(elapsed * 1.4) * 0.025;
      const waterMaterial = waterPlane.material as THREE.MeshPhysicalMaterial;
      waterMaterial.opacity = 0.28 + Math.sin(elapsed * 1.8) * 0.04;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    };
  }, [totalModels]);

  return (
    <section className="assembled-room" aria-label="Готовая комната из 2D изображений и 3D моделей">
      <div className="assembled-room__viewport" ref={mountRef} />
      <header className="assembled-room__topbar">
        <div>
          <p className="dao-kicker">Отдельная вкладка</p>
          <h1>Собранная комната</h1>
        </div>
        <nav aria-label="Навигация собранной комнаты">
          <Link href="/initiates">Посвященные</Link>
          <Link href="/optimization">Оптимизация</Link>
          <Link href="/inner">Конструктор</Link>
          <Link href="/space">Пространство</Link>
        </nav>
      </header>
      <div className="assembled-room__status" aria-live="polite">{status}</div>
    </section>
  );
}


