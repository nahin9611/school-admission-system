using System.ComponentModel.DataAnnotations;

namespace SchoolAdmission.Api.Models;

public static class HoldStatus
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

public class SeatHold
{
    [Key]
    public string Id { get; set; } = string.Empty;

    [Required]
    public string ClassId { get; set; } = string.Empty;

    public SchoolClass? SchoolClass { get; set; }

    [Required]
    public string StudentId { get; set; } = string.Empty;

    [Required]
    public string Status { get; set; } = HoldStatus.Held;

    public DateTime ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
