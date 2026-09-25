"use client"

import { Card } from "@/components/ui/card"
import { CheckCircle, Clock, Target, Trophy } from "lucide-react"

interface ScoreboardProps {
  guesses: number
  correctAnswers: number
  remainingAttempts: number
  completionPercentage: number
  gameCompleted: boolean
}

export function Scoreboard({
  guesses,
  correctAnswers,
  remainingAttempts,
  completionPercentage,
  gameCompleted,
}: ScoreboardProps) {
  const maxPossibleScore = 100 // Existing placeholder value

  const getCompletionMessage = () => {
    if (completionPercentage === 100) {
      return "Perfect! You completed the entire grid!"
    } else if (remainingAttempts === 0) {
      return "Game Over! Try again to improve your score."
    } else if (correctAnswers > 6) {
      return "Excellent progress! Keep going!"
    } else if (correctAnswers > 3) {
      return "Good work! You're halfway there!"
    }
    return "Find players who match both criteria!"
  }

  return (
    <Card className="gap-0 rounded-2xl border border-sky-400/30 bg-slate-950/65 p-5 text-slate-100 shadow-[inset_0_1px_0_rgba(180,220,255,0.08),0_14px_36px_rgba(0,5,17,0.25)] backdrop-blur-md">
      <h2 className="mb-3 text-lg font-bold text-white">Game Statistics</h2>

      <div className="divide-y divide-sky-100/10">
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2.5 text-sm text-slate-300"><Target className="h-4 w-4 text-sky-300" />Total Guesses</span>
          <strong className="text-lg text-white">{guesses}</strong>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2.5 text-sm text-slate-300"><CheckCircle className="h-4 w-4 text-emerald-400" />Correct</span>
          <strong className="text-lg text-emerald-400">{correctAnswers}</strong>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2.5 text-sm text-slate-300"><Clock className="h-4 w-4 text-amber-300" />Remaining</span>
          <strong className="text-lg text-amber-300">{remainingAttempts}</strong>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2.5 text-sm text-slate-300"><CheckCircle className="h-4 w-4 text-sky-300" />Complete</span>
          <strong className="text-lg text-sky-300">{completionPercentage}%</strong>
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <span className="flex items-center gap-2.5 text-sm text-slate-300"><Trophy className="h-4 w-4 text-amber-300" />Max Score</span>
          <strong className="text-lg text-amber-300">{maxPossibleScore}</strong>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-sm">
          <span className="font-semibold text-white">Progress</span>
          <span className="text-slate-400">{correctAnswers}/9 cells</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-700/70">
          <div
            className="h-2.5 rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      <p className={`mt-4 border-t border-sky-100/10 pt-4 text-sm font-medium ${
        gameCompleted ? "text-emerald-400" : remainingAttempts === 0 ? "text-red-400" : "text-slate-300"
      }`}>
        {getCompletionMessage()}
      </p>
    </Card>
  )
}
