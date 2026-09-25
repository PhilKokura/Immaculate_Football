"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Search, Info } from "lucide-react"
import type { PlayerWithImage } from "@/lib/gameLogic"
import {
  getCellHint,
  getCriterionDisplayName,
  validatePlayerSelection,
} from "@/lib/gameLogic"
import { searchPlayers } from "@/components/data/players"

interface PlayerModalProps {
  isOpen: boolean
  onClose: () => void
  onPlayerSelect: (player: PlayerWithImage) => void
  usedPlayers: Set<string>
  cellId: string | null
  rowCriteria: string
  colCriteria: string
}

export function PlayerModal({
  isOpen,
  onClose,
  onPlayerSelect,
  usedPlayers,
  rowCriteria,
  colCriteria,
}: PlayerModalProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithImage | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("")
      setSelectedPlayer(null)
      setError("")
    }
  }, [isOpen])

  const filteredPlayers = useMemo(() => {
    if (searchTerm.length < 3) return []
    return searchPlayers(
      searchTerm,
      usedPlayers,
      8,
      rowCriteria,
      colCriteria,
    )
  }, [searchTerm, usedPlayers, rowCriteria, colCriteria])

  const handlePlayerClick = (player: PlayerWithImage) => {
    setSelectedPlayer(player)

    const validation = validatePlayerSelection(
      player,
      rowCriteria,
      colCriteria,
    )

    if (!validation.isValid) {
      setError(validation.error || "Invalid selection")
    } else if (usedPlayers.has(player.id)) {
      setError(`${player.name} has already been used in the grid`)
    } else {
      setError("")
    }
  }

  const handleConfirmSelection = () => {
    if (!selectedPlayer) return

    const validation = validatePlayerSelection(
      selectedPlayer,
      rowCriteria,
      colCriteria,
    )

    if (validation.isValid && !usedPlayers.has(selectedPlayer.id)) {
      onPlayerSelect(selectedPlayer)
      onClose()
    }
  }

  const cellHint = getCellHint(rowCriteria, colCriteria)
  const rowLabel = getCriterionDisplayName(rowCriteria)
  const colLabel = getCriterionDisplayName(colCriteria)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            Find Player: {rowLabel} × {colLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">{cellHint}</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Type player name (min 3 characters)..."
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {searchTerm.length >= 3 ? (
            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredPlayers.length > 0 ? (
                filteredPlayers.map(player => (
                  <Card
                    key={player.id}
                    className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                      selectedPlayer?.id === player.id
                        ? "ring-2 ring-primary bg-accent"
                        : "hover:bg-accent"
                    }`}
                    onClick={() => handlePlayerClick(player)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        <img
                          src={player.image || "/placeholder.svg"}
                          alt={player.name}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {player.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {player.nation || "Nationality unknown"}
                          {player.positions.length > 0
                            ? ` • ${player.positions.join(", ")}`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {player.currentClubs.length > 0
                            ? player.currentClubs.map(club => club.name).join(", ")
                            : player.clubNames.slice(0, 2).join(", ")}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No players found matching &quot;{searchTerm}&quot;
                </p>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p>Type at least 3 characters to search for players</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div className="flex space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 bg-transparent"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSelection}
              disabled={!selectedPlayer || !!error}
              className="flex-1"
            >
              Confirm Selection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
