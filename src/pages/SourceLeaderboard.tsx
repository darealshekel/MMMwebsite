import { useParams } from "react-router-dom";
import { LeaderboardScreen } from "@/components/leaderboard/LeaderboardScreen";

export default function SourceLeaderboard() {
  const { slug } = useParams();
  return <LeaderboardScreen sourceSlug={slug ?? null} />;
}
