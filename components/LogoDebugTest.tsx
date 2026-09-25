import { getClubIcon } from "../lib/clubIcons"

export default function LogoDebugTest() {
  console.log("[v0] Testing Real Madrid logo:", getClubIcon("Real Madrid"))
  console.log("[v0] Testing PSG logo:", getClubIcon("Paris Saint-Germain"))

  return (
    <div className="p-4 border border-red-500 bg-red-50">
      <h3 className="font-bold text-red-700">Logo Debug Test</h3>
      <div className="mt-2">
        <p>Real Madrid Logo:</p>
        <img
          src={getClubIcon("Real Madrid") || "/placeholder.svg"}
          alt="Real Madrid"
          className="w-8 h-8"
          onError={(e) => console.log("[v0] Real Madrid logo failed to load:", e)}
          onLoad={() => console.log("[v0] Real Madrid logo loaded successfully")}
        />
      </div>
      <div className="mt-2">
        <p>PSG Logo:</p>
        <img
          src={getClubIcon("Paris Saint-Germain") || "/placeholder.svg"}
          alt="PSG"
          className="w-8 h-8"
          onError={(e) => console.log("[v0] PSG logo failed to load:", e)}
          onLoad={() => console.log("[v0] PSG logo loaded successfully")}
        />
      </div>
    </div>
  )
}
