"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type MotionTask = {
  id?: string;
  label?: string;
  actionId?: number;
  actionName?: string;
  status?: string;
  localModel?: string;
};

type AvatarRecord = {
  id: string;
  title: string;
  gender: string;
  direction: string;
  sourceImage: string;
  riggedModel?: string;
  basicAnimations?: Record<string, string>;
  animationTasks?: Record<string, MotionTask>;
};

type MotionOption = {
  id: string;
  label: string;
  localModel: string;
};

type Props = {
  avatars: AvatarRecord[];
};

function isDone(status?: string) {
  return ["succeeded", "success", "finished", "completed"].includes(String(status || "").toLowerCase());
}

function shouldLoopMotion(motionId?: string) {
  return new Set(["basic-walking", "slow-walk-loop", "elegant-walk-loop", "walk-backward", "spell-charge", "female-walk-loop", "walk-loop"]).has(String(motionId || ""));
}

function motionOptions(avatar?: AvatarRecord): MotionOption[] {
  if (!avatar) return [];
  const options: MotionOption[] = [];
  Object.entries(avatar.animationTasks || {}).forEach(([id, task]) => {
    if (task.localModel && isDone(task.status)) {
      options.push({ id, label: task.label || id, localModel: task.localModel });
    }
  });
  if (avatar.basicAnimations?.walking) {
    options.push({ id: "basic-walking", label: "Базовая походка", localModel: avatar.basicAnimations.walking });
  }
  const priority = [
    "slow-walk-loop",
    "elegant-walk-loop",
    "walk-turn-left",
    "walk-turn-right",
    "walk-backward",
    "walk-to-seat",
    "sit-at-table",
    "chair-sitting-idle",
    "male-sit-transition",
    "sit-transition",
    "sit-cross-legged",
    "stand-from-seat",
    "spell-charge",
    "female-walk-loop",
    "walk-loop",
    "basic-walking",
  ];
  return options.sort((left, right) => {
    const leftIndex = priority.indexOf(left.id);
    const rightIndex = priority.indexOf(right.id);
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  });
}

export function InitiateAnimationPreview({ avatars }: Props) {
  const [avatarId, setAvatarId] = useState(avatars[0]?.id || "");
  const selectedAvatar = useMemo(() => avatars.find((avatar) => avatar.id === avatarId) || avatars[0], [avatarId, avatars]);
  const options = useMemo(() => motionOptions(selectedAvatar), [selectedAvatar]);
  const [motionId, setMotionId] = useState(options[0]?.id || "");
  const selectedMotion = options.find((motion) => motion.id === motionId) || options[0];
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!options.length) {
      setMotionId("");
      return;
    }
    if (!options.some((option) => option.id === motionId)) setMotionId(options[0].id);
  }, [motionId, options]);

  useEffect(() => {
    const mount = mountRef.current;
    const modelUrl = selectedMotion?.localModel;
    if (!mount || !modelUrl) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020706);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.45, 4.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xf7efd0, 0x06110f, 1.45);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffdf9a, 2.1);
    key.position.set(2.8, 4.2, 3.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8c6cff, 1.4);
    rim.position.set(-3.5, 2.8, -2.5);
    scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 96),
      new THREE.MeshStandardMaterial({ color: 0x0b1511, roughness: 0.58, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.05;
    scene.add(floor);

    let frame = 0;
    let mixer: THREE.AnimationMixer | null = null;
    let model: THREE.Object3D | null = null;
    const clock = new THREE.Clock();
    const loader = new GLTFLoader();
    let disposed = false;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(320, rect.width);
      const height = Math.max(360, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        model = gltf.scene;
        model.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.frustumCulled = false;
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.position.sub(center);
        const height = Math.max(size.y, 0.001);
        const scale = 2.65 / height;
        model.scale.setScalar(scale);
        model.position.y = -1.0;
        scene.add(model);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          const shouldLoop = shouldLoopMotion(selectedMotion?.id);
          gltf.animations.forEach((clip) => {
            const action = mixer?.clipAction(clip);
            if (!action) return;
            action.clampWhenFinished = !shouldLoop;
            action.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
            action.reset().play();
          });
        }
      },
      undefined,
      (error) => {
        console.error("Failed to load initiate animation", modelUrl, error);
      }
    );

    const animate = () => {
      const delta = clock.getDelta();
      mixer?.update(delta);
      if (model && shouldLoopMotion(selectedMotion?.id)) model.rotation.y += delta * 0.16;
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      mixer?.stopAllAction();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [selectedMotion?.id, selectedMotion?.localModel]);

  return (
    <section className="animate-preview" aria-label="Просмотр анимации посвященного">
      <div className="animate-preview__stage" ref={mountRef} />
      <aside className="animate-preview__controls">
        <p className="dao-kicker">Предпросмотр</p>
        <h2>{selectedAvatar?.title || "Посвященный"}</h2>
        <select aria-label="Выбор посвященного" onChange={(event) => setAvatarId(event.target.value)} value={selectedAvatar?.id || ""}>
          {avatars.map((avatar) => (
            <option key={avatar.id} value={avatar.id}>{avatar.title}</option>
          ))}
        </select>
        <div className="animate-preview__motions">
          {options.map((motion) => (
            <button data-active={motion.id === selectedMotion?.id} key={motion.id} onClick={() => setMotionId(motion.id)} type="button">
              {motion.label}
            </button>
          ))}
        </div>
        <small>{selectedMotion?.localModel || "Нет готовой анимации"}</small>
      </aside>
    </section>
  );
}

