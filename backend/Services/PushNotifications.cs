using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
    private readonly string _staticAccessToken;
    private readonly string _serviceAccountJson;
    private readonly SemaphoreSlim _tokenLock = new(1, 1);
    private string _cachedAccessToken = string.Empty;
    private DateTime _accessTokenExpiresAt = DateTime.MinValue;
    private readonly ILogger<FirebasePushNotificationSender> _logger;

    public FirebasePushNotificationSender(HttpClient http, IConfiguration config, ILogger<FirebasePushNotificationSender> logger)
    {
        (_http, _logger) = (http, logger);
        _serviceAccountJson = config["FCM_SERVICE_ACCOUNT_JSON"] ?? string.Empty;
        _staticAccessToken = config["FCM_ACCESS_TOKEN"] ?? string.Empty;
        _projectId = config["FCM_PROJECT_ID"] ?? ReadServiceAccountValue("project_id");
    }

    public async Task SendAsync(string deviceToken, PushMessage message, CancellationToken token = default)
    {
        if (string.IsNullOrEmpty(_projectId))
        {
            throw new InvalidOperationException("FCM_PROJECT_ID or FCM_SERVICE_ACCOUNT_JSON must be configured before push jobs can be delivered.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://fcm.googleapis.com/v1/projects/{_projectId}/messages:send");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await GetAccessTokenAsync(token));
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

    private string ReadServiceAccountValue(string name)
    {
        if (string.IsNullOrWhiteSpace(_serviceAccountJson)) return string.Empty;
        using var document = JsonDocument.Parse(_serviceAccountJson);
        return document.RootElement.TryGetProperty(name, out var value) ? value.GetString() ?? string.Empty : string.Empty;
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(_serviceAccountJson))
            return !string.IsNullOrWhiteSpace(_staticAccessToken)
                ? _staticAccessToken
                : throw new InvalidOperationException("FCM_SERVICE_ACCOUNT_JSON is required for renewable Firebase credentials.");
        if (_accessTokenExpiresAt > DateTime.UtcNow.AddMinutes(5)) return _cachedAccessToken;

        await _tokenLock.WaitAsync(token);
        try
        {
            if (_accessTokenExpiresAt > DateTime.UtcNow.AddMinutes(5)) return _cachedAccessToken;
            var email = ReadServiceAccountValue("client_email");
            var privateKey = ReadServiceAccountValue("private_key");
            var tokenUri = ReadServiceAccountValue("token_uri");
            if (string.IsNullOrWhiteSpace(tokenUri)) tokenUri = "https://oauth2.googleapis.com/token";
            if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(privateKey))
                throw new InvalidOperationException("FCM_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");

            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "RS256", typ = "JWT" }));
            var payload = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
            {
                iss = email,
                scope = "https://www.googleapis.com/auth/firebase.messaging",
                aud = tokenUri,
                iat = now,
                exp = now + 3600
            }));
            var unsigned = $"{header}.{payload}";
            using var rsa = RSA.Create();
            rsa.ImportFromPem(privateKey);
            var assertion = $"{unsigned}.{Base64Url(rsa.SignData(Encoding.UTF8.GetBytes(unsigned), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))}";
            using var response = await _http.PostAsync(tokenUri, new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                ["assertion"] = assertion
            }), token);
            response.EnsureSuccessStatusCode();
            using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
            _cachedAccessToken = result.RootElement.GetProperty("access_token").GetString() ?? throw new InvalidOperationException("Google OAuth returned no access token.");
            var expiresIn = result.RootElement.TryGetProperty("expires_in", out var expiry) ? expiry.GetInt32() : 3600;
            _accessTokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn);
            return _cachedAccessToken;
        }
        finally { _tokenLock.Release(); }
    }

    private static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
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
