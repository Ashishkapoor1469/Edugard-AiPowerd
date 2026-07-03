using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EduGuard.Models
{
    [BsonIgnoreExtraElements]
    public class College
    {
        [BsonId]
        [BsonRepresentation(BsonType.ObjectId)]
        [JsonPropertyName("_id")]
        public string? Id { get; set; }

        [BsonElement("name")]
        public string Name { get; set; } = string.Empty;

        [BsonElement("location")]
        public string Location { get; set; } = string.Empty;

        [BsonElement("address")]
        public string Address { get; set; } = string.Empty;

        [BsonElement("facilities")]
        public List<string> Facilities { get; set; } = new();

        [BsonElement("website")]
        public string Website { get; set; } = string.Empty;

        [BsonElement("isBlocked")]
        public bool IsBlocked { get; set; } = false;

        [BsonElement("contactInfo")]
        public string ContactInfo { get; set; } = string.Empty;

        [BsonElement("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [BsonElement("updatedAt")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
