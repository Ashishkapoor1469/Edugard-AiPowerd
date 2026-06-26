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
