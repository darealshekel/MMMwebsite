export interface BlocksMinedMilestoneTier {
  minimum: number;
  label: string;
  color: string;
}

export const BLOCKS_MINED_MILESTONE_TIERS: BlocksMinedMilestoneTier[] = [
  { minimum: 250_000_000, label: "250M", color: "#FFFFFF" },
  { minimum: 225_000_000, label: "225M", color: "#FFE4E4" },
  { minimum: 200_000_000, label: "200M", color: "#FFD1D1" },
  { minimum: 175_000_000, label: "175M", color: "#FF9E9E" },
  { minimum: 150_000_000, label: "150M", color: "#FF6B6B" },
  { minimum: 125_000_000, label: "125M", color: "#FF3B3B" },
  { minimum: 100_000_000, label: "100M", color: "#FF0000" },
  { minimum: 90_000_000, label: "90M", color: "#9B00FF" },
  { minimum: 80_000_000, label: "80M", color: "#5A00FF" },
  { minimum: 60_000_000, label: "60M", color: "#0055FF" },
  { minimum: 50_000_000, label: "50M", color: "#0088FF" },
  { minimum: 40_000_000, label: "40M", color: "#00C3FF" },
  { minimum: 30_000_000, label: "30M", color: "#00FFE5" },
  { minimum: 25_000_000, label: "25M", color: "#00FF88" },
  { minimum: 20_000_000, label: "20M", color: "#4CFF00" },
  { minimum: 17_500_000, label: "17.5M", color: "#B6FF00" },
  { minimum: 15_000_000, label: "15M", color: "#FFB300" },
  { minimum: 12_500_000, label: "12.5M", color: "#FF7A1F" },
  { minimum: 10_000_000, label: "10M", color: "#FF5A1F" },
];

export function getBlocksMinedMilestoneTier(value: number | null | undefined): BlocksMinedMilestoneTier | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  const safeValue = Math.max(0, value);
  return BLOCKS_MINED_MILESTONE_TIERS.find((tier) => safeValue >= tier.minimum) ?? BLOCKS_MINED_MILESTONE_TIERS[BLOCKS_MINED_MILESTONE_TIERS.length - 1];
}

export function getBlocksMinedColor(value: number | null | undefined): string | undefined {
  return getBlocksMinedMilestoneTier(value)?.color;
}
