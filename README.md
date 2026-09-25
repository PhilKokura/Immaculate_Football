# Football Immaculate Grid

A challenging 3×3 grid puzzle game that tests your football knowledge. Players must find footballers who match both row and column criteria, similar to the popular Immaculate Grid format.

> **⚠️ IMPORTANT**: This README serves as a **living guideline** for all development work. **Always consult this document before making changes** to avoid repeating common mistakes and ensure consistency across the codebase.

## 🎯 Project Overview

The Football Immaculate Grid is a React-based web application where users fill a 3×3 grid by finding players who satisfy intersecting criteria. Each cell requires a player who matches both the row criterion (e.g., "Bayern Munich") and column criterion (e.g., "Serie A").

### Game Rules
- **9 attempts maximum** - A shared budget across the grid; completed cells cannot be overwritten
- **No player reuse** - Each player can only be used once per game
- **Exact matches required** - Players must satisfy BOTH row and column criteria
- **Rarity display** - Shows the average rarity percentage of correct answers; there is no separate points calculation

### Current Fallback Grid

`components/Grid.tsx` generates a validated random grid on mount and New Game.
The constants in `lib/gameLogic.ts` provide this validated fallback:
```
           Serie A    ATT       Real Madrid
Bayern     ✅         ✅        ✅
Premier    ✅         ✅        ✅  
Brazil     ✅         ✅        ✅
```

## 📊 Data Model Best Practices

> **🔍 CHECK BEFORE CODING**: Always validate these rules before adding players or modifying data structures.

### Raw Player Structure
```typescript
interface RawPlayer {
  name: string          // Source name, not a unique real-world identity
  clubs: string[]       // Source club associations; completeness/participation unverified
  leagues: string[]     // Source league associations; no seasons or appearance evidence
  nations: string[]     // May be empty, ambiguous, or mix codes and country names
  positions: string[]   // May include multiple classes and textual synonyms
  rarity: number        // Stored decimal displayed as a percentage (0.01 = 1%)
}
```

The production source is `components/data/clean_players.json`. Both
`lib/gameLogic.ts` and `components/data/players.ts` project it for runtime use.
The runtime `PlayerWithImage` type retains `positions[]` but has one `nation`:
the loaders prefer a legacy `nation` field, otherwise the last `nations[]` value,
otherwise an empty string. This is existing gameplay behavior, not authoritative
nationality. Raw values may represent different or unresolved concepts; array
order does not establish a player's national team. Reconciliation preserves this
ambiguity and does not select a primary nation.

Images are separate: `components/data/players_images.json` is joined by exact
name in `components/data/players.ts`; `lib/gameLogic.ts` initializes images to null.
There are no canonical player IDs or complete, verified career histories yet.

### Critical Data Rules
- **Clubs ↔ Leagues mapping**: `CLUB_LEAGUE_MAP` covers selectable club criteria and forbids club × own-league intersections; it is not a complete source-club registry or historical league model
- **Rarity as percentage**: Store as decimal between 0-1 (e.g., 0.05 = 5% rarity)
- **Position vocabulary**: Active criteria use ATT, MID, DEF, GK. Raw data also contains Attacker, Midfielder, Defender and Goalkeeper; the offline pipeline normalizes these, while runtime matching remains exact
- **Multiple associations**: Raw club, league, nation and position arrays are preserved; do not assume they are complete or factually resolved

### Data Validation Checklist
- [ ] Selectable club criteria have the intended `CLUB_LEAGUE_MAP` entry
- [ ] Rarity values between 0-1
- [ ] Review nonstandard positions and ambiguous nation values without silently discarding them
- [ ] Review duplicate/normalized-name collisions; runtime names are keys, not proof of identity
- [ ] Separate image mappings have valid paths and intended exact-name keys

## 🎨 UI Best Practices

> **🎨 DESIGN CONSISTENCY**: Follow these patterns to maintain visual coherence across all components.

