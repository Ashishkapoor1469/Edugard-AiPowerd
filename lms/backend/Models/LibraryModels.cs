using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using System.Text.Json.Serialization;

namespace Lms.Api.Models;

[BsonIgnoreExtraElements]
public sealed class Book
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")]
    public string? Id { get; set; }
    [BsonElement("collegeId"), BsonRepresentation(BsonType.ObjectId)] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("isbn")] public string Isbn { get; set; } = string.Empty;
    [BsonElement("title")] public string Title { get; set; } = string.Empty;
    [BsonElement("author")] public string Author { get; set; } = string.Empty;
    [BsonElement("category")] public string Category { get; set; } = string.Empty;
    [BsonElement("totalCopies")] public int TotalCopies { get; set; }
    [BsonElement("availableCopies")] public int AvailableCopies { get; set; }
    [BsonElement("shelfLocation")] public string ShelfLocation { get; set; } = string.Empty;
    [BsonElement("coverImage")] public string CoverImage { get; set; } = string.Empty;
    [BsonElement("borrowCount")] public int BorrowCount { get; set; }
    [BsonElement("isActive")] public bool IsActive { get; set; } = true;
    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class Issuance
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("collegeId"), BsonRepresentation(BsonType.ObjectId)] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("bookId"), BsonRepresentation(BsonType.ObjectId)] public string BookId { get; set; } = string.Empty;
    [BsonElement("studentId"), BsonRepresentation(BsonType.ObjectId)] public string StudentId { get; set; } = string.Empty;
    [BsonElement("degreeId"), BsonRepresentation(BsonType.ObjectId), BsonIgnoreIfNull] public string? DegreeId { get; set; }
    [BsonElement("className")] public string ClassName { get; set; } = string.Empty;
    [BsonElement("bookTitle")] public string BookTitle { get; set; } = string.Empty;
    [BsonElement("status")] public string Status { get; set; } = "active";
    [BsonElement("issueDate")] public DateTime IssueDate { get; set; } = DateTime.UtcNow;
    [BsonElement("dueDate")] public DateTime DueDate { get; set; }
    [BsonElement("returnedAt"), BsonIgnoreIfNull] public DateTime? ReturnedAt { get; set; }
    [BsonElement("renewalCount")] public int RenewalCount { get; set; }
    [BsonElement("activeSlot"), BsonIgnoreIfNull] public int? ActiveSlot { get; set; }
    [BsonElement("issueIdempotencyKey")] public string IssueIdempotencyKey { get; set; } = string.Empty;
    [BsonElement("returnIdempotencyKey"), BsonIgnoreIfNull] public string? ReturnIdempotencyKey { get; set; }
    [BsonElement("lastRenewalKey"), BsonIgnoreIfNull] public string? LastRenewalKey { get; set; }
    [BsonElement("issuedBy")] public string IssuedBy { get; set; } = string.Empty;
    [BsonElement("returnedBy"), BsonIgnoreIfNull] public string? ReturnedBy { get; set; }
    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class Reservation
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("collegeId"), BsonRepresentation(BsonType.ObjectId)] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("bookId"), BsonRepresentation(BsonType.ObjectId)] public string BookId { get; set; } = string.Empty;
    [BsonElement("studentId"), BsonRepresentation(BsonType.ObjectId)] public string StudentId { get; set; } = string.Empty;
    [BsonElement("bookTitle")] public string BookTitle { get; set; } = string.Empty;
    [BsonElement("status")] public string Status { get; set; } = "queued";
    [BsonElement("idempotencyKey")] public string IdempotencyKey { get; set; } = string.Empty;
    [BsonElement("readyAt"), BsonIgnoreIfNull] public DateTime? ReadyAt { get; set; }
    [BsonElement("expiresAt"), BsonIgnoreIfNull] public DateTime? ExpiresAt { get; set; }
    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class Fine
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("collegeId"), BsonRepresentation(BsonType.ObjectId)] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("issuanceId"), BsonRepresentation(BsonType.ObjectId)] public string IssuanceId { get; set; } = string.Empty;
    [BsonElement("studentId"), BsonRepresentation(BsonType.ObjectId)] public string StudentId { get; set; } = string.Empty;
    [BsonElement("bookTitle")] public string BookTitle { get; set; } = string.Empty;
    [BsonElement("amount"), BsonRepresentation(BsonType.Decimal128)] public decimal Amount { get; set; }
    [BsonElement("paidAmount"), BsonRepresentation(BsonType.Decimal128)] public decimal PaidAmount { get; set; }
    [BsonElement("waivedAmount"), BsonRepresentation(BsonType.Decimal128)] public decimal WaivedAmount { get; set; }
    [BsonElement("status")] public string Status { get; set; } = "unpaid";
    [BsonElement("calculatedThrough")] public DateTime CalculatedThrough { get; set; }
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class LibrarySettings
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("collegeId"), BsonRepresentation(BsonType.ObjectId)] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("defaultIssueLimit")] public int DefaultIssueLimit { get; set; } = 2;
    [BsonElement("degreeIssueLimits")] public Dictionary<string, int> DegreeIssueLimits { get; set; } = new();
    [BsonElement("loanDays")] public int LoanDays { get; set; } = 14;
    [BsonElement("dailyFineRate"), BsonRepresentation(BsonType.Decimal128)] public decimal DailyFineRate { get; set; } = 1;
    [BsonElement("fineAlertThreshold"), BsonRepresentation(BsonType.Decimal128)] public decimal FineAlertThreshold { get; set; } = 50;
    [BsonElement("importantOverdueDays")] public int ImportantOverdueDays { get; set; } = 7;
    [BsonElement("highDemandReservationThreshold")] public int HighDemandReservationThreshold { get; set; } = 3;
    [BsonElement("overdueDigest")] public string OverdueDigest { get; set; } = "daily";
    [BsonElement("catalogVersion")] public long CatalogVersion { get; set; } = 1;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class LibrarianPreferences
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("librarianId")] public string LibrarianId { get; set; } = string.Empty;
    [BsonElement("collegeId")] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("overdueDigest")] public string OverdueDigest { get; set; } = "daily";
    [BsonElement("reservationAlerts")] public bool ReservationAlerts { get; set; } = true;
    [BsonElement("fineAlerts")] public bool FineAlerts { get; set; } = true;
    [BsonElement("lowStockAlerts")] public bool LowStockAlerts { get; set; } = true;
    [BsonElement("updatedAt")] public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[BsonIgnoreExtraElements]
public sealed class LibraryAudit
{
    [BsonId, BsonRepresentation(BsonType.ObjectId), JsonPropertyName("_id")] public string? Id { get; set; }
    [BsonElement("collegeId")] public string CollegeId { get; set; } = string.Empty;
    [BsonElement("actorId")] public string ActorId { get; set; } = string.Empty;
    [BsonElement("action")] public string Action { get; set; } = string.Empty;
    [BsonElement("entityType")] public string EntityType { get; set; } = string.Empty;
    [BsonElement("entityId")] public string EntityId { get; set; } = string.Empty;
    [BsonElement("details")] public Dictionary<string, string> Details { get; set; } = new();
    [BsonElement("createdAt")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
