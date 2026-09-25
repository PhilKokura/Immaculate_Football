import { Grid } from "@/components/Grid"

export default function Home() {
  return (
    <main className="dark footgrid-page min-h-screen text-foreground">
      <header className="footgrid-header">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[1250px] flex-wrap items-center justify-between gap-4 px-5 py-2 sm:px-8">
          <a href="#play" className="flex items-center gap-3 text-white" aria-label="FootGrid home">
            <span className="footgrid-brand-mark" aria-hidden="true">⚽</span>
            <span className="text-3xl font-extrabold tracking-tight">Foot<span className="text-sky-400">Grid</span></span>
          </a>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium sm:gap-x-7">
            <a href="#play" className="text-sky-300 transition-colors hover:text-white">Play</a>
            <span className="text-slate-500" aria-disabled="true">Daily Challenge</span>
            <span className="text-slate-500" aria-disabled="true">Stats</span>
            <span className="text-slate-500" aria-disabled="true">How to Play</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1250px] px-4 pb-2 pt-1 sm:px-8">
        <div className="mb-2 text-center lg:flex lg:items-baseline lg:justify-center lg:gap-4">
          <h1 className="text-balance text-xl font-bold tracking-tight text-white">Find the player. Fill the grid.</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-400 lg:mt-0">
            Match a player to both clues in each square. Nine cells, nine different players.
          </p>
        </div>
        <section id="play" aria-label="Football grid game">
          <Grid />
        </section>
      </div>
    </main>
  )
}
