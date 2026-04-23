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
    <div className="pixel-card flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
      <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search player"
            className="h-10 border-border bg-card pl-11 text-[10px]"
          />
        </div>

        <Select value={minBlocks} onValueChange={onMinBlocksChange}>
          <SelectTrigger className="h-10 border-border bg-card text-[10px]">
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

        <Button variant="outline" onClick={onClear} className="h-10 border-border bg-card text-[10px]">
          <X className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>

      <div className="border border-primary/30 bg-primary/10 px-4 py-3 text-[10px] leading-[1.6] text-primary md:pl-4">
        <span className="text-primary">{resultCount.toLocaleString()}</span>
        {resultCount !== totalCount ? ` of ${totalCount.toLocaleString()}` : ""} players
      </div>
    </div>
  );
}
