"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import type { PlayerWithImage } from "@/lib/gameLogic"
import { getCriterionDisplayName } from "@/lib/gameLogic"
import { getCriterionImage } from "@/lib/criterionImages"
import { normalizePlayerSearchText, searchPlayers } from "@/components/data/players"

interface PlayerModalProps {
  isOpen: boolean
  onClose: () => void
  onPlayerSelect: (player: PlayerWithImage) => void
  cellId: string | null
  rowCriteria: string
  colCriteria: string
}

export function PlayerModal({
  isOpen,
  onClose,
  onPlayerSelect,
  rowCriteria,
  colCriteria,
}: PlayerModalProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithImage | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("")
      setSelectedPlayer(null)
    }
  }, [isOpen])

  const normalizedQuery = normalizePlayerSearchText(searchTerm)
  const results = useMemo(() => searchPlayers(searchTerm, 20), [searchTerm])
  const rowLabel = getCriterionDisplayName(rowCriteria)
  const colLabel = getCriterionDisplayName(colCriteria)
  const rowImage = getCriterionImage(rowCriteria)
  const colImage = getCriterionImage(colCriteria)

  const handleConfirmSelection = () => {
    if (!selectedPlayer) return
    onPlayerSelect(selectedPlayer)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="dark flex max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-[540px] flex-col gap-0 overflow-hidden rounded-2xl border border-sky-400/40 bg-[#081827] p-0 text-white shadow-[0_24px_80px_rgba(0,5,20,0.7),0_0_35px_rgba(35,137,205,0.13)] sm:max-w-[540px]">
        <DialogHeader className="gap-2 border-b border-sky-100/10 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-xl font-bold text-white">Find Player</DialogTitle>
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-200">
            <span className="flex min-w-0 items-center gap-2">
              {rowImage && <Image src={rowImage} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded bg-slate-200/75 object-contain p-0.5" />}
              <span className="truncate">{rowLabel}</span>
            </span>
            <span className="shrink-0 text-sky-400" aria-hidden="true">×</span>
            <span className="flex min-w-0 items-center gap-2">
              {colImage && <Image src={colImage} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded bg-slate-200/75 object-contain p-0.5" />}
              <span className="truncate">{colLabel}</span>
            </span>
          </div>
        </DialogHeader>

        <div className="px-4 pb-3 pt-4 sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-300" aria-hidden="true" />
            <Input
              autoFocus
              aria-label="Search player"
              placeholder="Search player..."
              value={searchTerm}
              onChange={event => {
                setSearchTerm(event.target.value)
                setSelectedPlayer(null)
              }}
              className="h-11 border-sky-400/35 bg-slate-900/80 pl-10 text-white placeholder:text-slate-500 focus-visible:border-sky-400 focus-visible:ring-sky-400/30"
            />
          </div>
        </div>

        <div className="min-h-[140px] max-h-[45dvh] overflow-y-auto px-4 pb-3 sm:px-5">
          {normalizedQuery.length < 2 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              {normalizedQuery.length === 0 ? "Search any active player" : "Enter at least 2 characters"}
            </p>
          ) : results.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No players found</p>
          ) : (
            <div className="space-y-2">
              {results.map(player => {
                const selected = selectedPlayer?.id === player.id
                const currentClub = player.currentClubs.length === 1 ? player.currentClubs[0].name : null
                return (
                  <button
                    key={player.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPlayer(player)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                      selected
                        ? "border-sky-400 bg-sky-400/15"
                        : "border-sky-100/10 bg-slate-800/45 hover:border-sky-300/40 hover:bg-slate-800/75"
                    }`}
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-700/60">
                      <img src={player.image || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white" title={player.name}>{player.name}</span>
                      {currentClub && <span className="block truncate text-xs text-slate-400">{currentClub}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-sky-100/10 bg-[#071522] p-4 sm:px-5">
          <Button variant="outline" onClick={onClose} className="flex-1 border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmSelection}
            disabled={!selectedPlayer}
            className="flex-1 bg-sky-500 font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            Confirm Selection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
