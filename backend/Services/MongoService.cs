using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using EduGuard.Models;
using System;
using System.Threading.Tasks;

namespace EduGuard.Services
{
    public class MongoService
    {
        private readonly IMongoDatabase _database;
        private readonly ILogger<MongoService> _logger;

        public MongoService(IConfiguration configuration, ILogger<MongoService> logger)
        {
            _logger = logger;

            var connectionString = configuration.GetValue<string>("MONGO_URI") 
                ?? "mongodb://127.0.0.1:27017/eduguard";
            
            // Extract database name from connection string or default to "eduguard"
            var mongoUrl = new MongoUrl(connectionString);
            var databaseName = mongoUrl.DatabaseName ?? "eduguard";
            if (string.IsNullOrEmpty(mongoUrl.DatabaseName))
            {
                databaseName = "eduguard";
            }

            var settings = MongoClientSettings.FromConnectionString(connectionString);

            settings.ServerSelectionTimeout = TimeSpan.FromSeconds(15);
            settings.ConnectTimeout = TimeSpan.FromSeconds(15);

            var client = new MongoClient(settings);
            _database = client.GetDatabase(databaseName);

            _logger.LogInformation($"[MONGO] Connected to database: {databaseName}");

            // Seed indexes in background - don't block startup
            Task.Run(() => CreateIndexesSafe());
        }

        public IMongoCollection<Mentor> Mentors => _database.GetCollection<Mentor>("mentors");
        public IMongoCollection<Student> Students => _database.GetCollection<Student>("students");
        public IMongoCollection<Message> Messages => _database.GetCollection<Message>("messages");
        public IMongoCollection<Notification> Notifications => _database.GetCollection<Notification>("notifications");
        public IMongoCollection<College> Colleges => _database.GetCollection<College>("colleges");
        public IMongoCollection<Degree> Degrees => _database.GetCollection<Degree>("degrees");
        public IMongoCollection<Announcement> Announcements => _database.GetCollection<Announcement>("announcements");
        public IMongoCollection<Event> Events => _database.GetCollection<Event>("events");
        public IMongoCollection<Assignment> Assignments => _database.GetCollection<Assignment>("assignments");
        public IMongoCollection<Submission> Submissions => _database.GetCollection<Submission>("submissions");
        public IMongoCollection<Admin> Admins => _database.GetCollection<Admin>("admins");
        public IMongoCollection<ReportCardJob> ReportCardJobs => _database.GetCollection<ReportCardJob>("report_card_jobs");
        public IMongoCollection<Syllabus> Syllabi => _database.GetCollection<Syllabus>("syllabi");
        public IMongoCollection<ClassSummaryCache> ClassSummaryCaches => _database.GetCollection<ClassSummaryCache>("class_summary_cache");
        public IMongoCollection<AttendanceRecord> AttendanceRecords => _database.GetCollection<AttendanceRecord>("attendance_records");
        public IMongoCollection<LeadershipAssignment> LeadershipAssignments => _database.GetCollection<LeadershipAssignment>("leadership_assignments");
        public IMongoCollection<DeviceToken> DeviceTokens => _database.GetCollection<DeviceToken>("device_tokens");
        public IMongoCollection<PushNotificationJob> PushNotificationJobs => _database.GetCollection<PushNotificationJob>("push_notification_jobs");

        private void CreateIndexesSafe()
        {
            try
            {
                // Student rollNo unique index per college
                var studentRollNoKey = Builders<Student>.IndexKeys.Ascending(s => s.CollegeId).Ascending(s => s.RollNo);
                var studentRollNoOptions = new CreateIndexOptions { Unique = true, Sparse = true };
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentRollNoKey, studentRollNoOptions));

