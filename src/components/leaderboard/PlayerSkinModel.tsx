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
    viewer.autoRotateSpeed = 0.8;
    viewer.playerObject.rotation.y = -0.4;
    viewer.camera.position.x = 18;
    viewer.camera.position.y = 18;
    viewer.camera.position.z = 42;
    viewer.cameraLight.intensity = 0.85;
    viewer.globalLight.intensity = 0.65;
    viewer.playerObject.nameTag = null;
    viewer.render();

    return () => {
      viewer.dispose();
    };
  }, [size, username]);

  return (
    <div className={cn("relative overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.1),transparent_52%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.96))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]", className)}>
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={cn("mx-auto block h-full w-full", canvasClassName)}
      />
    </div>
  );
}
