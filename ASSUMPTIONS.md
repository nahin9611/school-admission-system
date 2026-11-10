# Assumptions & Architectural Decisions (ASSUMPTIONS.md)

## 1. Student Identification (`X-Student-Id`)
- **API Level:** The backend requires a non-empty `X-Student-Id` header on `/classes/{classId}/holds`, `/holds/{holdId}/confirm`, `/holds/{holdId}` (DELETE), and `/me/holds`. Missing headers return `400 Bad Request`.
- **UI Level:** The UI validates that the student Birth Registration Number is a 17-digit numeric string (matching section 1.4) and stores it in `localStorage` so refreshing the page or reopening the browser restores the student session and active applications automatically.

## 2. Duplicate Application & Re-application Rules
- A student can have at most **one active (`HELD`) or confirmed (`CONFIRMED`)** application in the same class/shift at any time. Attempting to create another hold in the same class while one is `HELD` or `CONFIRMED` returns `409 Conflict`.
- If a student previous hold in a class has become `EXPIRED` or `CANCELLED`, they are permitted to apply again if seats are available.
- A student can apply to different classes/shifts (e.g., `Class 6 - Morning Shift` and `Class 6 - Day Shift`) independently.

## 3. Automatic Hold Expiration (Hybrid Eager + Lazy Strategy)
- **Background Worker (`HoldExpirationService`):** A hosted background service runs every 1 second to mark expired `HELD` records as `EXPIRED` in PostgreSQL without requiring any user API call.
- **Query-Time Evaluation:** To eliminate sub-second race windows between background ticks, every seat-calculation query and hold mutation checks `ExpiresAt <= DateTime.UtcNow` inside the database transaction and transitions stale holds immediately before calculating available seats.

## 4. Ownership & Cancellation HTTP Status Codes
- Only the student who created a hold (`X-Student-Id` match) can confirm or cancel it. Mismatched `X-Student-Id` requests return `403 Forbidden`.
- Confirming an already `CONFIRMED` hold owned by the same student is **idempotent**: it returns `200 OK` with `{ "holdId": "...", "status": "CONFIRMED" }` and does not increment `confirmedSeats` a second time.
- Attempting to confirm or cancel an `EXPIRED` hold, or cancel an already `CONFIRMED` hold, returns `409 Conflict`.

## 5. Bonus 1.6: Multi-Process Concurrency Guarantee
- **Why in-memory locks are insufficient:** An in-memory lock (`lock` or `SemaphoreSlim`) only synchronizes threads within a single OS process. If two backend processes run on different ports (e.g., `:8080` and `:8081`) sharing the same PostgreSQL database, in-memory locks cannot prevent both processes from reading the same `availableSeats` simultaneously.
- **How we guaranteed it:** In `POST /classes/{classId}/holds`, we begin a database transaction and execute a PostgreSQL row-level exclusive lock on the target class row:
  `SELECT 1 FROM "Classes" WHERE "Id" = @classId FOR UPDATE`
- Because PostgreSQL row-level `FOR UPDATE` lock is enforced inside the database engine, any concurrent transaction from **any** backend process attempting to hold a seat for the same `classId` is forced to wait until the first transaction commits or rolls back. Once the lock is acquired, the backend re-evaluates expired holds and counts active `HELD + CONFIRMED` rows inside the transaction, guaranteeing that `heldSeats + confirmedSeats` can never exceed `totalSeats` across multiple processes.
