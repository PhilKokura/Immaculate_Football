# Six-player API-Football probe

Run from the repository root with an ignored `.env.local` containing an
`API_FOOTBALL_KEY=...` assignment (not an HTTP header line):

```sh
node --env-file=.env.local --import tsx scripts/provider-evaluation/api-football/run.ts
```

Uses the existing reconciled rows for Rodri, Alisson, Marquinhos, Robert
Lewandowski, Zinedine Zidane and Ronaldinho. No gameplay or mapping writes.

Endpoint sequence:
- `/players/profiles?search=...`: one page per name; profile identity returned in
  the search is reused. Lewandowski/Zidane use surname queries to avoid missing
  abbreviated display names. Every returned candidate is retained; no fuzzy matching.
- `/players/teams?player=...`: after reviewing the profiles, rerun with
  `--history=ID1,ID2` to retrieve team IDs/names/seasons only for selected returned
  candidates. Selection requests investigation, not acceptance. Search responses
  are cached, so they cost no additional requests.
- `/transfers?player=...` is the documented optional transfer-history endpoint,
  but is not automatically called. No fixtures or collections are enumerated.

The provider announces profiles and teams/seasons here:
https://www.api-football.com/news/post/api-football-new-release-available

Ignored `.local/` stores raw JSON responses (defensively redacting an echoed key),
the compact report and a persistent 15-request ledger. Caches are token-hash scoped.
No credentials or request headers are logged. Empty responses are cached and are
nonfatal; per-player coverage/network failures continue to the next source.
Authentication/quota failure blocks further live requests but still produces all
six report rows. Cached errors also block repeat spending. Cache has no expiry;
after credentials/entitlements change, explicitly clear the applicable cache if
needed. Clearing it also resets the local request budget.

Gender-labelled female candidates/teams are excluded. Missing gender needs human
verification; national teams are excluded where the provider supplies its national
flag. Profiles/teams do not necessarily supply every requested field or establish
complete historical careers. Error status and absent fields are kept separate from
`not-found`. `strong-candidate` is a conservative single-result name/DOB/history
triage label, never a canonical identity assignment. Collision rows with candidates
remain ambiguous. Profile search pagination is reported, not automatically followed.

Test: `node --import tsx --test tests/apiFootballProbe.test.ts`.
