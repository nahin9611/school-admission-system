# School Admission System

A high-concurrency, first-come-first-served online school admission system built with **.NET 8 Web API**, **PostgreSQL**, **React 18 (TypeScript + Vite + Tailwind CSS)**, and **Docker**.

---

## 1. Quick Start with Docker

Make sure **Docker** is running on your machine. No other SDK or database installation is required.

From the repository root, run:

```bash
docker compose up --build
```

*(Or `docker compose up -d --build` to run in detached background mode).*

### Application URLs
- **Frontend UI:** http://localhost:5173
- **Backend API Base URL:** http://localhost:8080
- **Swagger API Docs:** http://localhost:8080/swagger

### Data Persistence
PostgreSQL uses a named Docker volume (`postgres_data`). Running `docker compose down` and `docker compose up` again preserves all classes, holds, and confirmed admissions.

---

## 2. Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` or `ConnectionStrings__DefaultConnection` | `Host=postgres;Port=5432;Database=school_admission;Username=postgres;Password=postgres` | PostgreSQL connection string for the backend. |
| `HOLD_DURATION_SECONDS` | `600` (10 minutes) | Seat hold duration in seconds before automatic expiration. |
| `VITE_API_URL` (or `BACKEND_URL`) | `http://localhost:8080` | Backend API URL used by the React frontend. |

---

## 3. Running Automated Tests

### Backend Automated Tests (xUnit - 5 Integration & Concurrency Tests)
Includes a 50-request parallel concurrency stress test (`ConcurrencyTest_50SimultaneousHoldRequestsFor5Seats_NeverExceedsTotalSeats`), duplicate hold prevention, idempotent confirmation, auto-expiry seat release, and hold cancellation:

```bash
dotnet test backend/SchoolAdmission.sln
```

### Frontend Automated Tests (Vitest + React Testing Library - Bonus 1.6)
Tests countdown formatting, 17-digit Birth Registration ID validation, live class rendering, and automatic `EXPIRED` status transition disabling the confirm button without page reload:

```bash
cd frontend
npm test
```
