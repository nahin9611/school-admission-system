using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.DTOs;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
public class AdmissionController : ControllerBase
{
    private readonly AdmissionDbContext _db;
    private readonly IConfiguration _config;
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> ClassLocks = new();

    public AdmissionController(AdmissionDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    private int GetHoldDurationSeconds()
    {
        var envVal = _config["HOLD_DURATION_SECONDS"] ?? Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS");
        if (int.TryParse(envVal, out var seconds) && seconds > 0)
        {
            return seconds;
        }
        return 600;
    }

    private string? GetStudentId()
    {
        if (Request.Headers.TryGetValue("X-Student-Id", out var values))
        {
            var id = values.FirstOrDefault()?.Trim();
            if (!string.IsNullOrWhiteSpace(id))
            {
                return id;
            }
        }
        return null;
    }

    private static string FormatUtc(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : DateTime.SpecifyKind(dt, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ssZ");
    }

    private async Task ExpireStaleHoldsAsync(string? classId = null, string? studentId = null)
    {
        var now = DateTime.UtcNow;
        var query = _db.Holds.Where(h => h.Status == HoldStatus.Held && h.ExpiresAt <= now);

        if (!string.IsNullOrEmpty(classId))
            query = query.Where(h => h.ClassId == classId);

        if (!string.IsNullOrEmpty(studentId))
            query = query.Where(h => h.StudentId == studentId);

        var stale = await query.ToListAsync();
        if (stale.Count > 0)
        {
            foreach (var hold in stale)
            {
                hold.Status = HoldStatus.Expired;
            }
            await _db.SaveChangesAsync();
        }
    }

    // 1. POST /classes
    [HttpPost("/classes")]
    public async Task<IActionResult> CreateClass([FromBody] CreateClassRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { message = "Class name is required (শ্রেণীর নাম দেওয়া বাধ্যতামূলক)।" });
        }

        if (request.TotalSeats <= 0)
        {
            return BadRequest(new { message = "Total seats must be greater than 0 (আসন সংখ্যা ০ এর বেশি হতে হবে)।" });
        }

        var schoolClass = new SchoolClass
        {
            Id = $"c_{Guid.NewGuid():N}"[..10],
            Name = request.Name.Trim(),
            TotalSeats = request.TotalSeats,
            CreatedAt = DateTime.UtcNow
        };

        _db.Classes.Add(schoolClass);
        await _db.SaveChangesAsync();

        var response = new CreateClassResponse
        {
            Id = schoolClass.Id,
            Name = schoolClass.Name,
            TotalSeats = schoolClass.TotalSeats
        };

        return StatusCode(StatusCodes.Status201Created, response);
    }