### Layout Standards
- **Grid centering**: Always use `max-w-2xl mx-auto` for grid container
- **Consistent spacing**: Use Tailwind's spacing scale (`gap-2`, `p-4`, `mb-8`)
- **Aspect ratios**: Grid cells use `aspect-square` for perfect squares
- **Responsive design**: Grid adapts to mobile with smaller text and spacing

### Visual Design Patterns
```css
/* Grid Headers */
bg-primary text-primary-foreground rounded-lg

/* Grid Cells */
border-2 border-border hover:border-primary/50 rounded-lg

/* Player Cards */
bg-card border border-border rounded-lg p-3

/* Error States */
bg-destructive/10 border-destructive/20 text-destructive
```

### Interactive States
- **Hover effects**: Subtle border color changes on grid cells
- **Loading states**: Grid initialization shows a text loading message; modal search filters the local dataset synchronously
- **Success feedback**: Green borders for correct answers
- **Error feedback**: Invalid selections show error messages; failed answers do not create completed red cells

### Typography Hierarchy
- **Main title**: `text-5xl font-bold text-balance`
- **Grid headers**: `text-sm font-medium text-center`
- **Player names**: `font-medium text-sm`
- **Error messages**: `text-sm text-destructive`

### Constraint Images
- **Visual headers**: Each constraint displays an appropriate image alongside text
- **Image sizing**: Constraint images are `w-12 h-12` with `rounded` corners
- **Image types**: Team logos, league badges, country flags, and position icons
- **Fallback handling**: Always include alt text for accessibility

#### Image Mapping System
The game uses a structured mapping system for constraint images:

**Nations**: the in-code mapping in `lib/nationFlags.ts`
- Maps nation names to flag image filenames
- Provides utility functions for flag path resolution
- Example: `"Germany": "771.png"` → `/images/nations/771.png`

**Positions**: the in-code mapping in `lib/positionIcons.ts`
- Maps position codes to icon image filenames  
- Provides utility functions for icon path resolution
- Example: `DEF` → `/images/positions/DEF.png`

The JSON mapping files under `public/images/` are not read by these helpers.
In particular, the old positions JSON contains FWD, but active icons use ATT.

**Usage Pattern**:
```typescript
// For nations
import { getNationFlagPath, isNation } from '@/lib/nationFlags'
const flagPath = getNationFlagPath("Germany") // "/images/nations/771.png"

// For positions  
import { getPositionIconPath, isPosition } from '@/lib/positionIcons'
const iconPath = getPositionIconPath("DEF") // "/images/positions/DEF.png"
```

## ⚖️ Validation Rules

> **🚨 CRITICAL**: These validation rules prevent unsolvable grid configurations. **Always check before modifying constraints.**

### Forbidden Pairings
```typescript
// ❌ NEVER ALLOW
Nation × Nation        // "Brazil" × "Spain"
Position × Position    // "DEF" × "MID"  
Club × Own League      // "Bayern Munich" × "Bundesliga"
League × Own Club      // "Premier League" × "Manchester United"
```

### Valid Pairings
```typescript
// Eligible pairing types; the complete puzzle must still pass validatePuzzle
Club × Foreign League  // "Bayern Munich" × "Serie A"
Club × Nation         // "Bayern Munich" × "Brazil"
Club × Position       // "Bayern Munich" × "DEF"
League × Nation       // "Premier League" × "Brazil"
League × Position     // "Premier League" × "DEF"
Nation × Position     // "Brazil" × "DEF"
Club × Other Club     // "Bayern Munich" × "Real Madrid"
League × Other League // "Premier League" × "Serie A"
```

### Validation Implementation
```typescript
// Check invalid pairings FIRST
const invalidPairing = checkInvalidPairing(rowCriteria, colCriteria)
if (invalidPairing.isInvalid) {
  return { isValid: false, error: invalidPairing.reason }
}

// Then validate player matches both criteria
const satisfiesRow = checkCriteria(player, rowCriteria)
const satisfiesCol = checkCriteria(player, colCriteria)
```

