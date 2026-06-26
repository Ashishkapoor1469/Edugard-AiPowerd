using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Notification
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("mentorId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string MentorId { get; set; } = string.Empty;

        [BsonElement("studentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string StudentId { get; set; } = string.Empty;

        [BsonElement("type")]
        public string Type { get; set; } = string.Empty; // "high_risk", "attendance_drop", "marks_drop", "behavior_change", "critical_alert"

        [BsonElement("message")]
        public string Message { get; set; } = string.Empty;

        [BsonElement("isRead")]
        public bool IsRead { get; set; }

        [BsonElement("priority")]
        public string Priority { get; set; } = "low"; // "low", "medium", "high", "urgent"

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
