using MongoDB.Bson;
using MongoDB.Driver;

Console.WriteLine("=== EduGuard LMS Targeted Seeder (Chandigarh Engineering College) ===");
Console.WriteLine();

var eduguardUri = "mongodb+srv://kapoorashish714_db_user:6BwvdR5PQwQtx4uY@cluster0.qjdjvy8.mongodb.net/eduguard?retryWrites=true&w=majority";
var lmsUri = "mongodb+srv://kapoorashish714_db_user:BfPlxjWxqurQ6B3O@cluster0.eqfqbiz.mongodb.net/eduguard_lms?retryWrites=true&w=majority&appName=Cluster0";

var egSettings = MongoClientSettings.FromConnectionString(eduguardUri);
egSettings.SslSettings = new SslSettings { ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true };
egSettings.AllowInsecureTls = true;
var egClient = new MongoClient(egSettings);
var egDb = egClient.GetDatabase("eduguard");

var lmsSettings = MongoClientSettings.FromConnectionString(lmsUri);
lmsSettings.SslSettings = new SslSettings { ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true };
lmsSettings.AllowInsecureTls = true;
var lmsClient = new MongoClient(lmsSettings);
var lmsDb = lmsClient.GetDatabase("eduguard_lms");

// Target College: Chandigarh Engineering College
var cecCollegeId = "6a453bea6e6992abc402a10";
var secondCollegeId = "6a476d19895a35a0e96a2fcd";

Console.WriteLine($"[Target College ID]: {cecCollegeId} (Chandigarh Engineering College)");
Console.WriteLine($"[2nd College ID]:    {secondCollegeId} (Will remain empty in LMS)");
Console.WriteLine();

// Fetch all students from EduGuard main DB
var egStudentsColl = egDb.GetCollection<BsonDocument>("students");
var allEgStudents = await egStudentsColl.Find(new BsonDocument()).ToListAsync();
Console.WriteLine($"[EduGuard DB] Total students found in EduGuard DB: {allEgStudents.Count}");

// Collections in LMS
var booksColl = lmsDb.GetCollection<BsonDocument>("books");
var lmsStudentsColl = lmsDb.GetCollection<BsonDocument>("students");
var settingsColl = lmsDb.GetCollection<BsonDocument>("settings");
var issuancesColl = lmsDb.GetCollection<BsonDocument>("issuances");
var finesColl = lmsDb.GetCollection<BsonDocument>("fines");
var announcementsColl = lmsDb.GetCollection<BsonDocument>("announcements");

// Helper for transient network retries
static async Task ExecuteWithRetryAsync(Func<Task> action, int maxRetries = 3)
{
    for (int i = 1; i <= maxRetries; i++)
    {
        try { await action(); return; }
        catch (Exception ex) when (i < maxRetries)
        {
            Console.WriteLine($"[Retry {i}/{maxRetries}] Transient connection warning: {ex.Message}. Retrying...");
            await Task.Delay(2000);
        }
    }
}

// Clean up 2nd college data and synthetic test IDs from LMS
await ExecuteWithRetryAsync(async () => await booksColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));
await ExecuteWithRetryAsync(async () => await lmsStudentsColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));
await ExecuteWithRetryAsync(async () => await settingsColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));
await ExecuteWithRetryAsync(async () => await issuancesColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));
await ExecuteWithRetryAsync(async () => await finesColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));
await ExecuteWithRetryAsync(async () => await announcementsColl.DeleteManyAsync(new BsonDocument("collegeId", new BsonDocument("$ne", cecCollegeId))));

Console.WriteLine("[LMS DB] Cleaned up 2nd college and synthetic test IDs");

// 1. Seed Library Settings for CEC
await settingsColl.ReplaceOneAsync(
    new BsonDocument("collegeId", cecCollegeId),
    new BsonDocument
    {
        ["collegeId"] = cecCollegeId,
        ["defaultIssueLimit"] = 2,
        ["degreeIssueLimits"] = new BsonDocument { ["BCA"] = 3, ["B.Tech CSE"] = 4, ["M.Tech"] = 5 },
        ["loanDays"] = 14,
        ["maxRenewalCount"] = 1,
        ["dailyFineRate"] = 5,
        ["fineAlertThreshold"] = 50,
        ["importantOverdueDays"] = 7,
        ["holidays"] = new BsonArray { "2026-08-15", "2026-10-02", "2026-12-25" },
        ["catalogVersion"] = 1,
        ["updatedAt"] = DateTime.UtcNow
    },
    new ReplaceOptions { IsUpsert = true }
);
Console.WriteLine("[LMS DB] Library settings seeded for Chandigarh Engineering College");

