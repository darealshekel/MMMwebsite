import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STEVE_SKIN_BUST_URL,
  DEFAULT_STEVE_SKIN_FACE_URL,
  buildNmsrBustUrl,
  buildNmsrFaceUrl,
} from "../../../shared/player-avatar";

interface PlayerAvatarProps {
  username: string;
  uuid?: string | null;
  skinFaceUrl?: string;
  className?: string;
  fallbackClassName?: string;
  render?: "face" | "bust";
}

export function PlayerAvatar({ username, uuid, skinFaceUrl, className, fallbackClassName, render = "face" }: PlayerAvatarProps) {
  const resolvedSrc = useMemo(
    () => render === "bust" ? buildNmsrBustUrl(username, uuid) : buildNmsrFaceUrl(username),
    [render, username, uuid],
  );
  const [fallbackStep, setFallbackStep] = useState(0);

  useEffect(() => {
    setFallbackStep(0);
  }, [resolvedSrc]);

  const fallbackSrc = render === "bust" ? DEFAULT_STEVE_SKIN_BUST_URL : DEFAULT_STEVE_SKIN_FACE_URL;
  const avatarSrc = fallbackStep === 0 ? resolvedSrc : fallbackSrc;

  return (
    <Avatar className={cn("shrink-0 border border-border bg-secondary rounded-none", className)}>
      <AvatarImage
        src={avatarSrc}
        alt={`${username} avatar`}
        className="object-cover"
        onError={() => {
          setFallbackStep((step) => Math.min(step + 1, 1));
        }}
      />
      <AvatarFallback className={cn("bg-primary/12 text-foreground", fallbackClassName)}>
        ST
      </AvatarFallback>
    </Avatar>
  );
}
