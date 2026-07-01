using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Announcement
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("collegeId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string CollegeId { get; set; } = string.Empty;

        [BsonElement("targetAudience")]
        public string TargetAudience { get; set; } = "all"; // "all", "students", "mentors", "course", "batch"

        [BsonElement("targetId")]
        public string? TargetId { get; set; } // Specific CourseName/Id or BatchName

        [BsonElement("title")]
        public string Title { get; set; } = string.Empty;

        [BsonElement("description")]
        public string Description { get; set; } = string.Empty;

        [BsonElement("attachments")]
        public List<string> Attachments { get; set; } = new();

        [BsonElement("expiryDate")]
        public DateTime? ExpiryDate { get; set; }

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