                // Student email index
                var studentEmailKey = Builders<Student>.IndexKeys.Ascending(s => s.Email);
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentEmailKey));

                // Student collegeName index
                var studentCollegeNameKey = Builders<Student>.IndexKeys.Ascending(s => s.CollegeName);
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentCollegeNameKey));

                var studentRosterKey = Builders<Student>.IndexKeys
                    .Ascending(s => s.CollegeId).Ascending(s => s.Class).Ascending(s => s.VerificationStatus);
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentRosterKey));

                // Mentor email unique index
                var mentorEmailKey = Builders<Mentor>.IndexKeys.Ascending(m => m.Email);
                var mentorEmailOptions = new CreateIndexOptions { Unique = true };
                Mentors.Indexes.CreateOne(new CreateIndexModel<Mentor>(mentorEmailKey, mentorEmailOptions));

                // Admin email unique index
                var adminEmailKey = Builders<Admin>.IndexKeys.Ascending(a => a.Email);
                var adminEmailOptions = new CreateIndexOptions { Unique = true };
                Admins.Indexes.CreateOne(new CreateIndexModel<Admin>(adminEmailKey, adminEmailOptions));

                // Message index for querying student chat history
                var messageKey = Builders<Message>.IndexKeys.Ascending(msg => msg.StudentId).Ascending(msg => msg.MentorId);
                Messages.Indexes.CreateOne(new CreateIndexModel<Message>(messageKey));

                // Notification compound index
                var notificationKey = Builders<Notification>.IndexKeys.Ascending(n => n.MentorId).Ascending(n => n.IsRead);
                Notifications.Indexes.CreateOne(new CreateIndexModel<Notification>(notificationKey));

                var classSummaryKey = Builders<ClassSummaryCache>.IndexKeys.Ascending(c => c.CacheKey);
                var classSummaryOptions = new CreateIndexOptions { Unique = true };
                ClassSummaryCaches.Indexes.CreateOne(new CreateIndexModel<ClassSummaryCache>(classSummaryKey, classSummaryOptions));

                var classSummaryExpiryKey = Builders<ClassSummaryCache>.IndexKeys.Ascending(c => c.ExpiresAt);
                var classSummaryExpiryOptions = new CreateIndexOptions { ExpireAfter = TimeSpan.Zero };
                ClassSummaryCaches.Indexes.CreateOne(new CreateIndexModel<ClassSummaryCache>(classSummaryExpiryKey, classSummaryExpiryOptions));

                var attendanceUniqueKey = Builders<AttendanceRecord>.IndexKeys
                    .Ascending(a => a.StudentId).Ascending(a => a.Date).Ascending(a => a.Session);
                AttendanceRecords.Indexes.CreateOne(new CreateIndexModel<AttendanceRecord>(attendanceUniqueKey, new CreateIndexOptions { Unique = true }));

                var attendanceClassKey = Builders<AttendanceRecord>.IndexKeys
                    .Ascending(a => a.CollegeId).Ascending(a => a.ClassId).Descending(a => a.Date).Ascending(a => a.Session);
                AttendanceRecords.Indexes.CreateOne(new CreateIndexModel<AttendanceRecord>(attendanceClassKey));

                var leadershipKey = Builders<LeadershipAssignment>.IndexKeys
                    .Ascending(a => a.CollegeId).Ascending(a => a.ClassId).Ascending(a => a.IsActive).Ascending(a => a.LeadershipType);
                LeadershipAssignments.Indexes.CreateOne(new CreateIndexModel<LeadershipAssignment>(leadershipKey));

                DeviceTokens.Indexes.CreateOne(new CreateIndexModel<DeviceToken>(
                    Builders<DeviceToken>.IndexKeys.Ascending(x => x.Token),
                    new CreateIndexOptions { Unique = true }));
                PushNotificationJobs.Indexes.CreateOne(new CreateIndexModel<PushNotificationJob>(
                    Builders<PushNotificationJob>.IndexKeys.Ascending(x => x.IdempotencyKey),
                    new CreateIndexOptions { Unique = true }));
                PushNotificationJobs.Indexes.CreateOne(new CreateIndexModel<PushNotificationJob>(
                    Builders<PushNotificationJob>.IndexKeys.Ascending(x => x.Status).Ascending(x => x.NextAttemptAt)));

                ReportCardJobs.Indexes.CreateOne(new CreateIndexModel<ReportCardJob>(
                    Builders<ReportCardJob>.IndexKeys.Ascending(x => x.IdempotencyKey),
                    new CreateIndexOptions { Unique = true, Sparse = true }));

                _logger.LogInformation("[MONGO] Indexes created successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[MONGO] Failed to create indexes (will retry on next startup). App continues to function.");
            }
        }
    }
}
