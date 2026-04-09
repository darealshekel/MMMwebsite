import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { PointLight } from "three";
import { cn } from "@/lib/utils";

interface PlayerSkinModelProps {
  username: string;
  className?: string;
  canvasClassName?: string;
  size?: number;
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
    (viewer.playerObject as any).nameTag = null;

    const keyLight = new PointLight("#dfe6ff", 1.6, 140, 2);
    keyLight.position.set(28, 34, 34);
    const rimLight = new PointLight("#5a6a9a", 2.8, 160, 2);
    rimLight.position.set(-24, 22, -36);
    const haloLight = new PointLight("#ffffff", 1.2, 120, 2);
    haloLight.position.set(0, 14, -28);
    viewer.scene.add(keyLight, rimLight, haloLight);

    viewer.render();

    return () => {
      viewer.scene.remove(keyLight, rimLight, haloLight);
      viewer.dispose();
    };
  }, [size, username]);

  return (
    <div className={cn("relative overflow-visible p-0", className)}>
      <div className="pointer-events-none absolute left-1/2 top-[46%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/24 blur-[74px]" />
      <div className="pointer-events-none absolute left-1/2 top-[36%] h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/45 blur-[92px]" />
      <div className="pointer-events-none absolute left-1/2 top-[24%] h-28 w-40 -translate-x-1/2 rounded-full bg-accent/35 blur-[46px]" />
      <div className="pointer-events-none absolute left-1/2 top-[50%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute inset-x-12 top-[32%] h-10 rounded-full bg-white/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-10 bottom-4 h-8 rounded-full bg-black/30 blur-2xl" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={cn("relative z-10 mx-auto block h-full w-full brightness-[1.28] contrast-[1.14] saturate-[1.08] drop-shadow-[0_0_22px_rgba(90,106,154,0.32)]", canvasClassName)}
      />
    </div>
  );
}
