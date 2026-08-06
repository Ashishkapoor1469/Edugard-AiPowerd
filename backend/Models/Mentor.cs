using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class Mentor
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("collegeId")]
        public string? CollegeId { get; set; }

        [BsonElement("assignedCourseId")]
        [BsonRepresentation(BsonType.ObjectId)]
        public string? AssignedCourseId { get; set; }

        [BsonElement("batch")]
        public string Batch { get; set; } = string.Empty;

        [BsonElement("department")]
        public string Department { get; set; } = string.Empty;

        [BsonElement("semester")]
        public int Semester { get; set; } = 1;

        [BsonElement("status")]
        public string Status { get; set; } = "approved"; // "pending_verification", "approved", "rejected", "disabled"

        [BsonElement("maxStudents")]
        public int MaxStudents { get; set; } = 50;

        [BsonElement("refreshToken")]
        public string? RefreshToken { get; set; }

        [BsonElement("refreshTokenExpiry")]
        public DateTime? RefreshTokenExpiry { get; set; }

        [BsonElement("name")]
        public string Name { get; set; } = string.Empty;


        [BsonElement("email")]
        public string Email { get; set; } = string.Empty;


        [BsonElement("password")]
        public string Password { get; set; } = string.Empty;


        [BsonElement("role")]
        public string Role { get; set; } = "mentor";


        [BsonElement("assignedClasses")]
        public List<string> AssignedClasses { get; set; } = new();


        [BsonElement("isOnline")]
        public bool IsOnline { get; set; } = false;


        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;


        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
