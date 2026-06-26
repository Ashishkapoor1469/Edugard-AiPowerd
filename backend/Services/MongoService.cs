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

        private void CreateIndexesSafe()
        {
            try
            {
                // Student rollNo unique index
                var studentRollNoKey = Builders<Student>.IndexKeys.Ascending(s => s.RollNo);
                var studentRollNoOptions = new CreateIndexOptions { Unique = true };
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentRollNoKey, studentRollNoOptions));

                // Student email index
                var studentEmailKey = Builders<Student>.IndexKeys.Ascending(s => s.Email);
                Students.Indexes.CreateOne(new CreateIndexModel<Student>(studentEmailKey));

                // Mentor email unique index
                var mentorEmailKey = Builders<Mentor>.IndexKeys.Ascending(m => m.Email);
                var mentorEmailOptions = new CreateIndexOptions { Unique = true };
                Mentors.Indexes.CreateOne(new CreateIndexModel<Mentor>(mentorEmailKey, mentorEmailOptions));

                // Message index for querying student chat history
                var messageKey = Builders<Message>.IndexKeys.Ascending(msg => msg.StudentId).Ascending(msg => msg.MentorId);
                Messages.Indexes.CreateOne(new CreateIndexModel<Message>(messageKey));

                // Notification compound index
                var notificationKey = Builders<Notification>.IndexKeys.Ascending(n => n.MentorId).Ascending(n => n.IsRead);
                Notifications.Indexes.CreateOne(new CreateIndexModel<Notification>(notificationKey));

                _logger.LogInformation("[MONGO] Indexes created successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[MONGO] Failed to create indexes (will retry on next startup). App continues to function.");
            }
        }
    }
}