## 🔍 Search Modal Best Practices

> **⚡ PERFORMANCE**: These patterns prevent UI lag and improve user experience.

### Search Behavior
- **Minimum query length**: `PlayerModal` starts search after 3+ characters typed
- **Substring matching**: Search is case-insensitive and accent-insensitive, matching anywhere in the name
- **Criteria filtering**: Only show players who match BOTH row and column criteria
- **Result limiting**: Maximum 8 suggestions to prevent UI overflow

### Performance Optimizations
```typescript
// PlayerModal memoizes this call; searchPlayers applies name normalization,
// used-name exclusion, shared criterion matching, and the result limit.
if (searchTerm.length < 3) return []
return searchPlayers(searchTerm, usedPlayers, 8, rowCriteria, colCriteria)
```

### UX Guidelines
- **Clear visual feedback**: Show which criteria the player matches
- **Error prevention**: Don't show players who can't be selected
- **Selection**: Click a result, then confirm; custom arrow-key/Enter result selection is not implemented
- **Mobile optimization**: Ensure touch targets are large enough

## 📈 Scoring Best Practices

### Rarity Calculation
```typescript
// Store rarity as percentage (0.01 = 1%)
const averageRarity = correctPlayers.length > 0
  ? Math.round(correctPlayers.reduce((sum, player) => 
      sum + player.rarity * 100, 0) / correctPlayers.length)
  : 0
```

### Game Statistics
- **Completion percentage**: `(correctAnswers / 9) * 100`
- **Accuracy**: `(correctAnswers / totalGuesses) * 100`
- **Average rarity**: Mean rarity of all correct players
- **Remaining attempts**: `9 - totalGuesses`

### Scoring Display
```typescript
// Show percentages as whole numbers
averageRarity: 15%     // Not 0.15
completionPercentage: 67%  // Not 0.67
accuracy: 89%         // Not 0.89
```

## 🔧 Extensibility Notes

### Current Limitations
- **Fixed 3×3 grid**: Hardcoded to 9 cells
- **Static criterion vocabulary**: Constants define available categories; each game selects a validated random combination
- **Manual player data**: No dynamic data fetching

### Future Enhancements

#### Dynamic Grid Sizes
```typescript
// Make grid size configurable
const GRID_SIZE = 3 // Could be 4x4, 5x5, etc.
const ROWS = generateRows(GRID_SIZE)
const COLUMNS = generateColumns(GRID_SIZE)
```

#### Daily Challenges
```typescript
// Generate different grids based on date
const getDailyGrid = (date: Date) => {
  const seed = date.toISOString().split('T')[0]
  return generateGridFromSeed(seed)
}
```

#### Difficulty Levels
```typescript
// Adjust criteria complexity
const DIFFICULTY_LEVELS = {
  easy: { rarityThreshold: 0.2, allowedAttempts: 12 },
  medium: { rarityThreshold: 0.1, allowedAttempts: 9 },
  hard: { rarityThreshold: 0.05, allowedAttempts: 6 }
}
```

#### Database Integration
```typescript
// Replace static data with API calls
const fetchPlayers = async (criteria: string[]) => {
  return await api.get('/players', { params: { criteria } })
}
```

### Architecture Considerations
- **State management**: Consider Zustand/Redux for complex state
- **Caching**: Implement player data caching for performance
- **Internationalization**: Support multiple languages
- **Accessibility**: Add ARIA labels and keyboard navigation
- **Analytics**: Track popular players and difficult intersections

## 🚀 Development Workflow

### Puzzle correctness checks

