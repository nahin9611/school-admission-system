using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;
using SchoolAdmission.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? Environment.GetEnvironmentVariable("DB_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Port=5432;Database=school_admission;Username=postgres;Password=postgres";

builder.Services.AddDbContext<AdmissionDbContext>((sp, options) =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var useInMemory = config["UseInMemoryDatabase"] == "true";

    if (useInMemory)
    {
        var inMemoryDbName = config["InMemoryDatabaseName"] ?? "SchoolAdmissionTestDb";
        options.UseInMemoryDatabase(inMemoryDbName)
               .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning));
    }
    else
    {
        options.UseNpgsql(connectionString);
    }
});

builder.Services.AddHostedService<HoldExpirationService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AllowAll");
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    var config = services.GetRequiredService<IConfiguration>();
    var db = services.GetRequiredService<AdmissionDbContext>();
    var isTestEnv = config["UseInMemoryDatabase"] == "true";

    const int maxRetries = 10;
    for (int attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            db.Database.EnsureCreated();
            if (!isTestEnv && !db.Classes.Any())
            {
                db.Classes.AddRange(
                    new SchoolClass { Id = "c_6morn", Name = "Class 6 - Morning Shift", TotalSeats = 120, CreatedAt = DateTime.UtcNow },
                    new SchoolClass { Id = "c_6day", Name = "Class 6 - Day Shift", TotalSeats = 100, CreatedAt = DateTime.UtcNow.AddSeconds(1) },
                    new SchoolClass { Id = "c_7morn", Name = "Class 7 - Morning Shift", TotalSeats = 80, CreatedAt = DateTime.UtcNow.AddSeconds(2) }
                );
                db.SaveChanges();
            }
            break;
        }
        catch (Exception ex)
        {
            logger.LogWarning("Waiting for database to be ready (Attempt {Attempt}/{MaxRetries}): {Message}", attempt, maxRetries, ex.Message);
            if (attempt == maxRetries) throw;
            Thread.Sleep(2000);
        }
    }
}

app.Run();

public partial class Program { }