    // 2. GET /classes
    [HttpGet("/classes")]
    public async Task<IActionResult> GetClasses()
    {
        await ExpireStaleHoldsAsync();
        var now = DateTime.UtcNow;

        var classes = await _db.Classes
            .AsNoTracking()
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.TotalSeats,
                HeldSeats = c.Holds.Count(h => h.Status == HoldStatus.Held && h.ExpiresAt > now),
                ConfirmedSeats = c.Holds.Count(h => h.Status == HoldStatus.Confirmed)
            })
            .ToListAsync();

        var result = classes.Select(c => new ClassSeatSummaryResponse
        {
            Id = c.Id,
            Name = c.Name,
            TotalSeats = c.TotalSeats,
            HeldSeats = c.HeldSeats,
            ConfirmedSeats = c.ConfirmedSeats,
            AvailableSeats = Math.Max(0, c.TotalSeats - c.HeldSeats - c.ConfirmedSeats)
        }).ToList();

        return Ok(result);
    }

    // 3. GET /classes/{classId}
    [HttpGet("/classes/{classId}")]
    public async Task<IActionResult> GetClassById([FromRoute] string classId)
    {
        await ExpireStaleHoldsAsync(classId: classId);
        var now = DateTime.UtcNow;

        var schoolClass = await _db.Classes
            .AsNoTracking()
            .Where(c => c.Id == classId)
            .Select(c => new
            {
                c.Id,
                c.Name,
                c.TotalSeats,
                HeldSeats = c.Holds.Count(h => h.Status == HoldStatus.Held && h.ExpiresAt > now),
                ConfirmedSeats = c.Holds.Count(h => h.Status == HoldStatus.Confirmed)
            })
            .FirstOrDefaultAsync();

        if (schoolClass == null)
        {
            return NotFound(new { message = "Class not found (শ্রেণীটি খুঁজে পাওয়া যায়নি)।" });
        }

        return Ok(new ClassSeatSummaryResponse
        {
            Id = schoolClass.Id,
            Name = schoolClass.Name,
            TotalSeats = schoolClass.TotalSeats,
            HeldSeats = schoolClass.HeldSeats,
            ConfirmedSeats = schoolClass.ConfirmedSeats,
            AvailableSeats = Math.Max(0, schoolClass.TotalSeats - schoolClass.HeldSeats - schoolClass.ConfirmedSeats)
        });
    }

    // 4. POST /classes/{classId}/holds
    [HttpPost("/classes/{classId}/holds")]
    public async Task<IActionResult> CreateHold([FromRoute] string classId)
    {
        var studentId = GetStudentId();
        if (string.IsNullOrEmpty(studentId))
        {
            return BadRequest(new { message = "X-Student-Id header is required (শিক্ষার্থীর জন্ম নিবন্ধন নম্বর প্রয়োজন)।" });
        }

        var semaphore = ClassLocks.GetOrAdd(classId, _ => new SemaphoreSlim(1, 1));
        await semaphore.WaitAsync();

        try
        {
            await using var transaction = await _db.Database.BeginTransactionAsync();

            // Multi-process database-level row lock on PostgreSQL (Bonus 1.6)
            if (_db.Database.IsNpgsql())
            {
                await _db.Database.ExecuteSqlInterpolatedAsync(
                    $"SELECT 1 FROM \"Classes\" WHERE \"Id\" = {classId} FOR UPDATE");
            }

            var schoolClass = await _db.Classes.FirstOrDefaultAsync(c => c.Id == classId);
            if (schoolClass == null)
            {
                await transaction.RollbackAsync();
                return NotFound(new { message = "Class not found (শ্রেণীটি খুঁজে পাওয়া যায়নি)।" });
            }

            var now = DateTime.UtcNow;

            // Expire any stale holds for this class inside the locked transaction
            var staleHolds = await _db.Holds
                .Where(h => h.ClassId == classId && h.Status == HoldStatus.Held && h.ExpiresAt <= now)
                .ToListAsync();

            if (staleHolds.Count > 0)
            {
                foreach (var stale in staleHolds)
                {
                    stale.Status = HoldStatus.Expired;
                }
                await _db.SaveChangesAsync();
            }

            // Rule: A student cannot have more than 1 active HELD or CONFIRMED admission in the same class
            var hasExistingActiveOrConfirmed = await _db.Holds.AnyAsync(h =>
                h.ClassId == classId &&
                h.StudentId == studentId &&
                ((h.Status == HoldStatus.Held && h.ExpiresAt > now) || h.Status == HoldStatus.Confirmed));

            if (hasExistingActiveOrConfirmed)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "এই শ্রেণীতে আপনার ইতিমধ্যে একটি চলমান আবেদন বা নিশ্চিত ভর্তি রয়েছে।" });
            }

            // Rule: held + confirmed can NEVER exceed totalSeats
            var activeHeldCount = await _db.Holds.CountAsync(h =>
                h.ClassId == classId && h.Status == HoldStatus.Held && h.ExpiresAt > now);
            var confirmedCount = await _db.Holds.CountAsync(h =>
                h.ClassId == classId && h.Status == HoldStatus.Confirmed);

            if (activeHeldCount + confirmedCount >= schoolClass.TotalSeats)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "দুঃখিত, এই শ্রেণীতে আর কোনো আসন খালি নেই (No seats available)।" });
            }

            var durationSeconds = GetHoldDurationSeconds();
            var expiresAt = now.AddSeconds(durationSeconds);

            var hold = new SeatHold
            {
                Id = $"h_{Guid.NewGuid():N}"[..10],
                ClassId = classId,
                StudentId = studentId,
                Status = HoldStatus.Held,
                ExpiresAt = expiresAt,
                CreatedAt = now
            };

            _db.Holds.Add(hold);
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            var response = new CreateHoldResponse
            {
                HoldId = hold.Id,
                ClassId = hold.ClassId,
                StudentId = hold.StudentId,
                Status = hold.Status,
                ExpiresAt = FormatUtc(hold.ExpiresAt)
            };

            return StatusCode(StatusCodes.Status201Created, response);
        }
        finally
        {
            semaphore.Release();
        }
    }

    // 5. GET /holds/{holdId}
    [HttpGet("/holds/{holdId}")]
    public async Task<IActionResult> GetHoldById([FromRoute] string holdId)
    {
        var hold = await _db.Holds.FirstOrDefaultAsync(h => h.Id == holdId);
        if (hold == null)
        {
            return NotFound(new { message = "Hold not found (আবেদনটি খুঁজে পাওয়া যায়নি)।" });
        }

        if (hold.Status == HoldStatus.Held && hold.ExpiresAt <= DateTime.UtcNow)
        {
            hold.Status = HoldStatus.Expired;
            await _db.SaveChangesAsync();
        }

        return Ok(new HoldStatusResponse
        {
            HoldId = hold.Id,
            ClassId = hold.ClassId,
            Status = hold.Status,
            ExpiresAt = FormatUtc(hold.ExpiresAt)
        });
    }

    // 6. POST /holds/{holdId}/confirm
    [HttpPost("/holds/{holdId}/confirm")]
    public async Task<IActionResult> ConfirmHold([FromRoute] string holdId)
    {
        var studentId = GetStudentId();
        if (string.IsNullOrEmpty(studentId))
        {
            return BadRequest(new { message = "X-Student-Id header is required (শিক্ষার্থীর জন্ম নিবন্ধন নম্বর প্রয়োজন)।" });
        }

        await using var transaction = await _db.Database.BeginTransactionAsync();

        var hold = await _db.Holds.FirstOrDefaultAsync(h => h.Id == holdId);
        if (hold == null)
        {
            await transaction.RollbackAsync();
            return NotFound(new { message = "Hold not found (আবেদনটি খুঁজে পাওয়া যায়নি)।" });
        }

        if (hold.StudentId != studentId)
        {
            await transaction.RollbackAsync();
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "শুধুমাত্র নিজের আবেদন নিশ্চিত করা যাবে (Cannot confirm another student's hold)।" });
        }

        // Rule: Idempotent confirmation - confirming multiple times only increments confirmedSeats once
        if (hold.Status == HoldStatus.Confirmed)
        {
            await transaction.CommitAsync();
            return Ok(new ConfirmHoldResponse
            {
                HoldId = hold.Id,
                Status = HoldStatus.Confirmed
            });
        }

        var now = DateTime.UtcNow;
        if (hold.Status == HoldStatus.Held && hold.ExpiresAt <= now)
        {
            hold.Status = HoldStatus.Expired;
            await _db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Conflict(new { message = "আবেদনের মেয়াদ শেষ হয়ে গেছে (Hold has expired)।" });
        }

        if (hold.Status != HoldStatus.Held)
        {
            await transaction.RollbackAsync();
            return Conflict(new { message = $"এই আবেদনটি নিশ্চিত করা সম্ভব নয় ( বর্তমান অবস্থা: {hold.Status} )।" });
        }

        hold.Status = HoldStatus.Confirmed;
        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(new ConfirmHoldResponse
        {
            HoldId = hold.Id,
            Status = HoldStatus.Confirmed
        });
    }

    // 7. DELETE /holds/{holdId}
    [HttpDelete("/holds/{holdId}")]
    public async Task<IActionResult> CancelHold([FromRoute] string holdId)
    {
        var studentId = GetStudentId();
        if (string.IsNullOrEmpty(studentId))
        {
            return BadRequest(new { message = "X-Student-Id header is required (শিক্ষার্থীর জন্ম নিবন্ধন নম্বর প্রয়োজন)।" });
        }

        var hold = await _db.Holds.FirstOrDefaultAsync(h => h.Id == holdId);
        if (hold == null)
        {
            return NotFound(new { message = "Hold not found (আবেদনটি খুঁজে পাওয়া যায়নি)।" });
        }

        if (hold.StudentId != studentId)
        {
            return StatusCode(StatusCodes.Status403Forbidden,
                new { message = "শুধুমাত্র নিজের আবেদন বাতিল করা যাবে (Cannot cancel another student's hold)।" });
        }

        if (hold.Status == HoldStatus.Held && hold.ExpiresAt <= DateTime.UtcNow)
        {
            hold.Status = HoldStatus.Expired;
            await _db.SaveChangesAsync();
            return Conflict(new { message = "আবেদনের মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে (Hold already expired)।" });
        }

        if (hold.Status == HoldStatus.Confirmed)
        {
            return Conflict(new { message = "নিশ্চিত হওয়া ভর্তি বাতিল করা যাবে না (Confirmed hold cannot be cancelled)।" });
        }

        if (hold.Status == HoldStatus.Held)
        {
            hold.Status = HoldStatus.Cancelled;
            await _db.SaveChangesAsync();
        }

        return NoContent();
    }

    // 8. GET /me/holds
    [HttpGet("/me/holds")]
    public async Task<IActionResult> GetMyHolds()
    {
        var studentId = GetStudentId();
        if (string.IsNullOrEmpty(studentId))
        {
            return BadRequest(new { message = "X-Student-Id header is required (শিক্ষার্থীর জন্ম নিবন্ধন নম্বর প্রয়োজন)।" });
        }

        await ExpireStaleHoldsAsync(studentId: studentId);

        var holds = await _db.Holds
            .AsNoTracking()
            .Include(h => h.SchoolClass)
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        var response = holds.Select(h => new MyHoldResponse
        {
            HoldId = h.Id,
            ClassId = h.ClassId,
            ClassName = h.SchoolClass?.Name ?? string.Empty,
            Status = h.Status,
            ExpiresAt = FormatUtc(h.ExpiresAt)
        }).ToList();

        return Ok(response);
    }
}

