import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  username: string;
  skinFaceUrl: string;
  className?: string;
  fallbackClassName?: string;
}

export function PlayerAvatar({ username, skinFaceUrl, className, fallbackClassName }: PlayerAvatarProps) {
  return (
    <Avatar className={cn("shrink-0 border border-border bg-secondary rounded-none", className)}>
      <AvatarImage src={skinFaceUrl} alt={`${username} avatar`} className="object-cover" />
      <AvatarFallback className={cn("bg-primary/12 text-foreground", fallbackClassName)}>
        {username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
