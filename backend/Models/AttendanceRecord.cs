using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class AttendanceRecord
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("studentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string StudentId { get; set; } = string.Empty;

        [BsonElement("collegeId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string CollegeId { get; set; } = string.Empty;

        [BsonElement("classId")]
        public string ClassId { get; set; } = string.Empty;

        [BsonElement("date")]
        public string Date { get; set; } = string.Empty;

        [BsonElement("session")]
        public string Session { get; set; } = string.Empty;

        [BsonElement("status")]
        public string Status { get; set; } = string.Empty;

        [BsonElement("markedBy")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string MarkedBy { get; set; } = string.Empty;

        [BsonElement("isLocked")]
        public bool IsLocked { get; set; } = true;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("auditHistory")]
        public List<AttendanceAuditEntry> AuditHistory { get; set; } = new();
    }

    public class AttendanceAuditEntry
    {
        [BsonElement("changedBy")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string ChangedBy { get; set; } = string.Empty;

        [BsonElement("previousStatus")]
        public string PreviousStatus { get; set; } = string.Empty;

        [BsonElement("newStatus")]
        public string NewStatus { get; set; } = string.Empty;

        [BsonElement("reason")]
        public string Reason { get; set; } = string.Empty;

        [BsonElement("changedAt")]
        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    }
}
