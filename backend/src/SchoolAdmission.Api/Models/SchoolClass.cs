using System.ComponentModel.DataAnnotations;

namespace SchoolAdmission.Api.Models;

public class SchoolClass
{
    [Key]
    public string Id { get; set; } = string.Empty;

    [Required]
    public string Name { get; set; } = string.Empty;

    public int TotalSeats { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<SeatHold> Holds { get; set; } = new();
}
