using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Syllabus
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("collegeId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string CollegeId { get; set; } = string.Empty;

        [BsonElement("course")]
        public string Course { get; set; } = string.Empty; // e.g. "BCA", "BBA"

        [BsonElement("subjects")]
        public List<SyllabusSubject> Subjects { get; set; } = new();

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class SyllabusSubject
    {
        [BsonElement("semester")]
        public int Semester { get; set; }

        [BsonElement("subjectCode")]
        public string SubjectCode { get; set; } = string.Empty;

        [BsonElement("subjectName")]
        public string SubjectName { get; set; } = string.Empty;

        [BsonElement("credits")]
        public int Credits { get; set; }

        [BsonElement("description")]
        public string Description { get; set; } = string.Empty;
    }
}
