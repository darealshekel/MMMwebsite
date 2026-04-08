import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
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
    viewer.cameraLight.intensity = 1.35;
    viewer.globalLight.intensity = 1.05;
    viewer.playerObject.nameTag = null;
    viewer.render();

    return () => {
      viewer.dispose();
    };
  }, [size, username]);

  return (
    <div className={cn("relative overflow-visible p-0", className)}>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-[22%] h-20 w-20 -translate-x-1/2 rounded-full bg-primary/30 blur-[55px]" />
      <div className="pointer-events-none absolute left-1/2 top-[18%] h-10 w-24 -translate-x-1/2 rounded-full bg-white/35 blur-2xl" />
      <div className="pointer-events-none absolute inset-x-10 bottom-4 h-8 rounded-full bg-black/35 blur-2xl" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={cn("relative z-10 mx-auto block h-full w-full brightness-[1.18] saturate-[1.08]", canvasClassName)}
      />
    </div>
  );
}
