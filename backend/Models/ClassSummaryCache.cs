using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class ClassSummaryCache
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? Id { get; set; }

        [BsonElement("cacheKey")]
        public string CacheKey { get; set; } = string.Empty;

        [BsonElement("className")]
        public string ClassName { get; set; } = string.Empty;

        [BsonElement("userRole")]
        public string? UserRole { get; set; }

        [BsonElement("userId")]
        public string? UserId { get; set; }

        [BsonElement("stats")]
        public ClassSummaryStats Stats { get; set; } = new();

        [BsonElement("subjectAverages")]
        public Dictionary<string, double> SubjectAverages { get; set; } = new(StringComparer.OrdinalIgnoreCase);

        [BsonElement("summary")]
        public string Summary { get; set; } = string.Empty;

        [BsonElement("generatedAt")]
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("expiresAt")]
        public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddHours(4);
    }

    public class ClassSummaryStats
    {
        [BsonElement("totalStudents")]
        public int TotalStudents { get; set; }

        [BsonElement("avgAttendance")]
        public double AvgAttendance { get; set; }

        [BsonElement("avgMarks")]
        public double AvgMarks { get; set; }

        [BsonElement("atRiskCount")]
        public int AtRiskCount { get; set; }

        [BsonElement("failingSubjects")]
        public List<string> FailingSubjects { get; set; } = new();
    }
}
