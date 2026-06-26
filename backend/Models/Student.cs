using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    public class ClassTest
    {
        [BsonElement("testNumber")]
        public int TestNumber { get; set; }

        [BsonElement("marks")]
        public double Marks { get; set; }

        [BsonElement("maxMarks")]
        public double MaxMarks { get; set; }
    }

    public class ExamMarks
    {
        [BsonElement("marks")]
        public double? Marks { get; set; }

        [BsonElement("maxMarks")]
        public double MaxMarks { get; set; } = 100;
    }

    public class SubjectMarks
    {
        [BsonElement("subjectName")]
        public string SubjectName { get; set; } = string.Empty;

        [BsonElement("isPractical")]
        public bool IsPractical { get; set; }

        [BsonElement("classTests")]
        public List<ClassTest> ClassTests { get; set; } = new();

        [BsonElement("midTerm")]
        public ExamMarks MidTerm { get; set; } = new() { MaxMarks = 100 };

        [BsonElement("houseExam")]
        public ExamMarks HouseExam { get; set; } = new() { MaxMarks = 100 };
    }

    [BsonIgnoreExtraElements]
    public class Student
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("rollNo")]
        public string RollNo { get; set; } = string.Empty;

        [BsonElement("name")]
        public string Name { get; set; } = string.Empty;

        [BsonElement("email")]
        public string Email { get; set; } = string.Empty;

        [BsonElement("password")]
        public string? Password { get; set; }

        [BsonElement("phoneNo")]
        public string? PhoneNo { get; set; }

        [BsonElement("isVerified")]
        public bool IsVerified { get; set; }

        [BsonElement("verificationToken")]
        public string? VerificationToken { get; set; }

        [BsonElement("course")]
        public string Course { get; set; } = string.Empty;

        [BsonElement("class")]
        public string Class { get; set; } = string.Empty;

        [BsonElement("mentorId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? MentorId { get; set; }

        [BsonElement("semester")]
        public int Semester { get; set; } = 1;

        [BsonElement("attendance")]
        public double? Attendance { get; set; }

        [BsonElement("marks")]
        public List<SubjectMarks> Marks { get; set; } = new();

        [BsonElement("behavior")]
        public string? Behavior { get; set; }

        [BsonElement("contribution")]
        public List<string> Contribution { get; set; } = new();

        [BsonElement("riskScore")]
        public double RiskScore { get; set; }

        [BsonElement("riskLevel")]
        public string RiskLevel { get; set; } = "low";

        [BsonElement("riskExplanation")]
        public string RiskExplanation { get; set; } = string.Empty;

        [BsonElement("aiImprovementPlan")]
        public string AiImprovementPlan { get; set; } = string.Empty;

        [BsonElement("notifications")]
        [BsonRepresentation(BsonType.ObjectId)]
        public List<string> Notifications { get; set; } = new();

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
