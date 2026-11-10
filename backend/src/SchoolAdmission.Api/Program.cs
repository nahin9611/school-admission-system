using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SchoolAdmission.Api.Data;
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
    var db = services.GetRequiredService<AdmissionDbContext>();

    const int maxRetries = 10;
    for (int attempt = 1; attempt <= maxRetries; attempt++)
    {
        try
        {
            db.Database.EnsureCreated();
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
