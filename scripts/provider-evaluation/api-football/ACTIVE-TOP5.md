# Local active top-five candidate catalog

Run from the repository root:

```sh
node --env-file=.env.local --import tsx scripts/provider-evaluation/api-football/import-active-top5.ts --max-requests=75
```

`--max-requests` accepts 0–75; default is 75. The importer requests the five
2026 league team lists, then the current squad for each returned senior club.
The squad endpoint has no season parameter: membership is a current-squad
snapshot attached to the 2026 league selection, not evidence of a 2026/27 match.

Successful full API responses are cached separately under the gitignored
`.local/active-top5/raw/leagues/` and `raw/squads/` folders. Restarting reads
valid caches and requests only missing endpoints. Failed responses are not cached;
the summary records their endpoint and category. Quota/authentication failures
stop further requests. Other team errors allow the import to continue. Repeated
failures can be retried on a later run. Never delete caches as part of ordinary
resume. A zero-request run can rebuild outputs from available cache alone.

Generated `teams.json`, `players.json`, `player-team-memberships.json`, and
`import-summary.json` stay in `.local/active-top5/`. Players are deduplicated by
namespaced API-Football player reference. Team membership is a separate relation.
Only squad-returned player fields are stored. No application canonical player IDs,
birth dates or nationalities are inferred. A partial run is valid. If any league
list is missing, the number of remaining squads is unknown until that list loads.
The summary still gives remaining league lists and successfully cached squads.

The free plan's daily quota is separate from this per-run cap. Check remaining
account quota before a larger run if other tools have used the API that day.
This importer never accesses the game's production dataset or runtime modules.
