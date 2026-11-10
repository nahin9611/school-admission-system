# AI Usage Disclosure (AI_USAGE.md)

## 1. AI Tools Used & Scope
- **Tool Used:** Google Gemini.
- **Parts Assisted:**
  - Scaffolding the .NET 8 Web API controller structure, Entity Framework Core models (`SchoolClass`, `SeatHold`), and DTO JSON property mappings.
  - Writing xUnit concurrency and integration tests (`AdmissionApiTests.cs`) and Vitest frontend component tests (`App.test.tsx`).
  - Drafting the React 18 TypeScript UI layout, countdown timer logic, and Docker configuration (`Dockerfile` and `docker-compose.yml`).

## 2. Mistakes Made by AI & How I Caught and Fixed Them

### Mistake 1: Single-Process In-Memory Locking vs. Multi-Process Database Concurrency
- **What AI did:** Initially, AI suggested using only a C# in-memory `SemaphoreSlim` dictionary keyed by `classId` to prevent race conditions during concurrent seat holds.
- **How I caught it:** While reviewing the Bonus requirement (Section 1.6 - running two separate backend processes on different ports against the same PostgreSQL database), I realized `SemaphoreSlim` only locks threads inside a single process and would allow overbooking across two processes.
- **How I fixed it:** I added a database transaction with a PostgreSQL row-level lock (`SELECT 1 FROM "Classes" WHERE "Id" = @classId FOR UPDATE`) before counting active holds and inserting a new `SeatHold`.

### Mistake 2: `WebApplicationFactory` Configuration Evaluation Order in xUnit Tests
- **What AI did:** In `Program.cs`, AI read `builder.Configuration["UseInMemoryDatabase"]` outside the `AddDbContext` callback. When running `dotnet test`, `WebApplicationFactory.WithWebHostBuilder` injected the test configuration *after* `Program.cs` had already registered Npgsql, causing all 5 tests to fail with `NpgsqlException: Failed to connect to 127.0.0.1:5432`.
- **How I caught it:** I inspected the xUnit stack trace when `dotnet test` failed on the first run and saw `NpgsqlDatabaseCreator.Exists()` executing instead of the EF Core InMemory provider.
- **How I fixed it:** I refactored `builder.Services.AddDbContext<AdmissionDbContext>((sp, options) => ...)` to resolve `IConfiguration` lazily from the built `IServiceProvider` and used `builder.UseSetting(...)` in the test factory, making all 5 backend tests pass in ~1 second.

### Mistake 3: Windows PowerShell UTF-8 BOM & Quote Stripping Issues
- **What AI did:** AI generated `frontend/package.json` using PowerShell `Set-Content -Encoding UTF8`, which on Windows PowerShell 5.1 prepends a UTF-8 Byte Order Mark (`0xEF,0xBB,0xBF`), causing Vite/PostCSS to throw `SyntaxError: Unexpected token` during `npm run build`.
- **How I caught it:** I caught the JSON `SyntaxError` during `npm run build` in the terminal output.
- **How I fixed it:** I used a Node.js script (`fs.writeFileSync` with UTF-8 without BOM) to normalize all project configuration and documentation files.
