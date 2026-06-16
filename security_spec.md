# Security Specification for Laterallis

## 1. Data Invariants
- **Events**: Schema keys must be exact, and the event date must be a valid ISO format string.
- **Teams**: Teams must belong to a valid event.
- **Clues**: Clues must belong to a valid event, sequence must be an integer > 0, and the QR Code string must be bounded.
- **GameplayState**: GameplayState document ID is formatted as `${eventId}_${teamId}`. Sequence numbers and indices are strictly non-negative integers. Base64 photo payloads are bounded in size.

## 2. The "Dirty Dozen" Payloads (Malicious Updates & Creates)
We verify that these payloads fail rules validation:

1. **Ghost Fields on Event**: Creation of an Event with a hidden field `isAdmin: true`.
2. **Invalid Type for Event Date**: Saving `{ id: "evt-1", name: "Evt", date: 12345 }`.
3. **Orphaned Team**: Saving a team with an empty or non-string `eventId`.
4. **Incorrect ID format for Team**: Document ID injection with dangerous symbols.
5. **Wrong Clue Sequence**: Setting sequence to `-10` or a non-integer.
6. **Huge Payload Clue**: Saving a clue with a 10MB description to cause high storage overhead.
7. **Negative Clue Sequence Index**: Gameplay state current index changed to `-1`.
8. **Malfunctioning Completed State**: Setting completed state to empty or integer instead of boolean.
9. **Tampering with startedAt**: Modifying a historical `startedAt` timestamp after it was created.
10. **Shadow Updates to Gameplay State**: Trying to write an unsolicited field `hackEnabled: true` in the progress object.
11. **Huge Photo Injection**: Writing a Base64 string that exceeds normal image boundaries.
12. **Tampering with foreign Event ID**: Modifying an existing event ID field on active gameplay states.

## 3. Rules Structure and Access Map
- **Events**: Anyone can read to select, write to manage.
- **Teams**: Anyone can read to select, write to register.
- **Clues**: Anyone can read to play, write to manage.
- **GameplayStates**: Anyone can read/write to sync progress across screens.
