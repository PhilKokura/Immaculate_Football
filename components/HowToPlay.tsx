import { Card } from "@/components/ui/card"

export function HowToPlay() {
  return (
    <Card className="p-5 bg-gradient-to-br from-muted/50 to-muted/30">
      <h3 className="font-bold text-foreground mb-3 text-lg">How to Play</h3>
      <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
        <p>• Find players who satisfy both row and column criteria</p>
        <p>• Players must have played for the club/league or represent the nation/position</p>
        <p>• Invalid pairings: Nation vs Nation, Position vs Position, Club vs its own League</p>
        <p>• Each player can only be used once in the grid</p>
      </div>
    </Card>
  )
}
