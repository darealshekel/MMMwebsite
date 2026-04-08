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
    <Avatar className={cn("rounded-2xl border border-white/10 bg-black/20 shadow-[0_16px_40px_rgba(0,0,0,0.3)]", className)}>
      <AvatarImage src={skinFaceUrl} alt={`${username} avatar`} className="object-cover" />
      <AvatarFallback className={cn("bg-gradient-to-br from-primary/25 to-accent/25 text-sm font-bold text-foreground", fallbackClassName)}>
        {username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
