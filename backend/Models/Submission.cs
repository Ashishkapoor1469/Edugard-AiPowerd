using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Submission
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("assignmentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string AssignmentId { get; set; } = string.Empty;

        [BsonElement("studentId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string StudentId { get; set; } = string.Empty;

        [BsonElement("submittedPdfUrl")]
        public string SubmittedPdfUrl { get; set; } = string.Empty;

        [BsonElement("grade")]
        public string Grade { get; set; } = string.Empty;

        [BsonElement("feedback")]
        public string Feedback { get; set; } = string.Empty;

        [BsonElement("submittedAt")]
        public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
