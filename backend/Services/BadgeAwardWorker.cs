using EduGuard.Models;
using MongoDB.Driver;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Threading.Channels;

namespace EduGuard.Services;

public sealed class BadgeAwardWorker : BackgroundService
{
    private readonly MongoService _mongo;
    private readonly ILogger<BadgeAwardWorker> _logger;
    private readonly IBadgeCatalog _catalog;
    private readonly Channel<string> _queue = Channel.CreateUnbounded<string>();
    private readonly ConcurrentDictionary<string, byte> _queued = new();

    public BadgeAwardWorker(MongoService mongo, ILogger<BadgeAwardWorker> logger, IBadgeCatalog catalog) => (_mongo, _logger, _catalog) = (mongo, logger, catalog);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        System.Diagnostics.Debug.Assert(Normalize("  Business Plan Winner  ") == Normalize("business plan winner"));
        var scheduler = QueueDueStudentsAsync(stoppingToken);
        await foreach (var studentId in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try { await AwardStudentBadgesAsync(studentId, stoppingToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "Badge award check failed for {StudentId}", studentId); }
            finally { _queued.TryRemove(studentId, out _); }
        }
        await scheduler;
    }

    public bool EnsureQueued(string studentId)
    {
        if (_queued.TryAdd(studentId, 0)) _queue.Writer.TryWrite(studentId);
        return _queued.ContainsKey(studentId);
    }

    public static string Normalize(string value) => Regex.Replace(value.Trim().ToLowerInvariant(), @"\s+", " ");

    private async Task QueueDueStudentsAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                var dueBefore = DateTime.UtcNow.AddDays(-3);
                var ids = await _mongo.Students.Find(s => !s.LastBadgeCheckAt.HasValue || s.LastBadgeCheckAt <= dueBefore).Project(s => s.Id).ToListAsync(token);
                foreach (var id in ids.Where(id => id != null)) EnsureQueued(id!);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Scheduled badge scan failed"); }
            await Task.Delay(TimeSpan.FromHours(6), token);
        }
    }

    private async Task AwardStudentBadgesAsync(string studentId, CancellationToken token)
    {
        var student = await _mongo.Students.Find(s => s.Id == studentId).FirstOrDefaultAsync(token);
        if (student == null) return;
        var badges = student.EarnedBadges ?? new();
        var sourceKeys = badges.Select(b => b.SourceKey).Where(k => !string.IsNullOrWhiteSpace(k)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;

        foreach (var contribution in student.Contribution.Where(c => !string.IsNullOrWhiteSpace(c)))
        {
            var sourceKey = Normalize(contribution);
            if (!sourceKeys.Add(sourceKey)) continue;
            var classification = _catalog.ClassifyContribution(contribution);
            badges.Add(new StudentBadge
            {
                BadgeId = classification.BadgeId,
                SourceKey = sourceKey,
                Type = classification.Type,
                Color = classification.Color,
                Name = contribution.Trim(),
                Description = $"Awarded for the co-curricular achievement: {contribution.Trim()}.",
                Category = classification.Category,
                AwardedAt = now
            });
        }

        await _mongo.Students.UpdateOneAsync(s => s.Id == student.Id,
            Builders<Student>.Update.Set(s => s.EarnedBadges, badges).Set(s => s.LastBadgeCheckAt, now), cancellationToken: token);
    }

}
