using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace EduGuard.Models;

[BsonIgnoreExtraElements]
public sealed class DeviceToken
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")]
    public string? Id { get; set; }
    [BsonElement("userId"), BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = string.Empty;
    [BsonElement("token")]
    public string Token { get; set; } = string.Empty;
    [BsonElement("platform")]
    public string Platform { get; set; } = "android";
    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class PushNotificationJob
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")]
    public string? Id { get; set; }
    [BsonElement("idempotencyKey")]
    public string IdempotencyKey { get; set; } = string.Empty;
    [BsonElement("userId"), BsonRepresentation(BsonType.ObjectId)]
    public string UserId { get; set; } = string.Empty;
    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;
    [BsonElement("body")]
    public string Body { get; set; } = string.Empty;
    [BsonElement("priority")]
    public string Priority { get; set; } = "normal";
    [BsonElement("data")]
    public Dictionary<string, string> Data { get; set; } = new();
    [BsonElement("status")]
    public string Status { get; set; } = "pending";
    [BsonElement("attempts")]
    public int Attempts { get; set; }
    [BsonElement("nextAttemptAt")]
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    [BsonElement("error")]
    public string Error { get; set; } = string.Empty;
    [BsonElement("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
