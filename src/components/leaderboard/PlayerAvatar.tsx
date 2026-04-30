import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const DEFAULT_STEVE_SKIN_FACE_URL = "https://minotar.net/avatar/Steve/32";
const SECONDARY_STEVE_SKIN_FACE_URL = "https://mc-heads.net/avatar/Steve/32";
const VALID_MINECRAFT_USERNAME = /^[A-Za-z0-9_]{3,16}$/;

interface PlayerAvatarProps {
  username: string;
  skinFaceUrl: string;
  className?: string;
  fallbackClassName?: string;
}

function cleanAvatarUsername(username: string) {
  return username.trim().replace(/\s+/g, " ");
}

function safeSkinFaceUrl(username: string, skinFaceUrl: string) {
  const cleanUsername = cleanAvatarUsername(username);
  if (!VALID_MINECRAFT_USERNAME.test(cleanUsername)) {
    return DEFAULT_STEVE_SKIN_FACE_URL;
  }
  return skinFaceUrl?.trim() || `https://minotar.net/avatar/${encodeURIComponent(cleanUsername)}/32`;
}

export function PlayerAvatar({ username, skinFaceUrl, className, fallbackClassName }: PlayerAvatarProps) {
  const resolvedSrc = useMemo(() => safeSkinFaceUrl(username, skinFaceUrl), [skinFaceUrl, username]);
  const [fallbackStep, setFallbackStep] = useState(0);

  useEffect(() => {
    setFallbackStep(0);
  }, [resolvedSrc]);

  const avatarSrc = fallbackStep === 0
    ? resolvedSrc
    : fallbackStep === 1
      ? DEFAULT_STEVE_SKIN_FACE_URL
      : SECONDARY_STEVE_SKIN_FACE_URL;

  return (
    <Avatar className={cn("shrink-0 border border-border bg-secondary rounded-none", className)}>
      <AvatarImage
        src={avatarSrc}
        alt={`${username} avatar`}
        className="object-cover"
        onError={() => {
          setFallbackStep((step) => Math.min(step + 1, 2));
        }}
      />
      <AvatarFallback className={cn("bg-primary/12 text-foreground", fallbackClassName)}>
        ST
      </AvatarFallback>
    </Avatar>
  );
}
