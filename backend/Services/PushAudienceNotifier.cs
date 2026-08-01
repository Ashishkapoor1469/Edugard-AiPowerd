using MongoDB.Driver;

namespace EduGuard.Services;

public interface IPushAudienceNotifier
{
    Task NotifyStudentsAsync(string collegeId, string? className, string idempotencyPrefix, PushMessage message, CancellationToken token = default);
    Task NotifyCollegeAsync(string collegeId, string targetAudience, string? className, string idempotencyPrefix, PushMessage message, CancellationToken token = default);
}

public sealed class PushAudienceNotifier : IPushAudienceNotifier
{
    private readonly MongoService _mongo;
    private readonly IPushNotificationQueue _queue;
    public PushAudienceNotifier(MongoService mongo, IPushNotificationQueue queue) => (_mongo, _queue) = (mongo, queue);

    public async Task NotifyStudentsAsync(string collegeId, string? className, string idempotencyPrefix, PushMessage message, CancellationToken token = default)
    {
        var filter = Builders<EduGuard.Models.Student>.Filter.Eq(x => x.CollegeId, collegeId);
        if (!string.IsNullOrWhiteSpace(className)) filter &= Builders<EduGuard.Models.Student>.Filter.Eq(x => x.Class, className);
        var ids = await _mongo.Students.Find(filter).Project(x => x.Id).ToListAsync(token);
        foreach (var id in ids.Where(x => x != null)) await _queue.EnqueueAsync(id!, $"{idempotencyPrefix}:{id}", message, token);
    }

    public async Task NotifyCollegeAsync(string collegeId, string targetAudience, string? className, string idempotencyPrefix, PushMessage message, CancellationToken token = default)
    {
        var audience = targetAudience.Trim().ToLowerInvariant();
        if (audience is "all" or "student" or "students" or "class" or "batch" or "course")
            await NotifyStudentsAsync(collegeId, className, idempotencyPrefix, message, token);
        if (audience is "all" or "mentor" or "mentors")
        {
            var ids = await _mongo.Mentors.Find(x => x.CollegeId == collegeId && x.Status == "approved").Project(x => x.Id).ToListAsync(token);
            foreach (var id in ids.Where(x => x != null)) await _queue.EnqueueAsync(id!, $"{idempotencyPrefix}:{id}", message, token);
        }
    }
}
