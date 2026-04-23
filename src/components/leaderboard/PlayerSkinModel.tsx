import { useEffect, useRef } from "react";
import { IdleAnimation, SkinViewer } from "skinview3d";
import { PointLight } from "three";
import { cn } from "@/lib/utils";

interface PlayerSkinModelProps {
  username: string;
  className?: string;
  canvasClassName?: string;
  size?: number;
  tone?: "neutral" | "champion" | "silver" | "bronze";
}

export function PlayerSkinModel({
  username,
  className,
  canvasClassName,
  size = 180,
  tone = "neutral",
}: PlayerSkinModelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const backdropClass =
    tone === "champion"
      ? "bg-[radial-gradient(circle,rgba(237,201,110,0.34),rgba(237,201,110,0.12)_48%,transparent_74%)]"
      : tone === "silver"
        ? "bg-[radial-gradient(circle,rgba(232,238,248,0.24),rgba(232,238,248,0.08)_48%,transparent_74%)]"
        : tone === "bronze"
          ? "bg-[radial-gradient(circle,rgba(196,136,96,0.26),rgba(196,136,96,0.08)_48%,transparent_74%)]"
          : "bg-[radial-gradient(circle,rgba(255,255,255,0.12),rgba(255,255,255,0.03)_46%,transparent_72%)]";

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
      zoom: 0.7,
      fov: 35,
    });

    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 0.72;
    viewer.playerObject.rotation.y = -0.4;
    viewer.camera.position.x = 18;
    viewer.camera.position.y = 15;
    viewer.camera.position.z = 48;
    viewer.cameraLight.intensity = 2.9;
    viewer.globalLight.intensity = 1.7;
    const playerObject = viewer.playerObject as typeof viewer.playerObject & { nameTag?: unknown };
    playerObject.nameTag = undefined;

    const keyLight = new PointLight("#f2f2f2", 1.15, 140, 2);
    keyLight.position.set(28, 34, 34);
    const rimLight = new PointLight("#d6d6d6", 1.2, 160, 2);
    rimLight.position.set(-24, 22, -36);
    const haloLight = new PointLight("#ffffff", 0.75, 120, 2);
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
      <div className={cn("pointer-events-none absolute inset-x-8 top-[23%] h-24 rounded-full blur-2xl", backdropClass)} />
      <div className="pointer-events-none absolute inset-x-8 bottom-5 h-6 rounded-full bg-black/22 blur-xl" />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={cn("relative z-10 mx-auto block h-full w-full brightness-[1.08] contrast-[1.06] saturate-[1.01] drop-shadow-[0_10px_22px_rgba(0,0,0,0.14)]", canvasClassName)}
      />
    </div>
  );
}
