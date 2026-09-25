"use client"

import { useState, useEffect } from "react"
import { GridCell } from "./GridCell"
import { PlayerModal } from "./PlayerModal"
import { Scoreboard } from "./Scoreboard"
import {
  calculateGameStats,
  getCriterionDisplayName,
  type PlayerWithImage,
} from "@/lib/gameLogic"
import { createGameProgress, submitPlayerSelection } from "@/lib/gameSubmission"
import { createDailyGameState, loadDailyPuzzle, resetDailyGameState, type DailyGameState } from "@/lib/dailyPuzzleClient"
import Image from "next/image"
import { getCriterionImage } from "@/lib/criterionImages"

export interface GridState {
  [key: string]: PlayerWithImage | null
}

function CriterionCard({ criterionKey }: { criterionKey: string }) {
  const image = getCriterionImage(criterionKey)
  const label = getCriterionDisplayName(criterionKey)

  return (
    <div className="footgrid-criterion" title={label}>
      {image && (
        <span className="footgrid-criterion-icon footgrid-criterion-icon--backed">
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 64px, 48px" className="object-contain" />
        </span>
      )}
      <span className="footgrid-criterion-label">{label}</span>
    </div>
  )
}

export function Grid() {
  const [dailyGame, setDailyGame] = useState<DailyGameState | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading")
  const [loadError, setLoadError] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoadState("loading")
    setLoadError("")
    setDailyGame(null)

    void loadDailyPuzzle(controller.signal)
      .then(puzzle => {
        if (controller.signal.aborted) return
        setDailyGame(createDailyGameState(puzzle))
        setLoadState("ready")
      })
      .catch(error => {
        if (controller.signal.aborted) return
        setLoadError(error instanceof Error ? error.message : "Could not load the Daily Puzzle. Please retry.")
        setLoadState("error")
      })

    return () => controller.abort()
  }, [retryCount])

  const rows = dailyGame?.puzzle.rows.map(criterion => criterion.key) ?? []
  const columns = dailyGame?.puzzle.columns.map(criterion => criterion.key) ?? []
  const {
    gridState,
    guesses,
    correctAnswers,
    remainingAttempts,
    usedPlayers,
    lastError,
  } = dailyGame?.progress ?? createGameProgress()
  const handleCellClick = (cellId: string) => {
    if (remainingAttempts > 0 && !gridState[cellId]) {
      setSelectedCell(cellId)
      setDailyGame(previous => previous
        ? { ...previous, progress: { ...previous.progress, lastError: "" } }
        : previous)
    }
  }

  const handlePlayerSelect = (player: PlayerWithImage, cellId: string) => {
    setDailyGame(previous => {
      if (!previous) return previous
      const seed = {
        rows: previous.puzzle.rows.map(criterion => criterion.key),
        cols: previous.puzzle.columns.map(criterion => criterion.key),
      }
      return {
        ...previous,
        progress: submitPlayerSelection(previous.progress, seed, player, cellId),
      }
    })
    setSelectedCell(null)
  }

  const handleReset = () => {
    setDailyGame(previous => previous ? resetDailyGameState(previous) : previous)
    setSelectedCell(null)
  }

  const gameStats = calculateGameStats(
    gridState,
    guesses,
    correctAnswers,
    remainingAttempts,
  )
  if (loadState === "loading") {
    return <div role="status" className="py-16 text-center text-sm text-slate-300">Loading Daily Puzzle...</div>
  }

  if (loadState === "error" || !dailyGame) {
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-xl border border-red-400/30 bg-red-400/10 p-6 text-center">
        <p className="text-sm text-red-200">{loadError || "Daily Puzzle is unavailable. Please retry."}</p>
        <button
          type="button"
          onClick={() => setRetryCount(count => count + 1)}
          className="mt-4 rounded-lg border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-400/20"
        >
          Retry
        </button>
      </div>
    )
  }

  if (rows.length !== 3 || columns.length !== 3) {
    return <div role="alert" className="py-12 text-center text-red-200">Daily Puzzle criteria are unavailable.</div>
  }
  return (
    <div className="footgrid-game">
      <div className="footgrid-toolbar flex w-full flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
          <span><strong className="font-bold text-white">{guesses}</strong> guesses</span>
          <span><strong className="font-bold text-emerald-400">{correctAnswers}</strong> correct</span>
          <span><strong className="font-bold text-sky-300">{remainingAttempts}</strong> remaining</span>
        </div>
        <button
          onClick={handleReset}
          className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-4 py-1.5 text-sm font-semibold text-sky-200 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          Reset Game
        </button>
      </div>

      {lastError && (
        <div className="mx-auto max-w-[850px] rounded-lg border border-red-400/30 bg-red-400/10 p-3">
          <p className="text-center text-sm text-red-200">{lastError}</p>
        </div>
      )}

      <div className="footgrid-layout">
        <div className="footgrid-play-area">
          <div className="footgrid-board w-full">
            <div className="footgrid-matrix">
              <div className="footgrid-corner" aria-hidden="true"><span>×</span></div>

              {columns.map((col, index) => <CriterionCard key={`col-${index}`} criterionKey={col} />)}

              {rows.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="contents">
                  <CriterionCard criterionKey={row} />

                  {columns.map((_, colIndex) => {
                    const cellId = `${rowIndex}-${colIndex}`
                    return (
                      <GridCell
                        key={cellId}
                        cellId={cellId}
                        player={gridState[cellId]}
                        onClick={() => handleCellClick(cellId)}
                        disabled={!gameStats.isGameActive}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

        </div>

        <aside className="footgrid-sidebar" aria-label="Game statistics">
          <Scoreboard
            guesses={guesses}
            correctAnswers={correctAnswers}
            remainingAttempts={remainingAttempts}
            completionPercentage={gameStats.completionPercentage}
            gameCompleted={gameStats.isGameCompleted}
          />
        </aside>
      </div>

      <PlayerModal
        isOpen={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        onPlayerSelect={player =>
          selectedCell && handlePlayerSelect(player, selectedCell)
        }
        usedPlayers={usedPlayers}
        cellId={selectedCell}
        rowCriteria={
          selectedCell &&
          rows.length > 0 &&
          selectedCell.includes("-") &&
          selectedCell.split("-").length === 2
            ? rows[Number.parseInt(selectedCell.split("-")[0])] || ""
            : ""
        }
        colCriteria={
          selectedCell &&
          columns.length > 0 &&
          selectedCell.includes("-") &&
          selectedCell.split("-").length === 2
            ? columns[Number.parseInt(selectedCell.split("-")[1])] || ""
            : ""
        }
      />
    </div>
  )
}