// 2. Seed LMS Students using exact EduGuard student IDs & details
int seededCount = 0;
foreach (var s in allEgStudents)
{
    var sId = s["_id"].ToString()!;
    var name = s.Contains("name") ? s["name"].AsString : "Student";
    var email = s.Contains("email") ? s["email"].AsString : "";
    var rollNo = s.Contains("rollNo") ? s["rollNo"].AsString : "DCR-2024-000";
    var phoneNo = s.Contains("phoneNo") ? s["phoneNo"].AsString : "9876543210";
    var course = s.Contains("course") ? s["course"].AsString : "BCA";
    var className = s.Contains("class") ? s["class"].AsString : "BCA-A";
    var semester = s.Contains("semester") ? s["semester"].AsInt32 : 3;

    await lmsStudentsColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = cecCollegeId, ["eduGuardStudentId"] = sId },
        new BsonDocument
        {
            ["collegeId"] = cecCollegeId,
            ["eduGuardStudentId"] = sId,
            ["name"] = name,
            ["rollNo"] = rollNo,
            ["email"] = email,
            ["phoneNo"] = phoneNo,
            ["course"] = course,
            ["className"] = className,
            ["semester"] = semester,
            ["registeredBy"] = "6a453bea6e6992abc402a15",
            ["registeredAt"] = DateTime.UtcNow,
            ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    );
    seededCount++;
}
Console.WriteLine($"[LMS DB] Seeded {seededCount} student library profiles matching EduGuard DB");

