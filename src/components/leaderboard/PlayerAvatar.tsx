import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { DEFAULT_STEVE_SKIN_FACE_URL, buildNmsrFaceUrl } from "../../../shared/player-avatar";

interface PlayerAvatarProps {
  username: string;
  skinFaceUrl?: string;
  className?: string;
  fallbackClassName?: string;
}

export function PlayerAvatar({ username, skinFaceUrl, className, fallbackClassName }: PlayerAvatarProps) {
  const resolvedSrc = useMemo(() => buildNmsrFaceUrl(username), [username]);
  const [fallbackStep, setFallbackStep] = useState(0);

  useEffect(() => {
    setFallbackStep(0);
  }, [resolvedSrc]);

  const avatarSrc = fallbackStep === 0 ? resolvedSrc : DEFAULT_STEVE_SKIN_FACE_URL;

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
