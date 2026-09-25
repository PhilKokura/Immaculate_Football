"use client"

import { useState, useEffect } from "react"
import { GridCell } from "./GridCell"
import { PlayerModal } from "./PlayerModal"
import { Scoreboard } from "./Scoreboard"
import {
  calculateGameStats,
  generateGridFromSeed,
  getCriterionDisplayName,
  getCriterionType,
  getCriterionValue,
  getValidatedRandomSeed,
  type PlayerWithImage,
  type Seed,
  type SeedValidationResult,
} from "@/lib/gameLogic"
import { createGameProgress, submitPlayerSelection } from "@/lib/gameSubmission"
import Image from "next/image"
import { getNationFlagPath } from "@/lib/nationFlags"
import { getPositionIconPath } from "@/lib/positionIcons"
import { getLeagueIcon } from "@/lib/leagueIcons"
import { getClubIcon } from "@/lib/clubIcons"
import { getCriterion } from "@/components/data/gameData"

export interface GridState {
  [key: string]: PlayerWithImage | null
}

const getConstraintImage = (criterionKey: string): string | null => {
  const runtimeImage = getCriterion(criterionKey)?.image
  if (runtimeImage) return runtimeImage

  const type = getCriterionType(criterionKey)
  const value = getCriterionValue(criterionKey)
  const label = getCriterionDisplayName(criterionKey)

  if (!type || !value) return null

  if (type === "nation") return getNationFlagPath(label)
  if (type === "position") return getPositionIconPath(value)
  if (type === "league") return getLeagueIcon(label)
  if (type === "club") return getClubIcon(label)

  return null
}

function CriterionCard({ criterionKey }: { criterionKey: string }) {
  const image = getConstraintImage(criterionKey)
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
  const [currentSeed, setCurrentSeed] = useState<Seed | null>(null)
  const [seedValidation, setSeedValidation] = useState<SeedValidationResult | null>(null)
  const [rows, setRows] = useState<string[]>([])
  const [columns, setColumns] = useState<string[]>([])

  const [progress, setProgress] = useState(createGameProgress)
  const {
    gridState,
    guesses,
    correctAnswers,
    remainingAttempts,
    usedPlayers,
    lastError,
  } = progress
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  useEffect(() => {
    const { seed, validation } = getValidatedRandomSeed()
    const gridConfig = generateGridFromSeed(seed)
    setCurrentSeed(seed)
    setSeedValidation(validation)
    setRows(gridConfig.rows)
    setColumns(gridConfig.columns)
  }, [])

  const handleCellClick = (cellId: string) => {
    if (remainingAttempts > 0 && !gridState[cellId]) {
      setSelectedCell(cellId)
      setProgress(prev => ({ ...prev, lastError: "" }))
    }
  }

  const handlePlayerSelect = (
    player: PlayerWithImage,
    cellId: string,
  ) => {
    setProgress(prev =>
      submitPlayerSelection(
        prev,
        { rows, cols: columns },
        player,
        cellId,
      ),
    )
    setSelectedCell(null)
  }

  const handleReset = () => {
    const { seed, validation } = getValidatedRandomSeed()
    const gridConfig = generateGridFromSeed(seed)
    setCurrentSeed(seed)
    setSeedValidation(validation)
    setRows(gridConfig.rows)
    setColumns(gridConfig.columns)
    setProgress(createGameProgress())
    setSelectedCell(null)
  }

  const gameStats = gridState
    ? calculateGameStats(
        gridState,
        guesses,
        correctAnswers,
        remainingAttempts,
      )
    : {
        averageRarity: 0,
        completionPercentage: 0,
        accuracy: 0,
        isGameCompleted: false,
        isGameOver: false,
        isGameActive: true,
        correctPlayers: [],
      }

  if (!rows || !columns || rows.length === 0 || columns.length === 0) {
    return <div className="py-20 text-center text-slate-300">Loading grid...</div>
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
          New Game
        </button>
      </div>

      {seedValidation && !seedValidation.isValid && (
        <div className="mx-auto max-w-[850px] rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="text-center text-sm font-medium text-amber-200">
            ⚠️ Grid has limited solutions (min: {seedValidation.minPlayersPerCell} players per cell)
          </p>
          {seedValidation.invalidCells.length > 0 && (
            <p className="mt-1 text-center text-xs text-amber-300">
              Challenging cells: {seedValidation.invalidCells.join(", ")}
            </p>
          )}
        </div>
      )}

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
