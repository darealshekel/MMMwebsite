import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const DEFAULT_STEVE_SKIN_FACE_URL = "https://minotar.net/avatar/Steve/32";
const WHITESPACE_USERNAME = /\s/;

interface PlayerAvatarProps {
  username: string;
  skinFaceUrl: string;
  className?: string;
  fallbackClassName?: string;
}

function safeSkinFaceUrl(username: string, skinFaceUrl: string) {
  const cleanUsername = username.trim();
  if (!cleanUsername || WHITESPACE_USERNAME.test(cleanUsername)) {
    return DEFAULT_STEVE_SKIN_FACE_URL;
  }
  return skinFaceUrl?.trim() || `https://minotar.net/avatar/${encodeURIComponent(cleanUsername)}/32`;
}

export function PlayerAvatar({ username, skinFaceUrl, className, fallbackClassName }: PlayerAvatarProps) {
  const resolvedSrc = useMemo(() => safeSkinFaceUrl(username, skinFaceUrl), [skinFaceUrl, username]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedSrc]);

  const avatarSrc = imageFailed ? DEFAULT_STEVE_SKIN_FACE_URL : resolvedSrc;

  return (
    <Avatar className={cn("shrink-0 border border-border bg-secondary rounded-none", className)}>
      <AvatarImage
        src={avatarSrc}
        alt={`${username} avatar`}
        className="object-cover"
        onError={() => {
          if (avatarSrc !== DEFAULT_STEVE_SKIN_FACE_URL) {
            setImageFailed(true);
          }
        }}
      />
      <AvatarFallback className={cn("bg-primary/12 text-foreground", fallbackClassName)}>
        {username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
