using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Services;

public class HoldExpirationService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HoldExpirationService> _logger;

    public HoldExpirationService(IServiceScopeFactory scopeFactory, ILogger<HoldExpirationService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AdmissionDbContext>();
                var now = DateTime.UtcNow;

                var expiredHolds = await db.Holds
                    .Where(h => h.Status == HoldStatus.Held && h.ExpiresAt <= now)
                    .ToListAsync(stoppingToken);

                if (expiredHolds.Count > 0)
                {
                    foreach (var hold in expiredHolds)
                    {
                        hold.Status = HoldStatus.Expired;
                    }
                    await db.SaveChangesAsync(stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogDebug(ex, "Background hold expiration check skipped.");
            }

            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }
}
