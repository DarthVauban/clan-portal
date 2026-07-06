import { PlayerProfileView } from "@/components/player-profile-view";

export default async function PlayerProfilePage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return <PlayerProfileView playerId={playerId} />;
}
