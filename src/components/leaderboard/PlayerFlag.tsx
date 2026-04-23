import { cn } from "@/lib/utils";

interface PlayerFlagProps {
  username: string;
  flagUrl?: string | null;
  className?: string;
}

export function PlayerFlag({ username, flagUrl, className }: PlayerFlagProps) {
  if (!flagUrl) {
    return null;
  }

  return (
    <div className={cn("h-10 w-[3.75rem] shrink-0 overflow-hidden", className)}>
      <img
        src={flagUrl}
        alt={`${username} flag`}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
