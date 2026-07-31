using System.Net.Http.Headers;
using System.Net.Http.Json;
using EduGuard.Models;
using MongoDB.Driver;

namespace EduGuard.Services;

public sealed record PushMessage(string Title, string Body, string Priority, IReadOnlyDictionary<string, string> Data);

public interface IPushNotificationSender
{
    Task SendAsync(string deviceToken, PushMessage message, CancellationToken token = default);
}

public interface IPushNotificationQueue
{
    Task EnqueueAsync(string userId, string idempotencyKey, PushMessage message, CancellationToken token = default);
}

public sealed class FirebasePushNotificationSender : IPushNotificationSender
{
    private readonly HttpClient _http;
    private readonly string _projectId;
    private readonly string _accessToken;
    private readonly ILogger<FirebasePushNotificationSender> _logger;

    public FirebasePushNotificationSender(HttpClient http, IConfiguration config, ILogger<FirebasePushNotificationSender> logger)
    {
        (_http, _logger) = (http, logger);
        _projectId = config["FCM_PROJECT_ID"] ?? string.Empty;
        _accessToken = config["FCM_ACCESS_TOKEN"] ?? string.Empty;
    }

    public async Task SendAsync(string deviceToken, PushMessage message, CancellationToken token = default)
    {
        if (string.IsNullOrEmpty(_projectId) || string.IsNullOrEmpty(_accessToken))
        {
            throw new InvalidOperationException("FCM_PROJECT_ID and FCM_ACCESS_TOKEN must be configured before push jobs can be delivered.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{_projectId}/messages:send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _accessToken);
        request.Content = JsonContent.Create(new
        {
            message = new
            {
                token = deviceToken,
                notification = new { title = message.Title, body = message.Body },
                data = message.Data.Append(new KeyValuePair<string, string>("priority", message.Priority)).ToDictionary(),
                android = new
                {
                    priority = message.Priority == "important" ? "high" : "normal",
                    notification = new { channel_id = message.Priority == "important" ? "eduguard_important" : "eduguard_normal", sound = "default" }
                }
            }
        });
        using var response = await _http.SendAsync(request, token);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"FCM returned {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(token)}");
    }
}

public sealed class PushNotificationQueue : BackgroundService, IPushNotificationQueue
{
    private readonly MongoService _mongo;
    private readonly IPushNotificationSender _sender;
    private readonly ILogger<PushNotificationQueue> _logger;

    public PushNotificationQueue(MongoService mongo, IPushNotificationSender sender, ILogger<PushNotificationQueue> logger) =>
        (_mongo, _sender, _logger) = (mongo, sender, logger);

    public async Task EnqueueAsync(string userId, string idempotencyKey, PushMessage message, CancellationToken token = default)
    {
        try
        {
            await _mongo.PushNotificationJobs.InsertOneAsync(new PushNotificationJob
            {
                UserId = userId,
                IdempotencyKey = idempotencyKey,
                Title = message.Title,
                Body = message.Body,
                Priority = message.Priority,
                Data = new Dictionary<string, string>(message.Data)
            }, cancellationToken: token);
        }
        catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
        {
            _logger.LogDebug("[PUSH] Duplicate job {Key} ignored", idempotencyKey);
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextBookScan = DateTime.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            if (DateTime.UtcNow >= nextBookScan)
            {
                await EnqueueBookRemindersAsync(stoppingToken);
                nextBookScan = DateTime.UtcNow.Date.AddDays(1).AddHours(1);
            }

            var now = DateTime.UtcNow;
            var job = await _mongo.PushNotificationJobs.FindOneAndUpdateAsync(
                x => x.Status == "pending" && x.NextAttemptAt <= now,
                Builders<PushNotificationJob>.Update.Set(x => x.Status, "processing").Set(x => x.UpdatedAt, now).Inc(x => x.Attempts, 1),
                new FindOneAndUpdateOptions<PushNotificationJob> { Sort = Builders<PushNotificationJob>.Sort.Ascending(x => x.CreatedAt), ReturnDocument = ReturnDocument.After },
                stoppingToken);
            if (job == null) { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); continue; }

            try
            {
                var tokens = await _mongo.DeviceTokens.Find(x => x.UserId == job.UserId).ToListAsync(stoppingToken);
                var message = new PushMessage(job.Title, job.Body, job.Priority, job.Data);
                foreach (var device in tokens) await _sender.SendAsync(device.Token, message, stoppingToken);
                await SetStatusAsync(job, "completed", string.Empty, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[PUSH] Job {JobId} failed", job.Id);
                var retry = job.Attempts < 3;
                await _mongo.PushNotificationJobs.UpdateOneAsync(x => x.Id == job.Id,
                    Builders<PushNotificationJob>.Update.Set(x => x.Status, retry ? "pending" : "failed")
                        .Set(x => x.Error, ex.Message).Set(x => x.NextAttemptAt, DateTime.UtcNow.AddMinutes(job.Attempts * 2)).Set(x => x.UpdatedAt, DateTime.UtcNow),
                    cancellationToken: stoppingToken);
            }
        }
    }

    private Task SetStatusAsync(PushNotificationJob job, string status, string error, CancellationToken token) =>
        _mongo.PushNotificationJobs.UpdateOneAsync(x => x.Id == job.Id,
            Builders<PushNotificationJob>.Update.Set(x => x.Status, status).Set(x => x.Error, error).Set(x => x.UpdatedAt, DateTime.UtcNow), cancellationToken: token);

    private async Task EnqueueBookRemindersAsync(CancellationToken token)
    {
        var today = DateTime.UtcNow.Date;
        var students = await _mongo.Students.Find(x => x.IssuedBooks.Any(b => b.Status == "active" && b.DueDate < today.AddDays(3))).ToListAsync(token);
        foreach (var student in students)
        foreach (var book in student.IssuedBooks.Where(x => x.Status == "active" && x.DueDate.Date < today.AddDays(3)))
        {
            var overdue = book.DueDate.Date < today;
            await EnqueueAsync(student.Id!, $"book:{student.Id}:{book.BookId}:{today:yyyyMMdd}:{(overdue ? "overdue" : "due")}",
                new PushMessage(overdue ? "Book overdue" : "Book due soon", $"{book.Title} {(overdue ? "is overdue" : $"is due {book.DueDate:dd MMM}")}.", overdue ? "important" : "normal",
                    new Dictionary<string, string> { ["type"] = overdue ? "book_overdue" : "book_due", ["path"] = "/?tab=books", ["studentId"] = student.Id! }), token);
        }
    }
}
