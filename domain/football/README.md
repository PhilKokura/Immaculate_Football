# Canonical football identity example (offline)

`types.ts` defines application-owned player/team identity, provider references,
association evidence and scoped legacy links. `example.ts` seeds only the three
user-confirmed male identities. Nothing is imported into gameplay.

IDs are explicit permanent assignments checked into the fixture, so repeated loads
are deterministic. They are not calculated from names, birth dates, source indexes
or provider IDs. Keep an ID when correcting labels/biography or adding a provider.
Distinct people may have identical display names. An external reference is the
pair `(provider, externalId)`; the same externalId in another namespace is unrelated.
No general identity allocator or automated matching is introduced here.

Teams are explicitly classified for this men's-football fixture, not parsed from
arbitrary name suffixes. Reserve, senior and national/youth teams are distinct.
Brazil and AS Roma are reused as the same team entities across player histories.
Provider team IDs were not supplied, so team externalRefs stay empty.

The 19 history rows preserve the associations supplied by the user, including
Rodri–Barcelona. They are provider observations, not independently verified career
facts or proof of a match appearance. They must not automatically become gameplay
eligibility. No dates/seasons were supplied in the request or available in the
saved team-history responses. Seasons therefore remain empty with `not-provided`;
Corinthians is explicitly `observed-empty`, as reported by the user. When actual
season values become available they can be preserved verbatim with `provided`.

Confirmed legacy links identify one real person represented within the given
hash-bound source row. **They do not confirm or copy the row's clubs, positions,
nations or other claims.** A conflated row can eventually link to multiple people;
links deliberately do not enforce one canonical person per sourceRef. No source
records are modified, and no legacy associations are inherited by these fixtures.

This is only a domain contract and a small example, not a database, import process,
provider synchronization or runtime migration.