- `pnpm test` runs the automated puzzle and submission regression tests.
- `pnpm typecheck` runs TypeScript independently of Next.js build settings.
- `validatePuzzle` in `lib/gameLogic.ts` is the authoritative puzzle validator.
  It checks the 3×3 shape, known unique criteria, existing pairing rules, cell
  candidates using gameplay validation, and a complete nine-distinct-name assignment.
- The active generator and fallback use this validator. If the fallback becomes
  invalid after a data change, generation throws rather than returning an unplayable grid.
- `submitPlayerSelection` in `lib/gameSubmission.ts` applies submission guards and
  counters atomically. Player identity and assisted search remain unchanged.

### Offline data reconciliation

- `pnpm data:audit` builds a non-destructive reconciliation layer and review reports.
- The game continues using `components/data/clean_players.json` unchanged.
- Explicit dictionaries, raw provenance, review flags, and manual decision rules
  are documented in [data/reconciliation/README.md](data/reconciliation/README.md).
- Ordinary aliases are explicit; Football Manager licensing replacements have a
  separate mapping type. Unresolved data remains preserved for review. These are
  offline analysis artifacts, not runtime inputs or canonical player identities.
- `pnpm test` also covers normalization, provenance, uncertainty, and determinism.

> **📋 CHECKLIST**: Follow these steps for all development tasks to maintain code quality and prevent regressions.

### Before Making Any Changes
1. **Read this README** - Understand the constraints and best practices
2. **Run constraint validation** - Execute `scripts/test-constraints.ts`
3. **Check existing implementation** - Read/search the relevant repository files
4. **Plan your changes** - Consider impact on validation rules and user experience

### Maintaining Player Data
1. The current production source is `components/data/clean_players.json`; `PLAYERS_DATABASE` in `components/data/players.ts` is a derived array, not a manually maintained source
2. For an explicitly authorized source-data change, preserve the raw array schema and source evidence; no external importer or canonical-entity maintenance workflow exists yet
3. Review uncertainty in `data/reconciliation/`; do not silently choose nations or merge namesakes. `CLUB_LEAGUE_MAP` only needs changes when selectable criteria change
4. Run `pnpm data:audit` after an authorized source change and review reports and stale hash-bound manual decisions; outputs do not update gameplay automatically
5. Run `pnpm test` and constraint validation, then verify search behavior. Maintain optional exact-name image mappings separately

### Modifying Grid Criteria
1. Update the relevant criterion lists and pairing map in `lib/gameLogic.ts`; `ROWS` and `COLUMNS` change the fallback only
2. Run `scripts/test-constraints.ts` to verify all intersections are valid
3. Ensure sufficient players exist for each intersection
4. Test edge cases and invalid pairings

### Adding Constraint Images
1. Add image files to appropriate `public/images/` subdirectory (`nations/`, `positions/`, etc.)
2. Update the active helper mapping (`lib/nationFlags.ts`, `lib/positionIcons.ts`, `lib/leagueIcons.ts` or `lib/clubIcons.ts`); changing a public mapping JSON alone does not change these helpers
3. Use descriptive filenames (e.g., `defender-icon.jpg`, `brazil-flag.png`)
4. Ensure images are optimized for web (reasonable file sizes)
5. Test images display correctly in grid headers using the utility functions

### Common Debugging Steps
1. **No search results**: Check if criteria filtering is too restrictive
2. **Invalid pairings**: Verify `checkInvalidPairing` logic
3. **Missing players**: Ensure player data includes required criteria
4. **Rarity issues**: Confirm rarity values are decimals, not percentages
5. **Image loading issues**: Verify image paths and file extensions

### After Making Changes
1. **Update this README** - Document new features, fixes, or lessons learned
2. **Test all grid intersections** - Ensure no cells become unsolvable
3. **Verify search functionality** - Check that filtering works correctly
4. **Test edge cases** - Invalid inputs, empty states, error conditions

---

**Built with**: Next.js 16.2.0 (package.json and installed package), React 19, TypeScript, Tailwind CSS, shadcn/ui
