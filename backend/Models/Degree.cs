using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Degree
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("collegeId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string CollegeId { get; set; } = string.Empty;

        [BsonElement("name")]
        public string Name { get; set; } = string.Empty; // BCA, BBA, B.Tech, etc.

        [BsonElement("durationYears")]
        public int DurationYears { get; set; } = 3;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
