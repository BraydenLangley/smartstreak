export default `# Streaks Topic Manager Docs

To have outputs accepted into the Streaks overlay network, use the Streak sCrypt contract to create valid locking scripts.

Submit transactions that either start a new streak at count = 1 or spend an existing streak to advance the dayStamp by the cadenceDays configured in the contract state.

Only outputs that satisfy the overlay policies—currently requiring today\'s UTC dayStamp for cadenceDays = 1 streaks and enforcing one admitted tick per (creatorIdentityKey, namespace, day)—will be tracked.

The latest state for each (creatorIdentityKey, namespace) pair is available through the companion ls_streaks lookup service.`
