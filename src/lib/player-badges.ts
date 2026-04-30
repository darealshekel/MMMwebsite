export type PlayerBadge = {
  src: string;
  label: string;
};

const BADGES: Record<string, PlayerBadge[]> = {
  sheronman: [{ src: "/badges/badge-100m.png", label: "100M Digs" }],
};

export function getPlayerBadges(username: string): PlayerBadge[] {
  return BADGES[username.toLowerCase()] ?? [];
}