// 3. Seed 30 Books for Chandigarh Engineering College
var catalogData = new (string isbn, string title, string author, string category, string dept, string lang, string pub, string ed, int copies, string shelf)[]
{
    ("9780262046305", "Introduction to Algorithms", "Thomas H. Cormen", "Computer Science", "Computer Science", "English", "MIT Press", "4th Edition", 5, "CS-A1"),
    ("9780078022159", "Database System Concepts", "Abraham Silberschatz", "Databases", "Computer Science", "English", "McGraw-Hill", "7th Edition", 4, "CS-B1"),
    ("9780132350884", "Clean Code", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 3, "CS-C1"),
    ("9780134685991", "Effective Java", "Joshua Bloch", "Programming", "Computer Science", "English", "Addison-Wesley", "3rd Edition", 4, "CS-A2"),
    ("9780201633610", "Design Patterns", "Erich Gamma, Richard Helm", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "1st Edition", 3, "CS-C2"),
    ("9780131103627", "The C Programming Language", "Brian W. Kernighan, Dennis M. Ritchie", "Programming", "Computer Science", "English", "Prentice Hall", "2nd Edition", 5, "CS-A3"),
    ("9780136006633", "Artificial Intelligence: A Modern Approach", "Stuart Russell, Peter Norvig", "Artificial Intelligence", "Computer Science", "English", "Pearson", "4th Edition", 4, "AI-A1"),
    ("9780596009205", "Head First Design Patterns", "Eric Freeman", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-C3"),
    ("9780133591620", "Operating System Concepts", "Abraham Silberschatz", "Operating Systems", "Computer Science", "English", "Wiley", "10th Edition", 4, "OS-A1"),
    ("9780132143011", "Computer Networking", "James F. Kurose", "Networking", "Computer Science", "English", "Pearson", "8th Edition", 4, "NET-A1"),
    ("9781449331818", "Learning Python", "Mark Lutz", "Programming", "Computer Science", "English", "O'Reilly Media", "5th Edition", 4, "CS-P1"),
    ("9780135957059", "The Pragmatic Programmer", "David Thomas, Andrew Hunt", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "2nd Edition", 3, "CS-C4"),
    ("9780321573513", "Algorithms", "Robert Sedgewick", "Data Structures", "Computer Science", "English", "Addison-Wesley", "4th Edition", 3, "CS-A4"),
    ("9780070669253", "Discrete Mathematics", "Kenneth H. Rosen", "Mathematics", "Computer Science", "English", "McGraw-Hill", "8th Edition", 5, "MATH-B1"),
    ("9780134093413", "Thomas' Calculus", "Joel R. Hass", "Mathematics", "Sciences", "English", "Pearson", "14th Edition", 4, "MATH-C1"),
    ("9780262035613", "Deep Learning", "Ian Goodfellow", "Artificial Intelligence", "Computer Science", "English", "MIT Press", "1st Edition", 4, "AI-C1"),
    ("9781491957660", "Python Data Science Handbook", "Jake VanderPlas", "Artificial Intelligence", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "AI-P1"),
    ("9780596520687", "JavaScript: The Good Parts", "Douglas Crockford", "Web Development", "Computer Science", "English", "O'Reilly Media", "1st Edition", 3, "WEB-A1"),
    ("9781491950296", "Building Microservices", "Sam Newman", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-M1"),
    ("9780132354165", "Clean Architecture", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 4, "CS-C5"),
    ("9780070151024", "Principles of Marketing", "Philip Kotler", "Business Management", "Management", "English", "Pearson", "18th Edition", 5, "MGT-A1"),
    ("9780070659179", "Organizational Behavior", "Stephen P. Robbins", "Business Management", "Management", "English", "Pearson", "19th Edition", 4, "MGT-B1"),
    ("9781119456339", "Financial Accounting", "Ambrish Gupta", "Accounting", "Commerce", "English", "Pearson", "6th Edition", 4, "COM-A1"),
    ("9780321982384", "Linear Algebra", "David C. Lay", "Mathematics", "Sciences", "English", "Pearson", "5th Edition", 3, "MATH-A1"),
    ("9780134444321", "English Grammar & Composition", "Wren & Martin", "English", "Humanities", "English", "S. Chand", "Revised", 5, "ENG-A1"),
    ("9780140449136", "The Mahabharata", "C. Rajagopalachari", "Literature", "Humanities", "English", "Bharatiya Vidya Bhavan", "1st Edition", 4, "LIT-A1"),
    ("9780143031031", "Wings of Fire", "A.P.J. Abdul Kalam", "Literature", "Humanities", "English", "Universities Press", "1st Edition", 5, "LIT-C1"),
    ("9781491954461", "Designing Data-Intensive Applications", "Martin Kleppmann", "Databases", "Computer Science", "English", "O'Reilly Media", "1st Edition", 4, "CS-D4"),
    ("9780073523323", "Database Management Systems", "Raghu Ramakrishnan", "Databases", "Computer Science", "English", "McGraw-Hill", "3rd Edition", 4, "CS-D2"),
    ("9781492051299", "Learning React", "Alex Banks", "Web Development", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "WEB-R1"),
};

var bookIdx = 0;
foreach (var b in catalogData)
{
    var physicalCopies = new BsonArray();
    for (int i = 1; i <= b.copies; i++)
    {
        var status = (i == 1 && bookIdx % 4 == 0) ? "issued" : (i == b.copies && bookIdx % 7 == 0) ? "reserved" : "available";
        physicalCopies.Add(new BsonDocument
        {
            ["accessionNumber"] = $"{b.isbn.Replace("-", "")}-{i:D3}",
            ["barcode"] = $"BC-{b.isbn.Replace("-", "")}-{i:D3}",
            ["status"] = status,
            ["shelfLocation"] = b.shelf,
            ["conditionNotes"] = "Good condition",
            ["addedAt"] = DateTime.UtcNow.AddDays(-60)
        });
    }

    var available = physicalCopies.Count(c => c.AsBsonDocument["status"] == "available");
    await booksColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = cecCollegeId, ["isbn"] = b.isbn },
        new BsonDocument
        {
            ["collegeId"] = cecCollegeId,
            ["isbn"] = b.isbn,
            ["title"] = b.title,
            ["author"] = b.author,
            ["category"] = b.category,
            ["department"] = b.dept,
            ["language"] = b.lang,
            ["publisher"] = b.pub,
            ["edition"] = b.ed,
            ["totalCopies"] = b.copies,
            ["availableCopies"] = available,
            ["shelfLocation"] = b.shelf,
            ["borrowCount"] = b.copies * 3,
            ["physicalCopies"] = physicalCopies,
            ["isActive"] = true,
            ["createdAt"] = DateTime.UtcNow.AddDays(-60),
            ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    );
    bookIdx++;
}
Console.WriteLine($"[LMS DB] Seeded {catalogData.Length} books with physical accession copies for Chandigarh Engineering College");

// 4. Seed Announcements
await announcementsColl.ReplaceOneAsync(
    new BsonDocument { ["collegeId"] = cecCollegeId, ["title"] = "Mid-Semester Book Return Drive" },
    new BsonDocument
    {
        ["collegeId"] = cecCollegeId,
        ["title"] = "Mid-Semester Book Return Drive",
        ["content"] = "Please return or renew all borrowed books before the mid-semester examinations. Late fine waivers available for prompt returns.",
        ["targetAudience"] = "all",
        ["createdBy"] = "Rajesh Kumar (Head Librarian)",
        ["createdAt"] = DateTime.UtcNow.AddDays(-2)
    },
    new ReplaceOptions { IsUpsert = true }
);

Console.WriteLine();
Console.WriteLine("=== FINAL VERIFICATION ===");
Console.WriteLine($"[LMS DB] Chandigarh Engineering College Books:       {await booksColl.CountDocumentsAsync(new BsonDocument("collegeId", cecCollegeId))}");
Console.WriteLine($"[LMS DB] Chandigarh Engineering College Students:    {await lmsStudentsColl.CountDocumentsAsync(new BsonDocument("collegeId", cecCollegeId))}");
Console.WriteLine($"[LMS DB] 2nd College (Dronacharya PG) Books:         {await booksColl.CountDocumentsAsync(new BsonDocument("collegeId", secondCollegeId))}");
Console.WriteLine($"[LMS DB] 2nd College (Dronacharya PG) Students:      {await lmsStudentsColl.CountDocumentsAsync(new BsonDocument("collegeId", secondCollegeId))}");
Console.WriteLine();
Console.WriteLine("=== SEEDING COMPLETED SUCCESSFULLY ===");
