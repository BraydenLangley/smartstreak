export default `# Streaks Lookup Service

The Streaks lookup service indexes the latest streak state for each (creatorIdentityKey, namespace) pair.

Queries:

- \`{ findAll: true }\` – return all tracked streak outputs as an output-list.
- \`{ findByCreator: { creatorIdentityKey, namespace? } }\` – return streaks for a specific creator, optionally filtered by namespace.
- \`{ findTop: { namespace?, limit? } }\` – return the strongest streaks ordered by count, optionally scoped to a namespace and limited.
- \`{ findActiveForDate: { dayStamp, namespace? } }\` – return streaks that recorded the provided UTC dayStamp.
- \`{ findBrokenSince: { referenceDayStamp, namespace? } }\` – return streaks whose latest dayStamp is older than referenceDayStamp - cadenceDays.`
