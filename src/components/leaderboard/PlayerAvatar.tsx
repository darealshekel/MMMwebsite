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

export function PlayerAvatar({ username, skinFaceUrl, className, fallbackClassName }: PlayerAvatarProps) {
  const avatarSrc = WHITESPACE_USERNAME.test(username.trim()) ? DEFAULT_STEVE_SKIN_FACE_URL : skinFaceUrl;

  return (
    <Avatar className={cn("shrink-0 border border-border bg-secondary rounded-none", className)}>
      <AvatarImage src={avatarSrc} alt={`${username} avatar`} className="object-cover" />
      <AvatarFallback className={cn("bg-primary/12 text-foreground", fallbackClassName)}>
        {username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
