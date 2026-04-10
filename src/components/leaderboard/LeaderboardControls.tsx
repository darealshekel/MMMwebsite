import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeaderboardControlsProps {
  query: string;
  minBlocks: string;
  resultCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onMinBlocksChange: (value: string) => void;
  onClear: () => void;
}

export function LeaderboardControls({
  query,
  minBlocks,
  resultCount,
  totalCount,
  onQueryChange,
  onMinBlocksChange,
  onClear,
}: LeaderboardControlsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] border border-white/8 bg-black/10 p-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
      <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search player"
            className="h-11 rounded-2xl border-white/10 bg-card/70 pl-11 text-sm"
          />
        </div>

        <Select value={minBlocks} onValueChange={onMinBlocksChange}>
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-card/70 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <SelectValue placeholder="Minimum blocks" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Minimum blocks</SelectItem>
            <SelectItem value="1000000">1M+</SelectItem>
            <SelectItem value="10000000">10M+</SelectItem>
            <SelectItem value="20000000">20M+</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={onClear} className="h-11 rounded-2xl border-white/10 bg-card/60 text-sm">
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="text-sm text-muted-foreground md:pl-4">
        <span className="font-semibold text-foreground">{resultCount.toLocaleString()}</span>
        {resultCount !== totalCount ? ` of ${totalCount.toLocaleString()}` : ""} players
      </div>
    </div>
  );
}
