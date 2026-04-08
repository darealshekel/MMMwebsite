import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from "three";
import { cn } from "@/lib/utils";

interface PlayerSkinModelProps {
  username: string;
  className?: string;
  canvasClassName?: string;
  size?: number;
}

function createPickaxePart(
  width: number,
  height: number,
  depth: number,
  material: MeshStandardMaterial,
  position: [number, number, number],
) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function createNetheritePickaxe() {
  const handleMaterial = new MeshStandardMaterial({
    color: "#6b4f2b",
    roughness: 0.72,
    metalness: 0.08,
  });

  const headMaterial = new MeshStandardMaterial({
    color: "#4e5667",
    roughness: 0.28,
    metalness: 0.88,
    emissive: "#9ee7ff",
    emissiveIntensity: 0.1,
  });

  const edgeMaterial = new MeshStandardMaterial({
    color: "#c3f5ff",
    roughness: 0.2,
    metalness: 0.95,
    emissive: "#7be1ff",
    emissiveIntensity: 0.2,
  });

  const pickaxe = new Group();
  pickaxe.add(createPickaxePart(1.1, 10.8, 1.1, handleMaterial, [0, -1.2, 0]));
  pickaxe.add(createPickaxePart(7.4, 1.5, 1.2, headMaterial, [0.7, 3.9, 0]));
  pickaxe.add(createPickaxePart(2.8, 1.4, 1.2, headMaterial, [-3.5, 2.8, 0]));
  pickaxe.add(createPickaxePart(1.7, 2.2, 1.2, headMaterial, [3.8, 3.1, 0]));
  pickaxe.add(createPickaxePart(2.2, 0.65, 0.45, edgeMaterial, [3.95, 4.55, 0]));
  pickaxe.add(createPickaxePart(2.5, 0.55, 0.38, edgeMaterial, [-3.8, 3.55, 0]));

  pickaxe.position.set(-0.5, -7.8, 1.8);
  pickaxe.rotation.set(-0.35, 0.05, -0.95);
  pickaxe.scale.setScalar(0.55);

  return {
    pickaxe,
    materials: [handleMaterial, headMaterial, edgeMaterial],
  };
}

function disposePickaxe(group: Group, materials: MeshStandardMaterial[]) {
  group.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
    }
  });
  materials.forEach((material) => material.dispose());
}

export function PlayerSkinModel({
  username,
  className,
  canvasClassName,
  size = 180,
}: PlayerSkinModelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const viewer = new SkinViewer({
      canvas,
      width: size,
      height: size,
      skin: `https://minotar.net/skin/${encodeURIComponent(username)}`,
      animation: new IdleAnimation(),
      enableControls: false,
      background: null,
      zoom: 0.82,
      fov: 35,
    });

    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.9;
    viewer.playerObject.rotation.y = -0.4;
    viewer.camera.position.x = 18;
    viewer.camera.position.y = 18;
    viewer.camera.position.z = 42;
    viewer.cameraLight.intensity = 2.9;
    viewer.globalLight.intensity = 1.95;
    viewer.playerObject.nameTag = null;

    const keyLight = new PointLight("#dff8ff", 1.6, 140, 2);
    keyLight.position.set(28, 34, 34);
    const rimLight = new PointLight("#74d9ff", 2.8, 160, 2);
    rimLight.position.set(-24, 22, -36);
    const haloLight = new PointLight("#ffffff", 1.2, 120, 2);
    haloLight.position.set(0, 14, -28);
    viewer.scene.add(keyLight, rimLight, haloLight);

    const { pickaxe, materials } = createNetheritePickaxe();
    viewer.playerObject.skin.rightArm.innerLayer.add(pickaxe);

    viewer.render();

    return () => {
      viewer.playerObject.skin.rightArm.innerLayer.remove(pickaxe);
      viewer.scene.remove(keyLight, rimLight, haloLight);
      disposePickaxe(pickaxe, materials);
      viewer.dispose();
    };
  }, [size, username]);

  return (
    <div className={cn("relative overflow-visible p-0", className)}>
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/24 blur-[74px]" />
      <div className="pointer-events-none absolute left-1/2 top-[36%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/45 blur-[92px]" />
      <div className="pointer-events-none absolute left-1/2 top-[24%] h-28 w-40 -translate-x-1/2 rounded-full bg-cyan-200/35 blur-[46px]" />
      <div className="pointer-events-none absolute left-1/2 top-[50%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute inset-x-12 top-[32%] h-10 rounded-full bg-white/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-10 bottom-4 h-8 rounded-full bg-black/30 blur-2xl" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={cn("relative z-10 mx-auto block h-full w-full brightness-[1.28] contrast-[1.14] saturate-[1.14] drop-shadow-[0_0_22px_rgba(168,239,255,0.28)]", canvasClassName)}
      />
    </div>
  );
}
