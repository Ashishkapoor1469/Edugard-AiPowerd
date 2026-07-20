using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class LeadershipAssignment
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

        [BsonElement("leadershipType")]
        public string LeadershipType { get; set; } = "CR";

        [BsonElement("startDate")]
        public DateTime StartDate { get; set; } = DateTime.UtcNow;

        [BsonElement("endDate")]
        public DateTime? EndDate { get; set; }

        [BsonElement("isActive")]
        public bool IsActive { get; set; } = true;

        [BsonElement("assignedBy")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string AssignedBy { get; set; } = string.Empty;
    }
}
