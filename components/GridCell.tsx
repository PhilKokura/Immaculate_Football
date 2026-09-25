import type { PlayerWithImage } from "@/lib/gameLogic"

interface GridCellProps {
  cellId: string
  player: PlayerWithImage | null
  onClick: () => void
  disabled: boolean
}

export function GridCell({ cellId, player, onClick, disabled }: GridCellProps) {
  return (
    <button
      type="button"
      className={`footgrid-cell ${player ? "footgrid-cell--solved" : "footgrid-cell--empty"}`}
      onClick={onClick}
      disabled={disabled || Boolean(player)}
      aria-label={player ? `${player.name}, completed cell` : `Select player for cell ${cellId}`}
    >
      {player ? (
        <>
          <span className="footgrid-cell__rarity">{Math.round(player.rarity * 100)}%</span>
          <span className="footgrid-cell__portrait">
            <img src={player.image || "/placeholder.svg?height=176&width=176&query=football player"} alt="" className="h-full w-full object-contain object-bottom" />
          </span>
          <span className="footgrid-cell__name" title={player.name}>{player.name}</span>
        </>
      ) : (
        <span className="footgrid-cell__plus" aria-hidden="true">+</span>
      )}
    </button>
  )
}
