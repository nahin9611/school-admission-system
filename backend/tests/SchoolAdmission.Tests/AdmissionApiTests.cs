using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SchoolAdmission.Api.DTOs;
using Xunit;

namespace SchoolAdmission.Tests;

public class AdmissionApiTests
{
    private static WebApplicationFactory<Program> CreateTestFactory(int holdDurationSeconds = 600)
    {
        var dbName = $"TestDb_{Guid.NewGuid():N}";

        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("UseInMemoryDatabase", "true");
            builder.UseSetting("InMemoryDatabaseName", dbName);
            builder.UseSetting("HOLD_DURATION_SECONDS", holdDurationSeconds.ToString());
        });
    }

    [Fact]
    public async Task ConcurrencyTest_50SimultaneousHoldRequestsFor5Seats_NeverExceedsTotalSeats()
    {
        await using var factory = CreateTestFactory(holdDurationSeconds: 600);
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new CreateClassRequest
        {
            Name = "Class 6 - Morning Shift",
            TotalSeats = 5
        });
        Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();
        Assert.NotNull(createdClass);

        const int concurrentRequests = 50;
        var tasks = Enumerable.Range(1, concurrentRequests).Select(async i =>
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass!.Id}/holds");
            var studentId = $"2015269123456{i:D4}";
            req.Headers.Add("X-Student-Id", studentId);
            return await client.SendAsync(req);
        });

        var responses = await Task.WhenAll(tasks);

        var successCount = responses.Count(r => r.StatusCode == HttpStatusCode.Created);
        var conflictCount = responses.Count(r => r.StatusCode == HttpStatusCode.Conflict);

        Assert.Equal(5, successCount);
        Assert.Equal(45, conflictCount);

        var summary = await client.GetFromJsonAsync<ClassSeatSummaryResponse>($"/classes/{createdClass.Id}");
        Assert.NotNull(summary);
        Assert.Equal(5, summary!.TotalSeats);
        Assert.Equal(5, summary.HeldSeats);
        Assert.Equal(0, summary.ConfirmedSeats);
        Assert.Equal(0, summary.AvailableSeats);
        Assert.True(summary.HeldSeats + summary.ConfirmedSeats <= summary.TotalSeats);
    }

    [Fact]
    public async Task DuplicateHold_SameStudentInSameClass_Returns409Conflict()
    {
        await using var factory = CreateTestFactory();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new CreateClassRequest
        {
            Name = "Class 6 - Day Shift",
            TotalSeats = 10
        });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();

        const string studentId = "20152691234567890";

        using var req1 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass!.Id}/holds");
        req1.Headers.Add("X-Student-Id", studentId);
        var res1 = await client.SendAsync(req1);
        Assert.Equal(HttpStatusCode.Created, res1.StatusCode);

        using var req2 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        req2.Headers.Add("X-Student-Id", studentId);
        var res2 = await client.SendAsync(req2);
        Assert.Equal(HttpStatusCode.Conflict, res2.StatusCode);
    }

    [Fact]
    public async Task IdempotentConfirm_ConfirmingSameHoldMultipleTimes_IncrementsConfirmedSeatsOnlyOnce()
    {
        await using var factory = CreateTestFactory();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new CreateClassRequest
        {
            Name = "Class 7 - Morning Shift",
            TotalSeats = 10
        });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();

        const string studentId = "20152691234567891";

        using var holdReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass!.Id}/holds");
        holdReq.Headers.Add("X-Student-Id", studentId);
        var holdRes = await client.SendAsync(holdReq);
        var hold = await holdRes.Content.ReadFromJsonAsync<CreateHoldResponse>();

        for (int i = 0; i < 3; i++)
        {
            using var confirmReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{hold!.HoldId}/confirm");
            confirmReq.Headers.Add("X-Student-Id", studentId);
            var confirmRes = await client.SendAsync(confirmReq);
            Assert.Equal(HttpStatusCode.OK, confirmRes.StatusCode);

            var confirmBody = await confirmRes.Content.ReadFromJsonAsync<ConfirmHoldResponse>();
            Assert.Equal("CONFIRMED", confirmBody!.Status);
        }

        var summary = await client.GetFromJsonAsync<ClassSeatSummaryResponse>($"/classes/{createdClass.Id}");
        Assert.Equal(1, summary!.ConfirmedSeats);
        Assert.Equal(0, summary.HeldSeats);
        Assert.Equal(9, summary.AvailableSeats);
    }

    [Fact]
    public async Task HoldExpiration_AutomaticallyReleasesSeat_AndPreventsLateConfirmation()
    {
        await using var factory = CreateTestFactory(holdDurationSeconds: 1);
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new CreateClassRequest
        {
            Name = "Class 8 - Morning Shift",
            TotalSeats = 1
        });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();

        const string student1 = "20152691234560001";
        const string student2 = "20152691234560002";

        using var holdReq1 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass!.Id}/holds");
        holdReq1.Headers.Add("X-Student-Id", student1);
        var holdRes1 = await client.SendAsync(holdReq1);
        Assert.Equal(HttpStatusCode.Created, holdRes1.StatusCode);
        var hold1 = await holdRes1.Content.ReadFromJsonAsync<CreateHoldResponse>();

        await Task.Delay(1500);

        using var confirmReq = new HttpRequestMessage(HttpMethod.Post, $"/holds/{hold1!.HoldId}/confirm");
        confirmReq.Headers.Add("X-Student-Id", student1);
        var confirmRes = await client.SendAsync(confirmReq);
        Assert.Equal(HttpStatusCode.Conflict, confirmRes.StatusCode);

        var holdStatus = await client.GetFromJsonAsync<HoldStatusResponse>($"/holds/{hold1.HoldId}");
        Assert.Equal("EXPIRED", holdStatus!.Status);

        using var holdReq2 = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass.Id}/holds");
        holdReq2.Headers.Add("X-Student-Id", student2);
        var holdRes2 = await client.SendAsync(holdReq2);
        Assert.Equal(HttpStatusCode.Created, holdRes2.StatusCode);
    }

    [Fact]
    public async Task CancelHold_OwnerCancels_Returns204AndReleasesSeatImmediately()
    {
        await using var factory = CreateTestFactory();
        using var client = factory.CreateClient();

        var createRes = await client.PostAsJsonAsync("/classes", new CreateClassRequest
        {
            Name = "Class 9 - Morning Shift",
            TotalSeats = 1
        });
        var createdClass = await createRes.Content.ReadFromJsonAsync<CreateClassResponse>();

        const string studentId = "20152691234569999";

        using var holdReq = new HttpRequestMessage(HttpMethod.Post, $"/classes/{createdClass!.Id}/holds");
        holdReq.Headers.Add("X-Student-Id", studentId);
        var holdRes = await client.SendAsync(holdReq);
        var hold = await holdRes.Content.ReadFromJsonAsync<CreateHoldResponse>();

        using var cancelReq = new HttpRequestMessage(HttpMethod.Delete, $"/holds/{hold!.HoldId}");
        cancelReq.Headers.Add("X-Student-Id", studentId);
        var cancelRes = await client.SendAsync(cancelReq);
        Assert.Equal(HttpStatusCode.NoContent, cancelRes.StatusCode);

        var summary = await client.GetFromJsonAsync<ClassSeatSummaryResponse>($"/classes/{createdClass.Id}");
        Assert.Equal(1, summary!.AvailableSeats);
        Assert.Equal(0, summary.HeldSeats);

        var myHoldsReq = new HttpRequestMessage(HttpMethod.Get, "/me/holds");
        myHoldsReq.Headers.Add("X-Student-Id", studentId);
        var myHoldsRes = await client.SendAsync(myHoldsReq);
        var myHolds = await myHoldsRes.Content.ReadFromJsonAsync<List<MyHoldResponse>>();
        Assert.Single(myHolds!);
        Assert.Equal("CANCELLED", myHolds![0].Status);
    }
}
