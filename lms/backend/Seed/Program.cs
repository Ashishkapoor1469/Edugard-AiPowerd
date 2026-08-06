using MongoDB.Bson;
using MongoDB.Driver;

Console.WriteLine("=== EduGuard + LMS Seeder (Different Degrees, Students & Books per College) ===");
Console.WriteLine();

var eduguardUri = "mongodb+srv://kapoorashish714_db_user:6BwvdR5PQwQtx4uY@cluster0.qjdjvy8.mongodb.net/eduguard?retryWrites=true&w=majority";
var lmsUri = "mongodb+srv://kapoorashish714_db_user:BfPlxjWxqurQ6B3O@cluster0.eqfqbiz.mongodb.net/eduguard_lms?retryWrites=true&w=majority&appName=Cluster0";

var egSettings = MongoClientSettings.FromConnectionString(eduguardUri);
egSettings.SslSettings = new SslSettings { EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12, ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true };
egSettings.AllowInsecureTls = true;
egSettings.ServerSelectionTimeout = TimeSpan.FromSeconds(15);
var egClient = new MongoClient(egSettings);
var egDb = egClient.GetDatabase("eduguard");

var lmsSettings = MongoClientSettings.FromConnectionString(lmsUri);
lmsSettings.SslSettings = new SslSettings { EnabledSslProtocols = System.Security.Authentication.SslProtocols.Tls12, ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true };
lmsSettings.AllowInsecureTls = true;
lmsSettings.ServerSelectionTimeout = TimeSpan.FromSeconds(15);
var lmsClient = new MongoClient(lmsSettings);
var lmsDb = lmsClient.GetDatabase("eduguard_lms");

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

// Collections in EduGuard DB
var egStudentsColl = egDb.GetCollection<BsonDocument>("students");
var egDegreesColl = egDb.GetCollection<BsonDocument>("degrees");

// Collections in LMS DB
var booksColl = lmsDb.GetCollection<BsonDocument>("books");
var lmsStudentsColl = lmsDb.GetCollection<BsonDocument>("students");
var settingsColl = lmsDb.GetCollection<BsonDocument>("settings");
var issuancesColl = lmsDb.GetCollection<BsonDocument>("issuances");
var finesColl = lmsDb.GetCollection<BsonDocument>("fines");
var announcementsColl = lmsDb.GetCollection<BsonDocument>("announcements");

// =========================================================================
// COLLEGE 1: Chandigarh Engineering College (6a453bea6e6992abc402a10)
// =========================================================================
var cecId = "6a453bea6e6992abc402a10";
Console.WriteLine("=== 1. Chandigarh Engineering College (Tech & Engineering Focus) ===");

// 1A. Degrees for CEC
await ExecuteWithRetryAsync(async () => await egDegreesColl.DeleteManyAsync(new BsonDocument("collegeId", new ObjectId(cecId))));
var cecDegrees = new (string name, int years)[]
{
    ("B.Tech CSE", 4),
    ("B.Tech ECE", 4),
    ("BCA", 3),
    ("MCA", 2),
    ("M.Tech", 2)
};
foreach (var d in cecDegrees)
{
    await ExecuteWithRetryAsync(async () => await egDegreesColl.InsertOneAsync(new BsonDocument
    {
        ["collegeId"] = new ObjectId(cecId),
        ["name"] = d.name,
        ["durationYears"] = d.years,
        ["createdAt"] = DateTime.UtcNow,
        ["updatedAt"] = DateTime.UtcNow
    }));
}
Console.WriteLine("  [EduGuard DB] Seeded 5 Engineering & Tech degrees (B.Tech CSE, B.Tech ECE, BCA, MCA, M.Tech)");

// 1B. Fetch existing 15 students for CEC from EduGuard
var filterCecStudents = new BsonDocument("$or", new BsonArray
{
    new BsonDocument("collegeId", cecId),
    new BsonDocument("collegeId", new ObjectId(cecId))
});
var cecEgStudents = await egStudentsColl.Find(filterCecStudents).ToListAsync();

// 1C. LMS Settings for CEC
await ExecuteWithRetryAsync(async () => await settingsColl.ReplaceOneAsync(
    new BsonDocument("collegeId", cecId),
    new BsonDocument
    {
        ["collegeId"] = cecId,
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
));

// 1D. LMS Students for CEC (15 Students)
int cecLmsCount = 0;
foreach (var s in cecEgStudents)
{
    var sId = s["_id"].ToString()!;
    await ExecuteWithRetryAsync(async () => await lmsStudentsColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = cecId, ["eduGuardStudentId"] = sId },
        new BsonDocument
        {
            ["collegeId"] = cecId,
            ["eduGuardStudentId"] = sId,
            ["name"] = s.Contains("name") ? s["name"].AsString : "Student",
            ["rollNo"] = s.Contains("rollNo") ? s["rollNo"].AsString : "CEC-2024-001",
            ["email"] = s.Contains("email") ? s["email"].AsString : "",
            ["phoneNo"] = s.Contains("phoneNo") ? s["phoneNo"].AsString : "9876543210",
            ["course"] = s.Contains("course") ? s["course"].AsString : "B.Tech CSE",
            ["className"] = s.Contains("class") ? s["class"].AsString : "CS-5A",
            ["semester"] = s.Contains("semester") ? s["semester"].AsInt32 : 5,
            ["registeredBy"] = "6a453bea6e6992abc402a15",
            ["registeredAt"] = DateTime.UtcNow,
            ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    ));
    cecLmsCount++;
}
Console.WriteLine($"  [LMS DB] Seeded {cecLmsCount} student library profiles");

// 1E. Engineering & CS Book Catalog for CEC (30 Titles)
var cecBooks = new (string isbn, string title, string author, string category, string dept, string lang, string pub, string ed, int copies, string shelf)[]
{
    ("9780262046305", "Introduction to Algorithms", "Thomas H. Cormen", "Computer Science", "Computer Science", "English", "MIT Press", "4th Edition", 5, "CS-A1"),
    ("9780078022159", "Database System Concepts", "Abraham Silberschatz", "Databases", "Computer Science", "English", "McGraw-Hill", "7th Edition", 4, "CS-B1"),
    ("9780132350884", "Clean Code", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 3, "CS-C1"),
    ("9780134685991", "Effective Java", "Joshua Bloch", "Programming", "Computer Science", "English", "Addison-Wesley", "3rd Edition", 4, "CS-A2"),
    ("9780201633610", "Design Patterns", "Erich Gamma, Richard Helm", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "1st Edition", 3, "CS-C2"),
    ("9780131103627", "The C Programming Language", "Brian W. Kernighan", "Programming", "Computer Science", "English", "Prentice Hall", "2nd Edition", 5, "CS-A3"),
    ("9780136006633", "Artificial Intelligence: A Modern Approach", "Stuart Russell", "Artificial Intelligence", "Computer Science", "English", "Pearson", "4th Edition", 4, "AI-A1"),
    ("9780596009205", "Head First Design Patterns", "Eric Freeman", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-C3"),
    ("9780133591620", "Operating System Concepts", "Abraham Silberschatz", "Operating Systems", "Computer Science", "English", "Wiley", "10th Edition", 4, "OS-A1"),
    ("9780132143011", "Computer Networking", "James F. Kurose", "Networking", "Computer Science", "English", "Pearson", "8th Edition", 4, "NET-A1"),
    ("9781449331818", "Learning Python", "Mark Lutz", "Programming", "Computer Science", "English", "O'Reilly Media", "5th Edition", 4, "CS-P1"),
    ("9780135957059", "The Pragmatic Programmer", "David Thomas", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "2nd Edition", 3, "CS-C4"),
    ("9780321573513", "Algorithms", "Robert Sedgewick", "Data Structures", "Computer Science", "English", "Addison-Wesley", "4th Edition", 3, "CS-A4"),
    ("9780262035613", "Deep Learning", "Ian Goodfellow", "Artificial Intelligence", "Computer Science", "English", "MIT Press", "1st Edition", 4, "AI-C1"),
    ("9781491957660", "Python Data Science Handbook", "Jake VanderPlas", "Artificial Intelligence", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "AI-P1"),
    ("9780596520687", "JavaScript: The Good Parts", "Douglas Crockford", "Web Development", "Computer Science", "English", "O'Reilly Media", "1st Edition", 3, "WEB-A1"),
    ("9781491950296", "Building Microservices", "Sam Newman", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-M1"),
    ("9780132354165", "Clean Architecture", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 4, "CS-C5"),
    ("9781491954461", "Designing Data-Intensive Applications", "Martin Kleppmann", "Databases", "Computer Science", "English", "O'Reilly Media", "1st Edition", 4, "CS-D4"),
    ("9780073523323", "Database Management Systems", "Raghu Ramakrishnan", "Databases", "Computer Science", "English", "McGraw-Hill", "3rd Edition", 4, "CS-D2"),
    ("9781492051299", "Learning React", "Alex Banks", "Web Development", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "WEB-R1"),
    ("9780134686097", "Computer Systems: A Programmer's Perspective", "Randal E. Bryant", "Operating Systems", "Computer Science", "English", "Pearson", "3rd Edition", 3, "OS-B1"),
    ("9780132126953", "Modern Operating Systems", "Andrew S. Tanenbaum", "Operating Systems", "Computer Science", "English", "Pearson", "4th Edition", 4, "OS-C1"),
    ("9780133937664", "Software Engineering", "Ian Sommerville", "Software Engineering", "Computer Science", "English", "Pearson", "10th Edition", 4, "CS-S1"),
    ("9780134757599", "Refactoring", "Martin Fowler", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "2nd Edition", 3, "CS-R1")
};

int cecBookIdx = 0;
foreach (var b in cecBooks)
{
    var physicalCopies = new BsonArray();
    for (int i = 1; i <= b.copies; i++)
    {
        var status = (i == 1 && cecBookIdx % 4 == 0) ? "issued" : (i == b.copies && cecBookIdx % 7 == 0) ? "reserved" : "available";
        physicalCopies.Add(new BsonDocument
        {
            ["accessionNumber"] = $"{b.isbn.Replace("-", "")}-{i:D3}",
            ["barcode"] = $"BC-{b.isbn.Replace("-", "")}-{i:D3}",
            ["status"] = status, ["shelfLocation"] = b.shelf,
            ["conditionNotes"] = "Good condition", ["addedAt"] = DateTime.UtcNow.AddDays(-60)
        });
    }

    var available = physicalCopies.Count(c => c.AsBsonDocument["status"] == "available");
    await ExecuteWithRetryAsync(async () => await booksColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = cecId, ["isbn"] = b.isbn },
        new BsonDocument
        {
            ["collegeId"] = cecId, ["isbn"] = b.isbn, ["title"] = b.title, ["author"] = b.author,
            ["category"] = b.category, ["department"] = b.dept, ["language"] = b.lang,
            ["publisher"] = b.pub, ["edition"] = b.ed, ["totalCopies"] = b.copies,
            ["availableCopies"] = available, ["shelfLocation"] = b.shelf,
            ["borrowCount"] = b.copies * 3, ["physicalCopies"] = physicalCopies,
            ["isActive"] = true, ["createdAt"] = DateTime.UtcNow.AddDays(-60), ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    ));
    cecBookIdx++;
}
Console.WriteLine($"  [LMS DB] Seeded {cecBooks.Length} Computer Science & Engineering titles");

// =========================================================================
// COLLEGE 2: Dronacharya PG College Rait (6a476d19895a35a0e96a2fcd)
// =========================================================================
var dcrId = "6a476d19895a35a0e96a2fcd";
Console.WriteLine();
Console.WriteLine("=== 2. Dronacharya PG College Rait (Business, Commerce & Arts Focus) ===");

// 2A. Degrees for DCR
await ExecuteWithRetryAsync(async () => await egDegreesColl.DeleteManyAsync(new BsonDocument("collegeId", new ObjectId(dcrId))));
var dcrDegrees = new (string name, int years)[]
{
    ("BBA", 3),
    ("B.Com", 3),
    ("BA", 3),
    ("MBA", 2),
    ("M.Com", 2)
};
foreach (var d in dcrDegrees)
{
    await ExecuteWithRetryAsync(async () => await egDegreesColl.InsertOneAsync(new BsonDocument
    {
        ["collegeId"] = new ObjectId(dcrId),
        ["name"] = d.name,
        ["durationYears"] = d.years,
        ["createdAt"] = DateTime.UtcNow,
        ["updatedAt"] = DateTime.UtcNow
    }));
}
Console.WriteLine("  [EduGuard DB] Seeded 5 Business & Commerce degrees (BBA, B.Com, BA, MBA, M.Com)");

// 2B. 12 Distinct Students for DCR
var dcrStudentNames = new (string name, string course, string className, int semester, string email)[]
{
    ("Aarav Sharma", "BBA", "BBA-1A", 1, "aarav.s@dronacharya.eduguard.com"),
    ("Ananya Verma", "BBA", "BBA-3A", 3, "ananya.v@dronacharya.eduguard.com"),
    ("Sneha Patel", "B.Com", "BCOM-2B", 2, "sneha.p@dronacharya.eduguard.com"),
    ("Vikram Singh", "BA", "BA-3A", 3, "vikram.s@dronacharya.eduguard.com"),
    ("Divya Joshi", "BBA", "BBA-5B", 5, "divya.j@dronacharya.eduguard.com"),
    ("Aditya Saxena", "B.Com", "BCOM-4A", 4, "aditya.s@dronacharya.eduguard.com"),
    ("Meera Das", "BA", "BA-1B", 1, "meera.d@dronacharya.eduguard.com"),
    ("Manish Kumar", "BBA", "BBA-1A", 1, "manish.k@dronacharya.eduguard.com"),
    ("Amit Shah", "B.Com", "BCOM-6A", 6, "amit.s@dronacharya.eduguard.com"),
    ("Simran Kaur", "BA", "BA-5A", 5, "simran.k@dronacharya.eduguard.com"),
    ("Priya Sen", "MBA", "MBA-1A", 1, "priya.s@dronacharya.eduguard.com"),
    ("Karan Kapoor", "M.Com", "MCOM-2A", 2, "karan.k@dronacharya.eduguard.com")
};

var filterDcrStudents = new BsonDocument("$or", new BsonArray
{
    new BsonDocument("collegeId", dcrId),
    new BsonDocument("collegeId", new ObjectId(dcrId))
});

for (int i = 0; i < dcrStudentNames.Length; i++)
{
    var s = dcrStudentNames[i];
    var rollNo = $"DCR-2024-{200 + i}";

    var existingInEg = await egStudentsColl.Find(new BsonDocument("email", s.email)).FirstOrDefaultAsync();
    string egStudentId;
    if (existingInEg == null)
    {
        var doc = new BsonDocument
        {
            ["collegeId"] = new ObjectId(dcrId),
            ["name"] = s.name,
            ["email"] = s.email,
            ["rollNo"] = rollNo,
            ["phoneNo"] = $"98765433{10 + i}",
            ["course"] = s.course,
            ["class"] = s.className,
            ["semester"] = s.semester,
            ["verificationStatus"] = "approved",
            ["isVerified"] = true,
            ["password"] = "$2a$11$4d6hYhC9s27ar0BsSIRFXOQDeP5OJSUb7W.p/xnes.9I93fxfdkmS", // Student@123
            ["createdAt"] = DateTime.UtcNow
        };
        await ExecuteWithRetryAsync(async () => await egStudentsColl.InsertOneAsync(doc));
        egStudentId = doc["_id"].ToString()!;
    }
    else
    {
        egStudentId = existingInEg["_id"].ToString()!;
    }

    // Seed LMS Student Profile for DCR
    await ExecuteWithRetryAsync(async () => await lmsStudentsColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = dcrId, ["eduGuardStudentId"] = egStudentId },
        new BsonDocument
        {
            ["collegeId"] = dcrId,
            ["eduGuardStudentId"] = egStudentId,
            ["name"] = s.name,
            ["rollNo"] = rollNo,
            ["email"] = s.email,
            ["phoneNo"] = $"98765433{10 + i}",
            ["course"] = s.course,
            ["className"] = s.className,
            ["semester"] = s.semester,
            ["registeredBy"] = "6a476d19895a35a0e96a2fce",
            ["registeredAt"] = DateTime.UtcNow,
            ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    ));
}
var dcrEgStudents = await egStudentsColl.Find(filterDcrStudents).ToListAsync();
Console.WriteLine($"  [EduGuard DB & LMS DB] Seeded {dcrEgStudents.Count} distinct students for Dronacharya PG College Rait");

// 2C. LMS Settings for DCR
await ExecuteWithRetryAsync(async () => await settingsColl.ReplaceOneAsync(
    new BsonDocument("collegeId", dcrId),
    new BsonDocument
    {
        ["collegeId"] = dcrId,
        ["defaultIssueLimit"] = 2,
        ["degreeIssueLimits"] = new BsonDocument { ["BBA"] = 3, ["B.Com"] = 3, ["MBA"] = 4, ["M.Com"] = 4 },
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
));

// 2D. Business, Management & Humanities Book Catalog for DCR (20 Titles)
var dcrBooks = new (string isbn, string title, string author, string category, string dept, string lang, string pub, string ed, int copies, string shelf)[]
{
    ("9780070151024", "Principles of Marketing", "Philip Kotler", "Business Management", "Management", "English", "Pearson", "18th Edition", 5, "MGT-A1"),
    ("9780070659179", "Organizational Behavior", "Stephen P. Robbins", "Business Management", "Management", "English", "Pearson", "19th Edition", 4, "MGT-B1"),
    ("9781119456339", "Financial Accounting for Management", "Ambrish Gupta", "Accounting", "Commerce", "English", "Pearson", "6th Edition", 4, "COM-A1"),
    ("9780321982384", "Linear Algebra and Its Applications", "David C. Lay", "Mathematics", "Sciences", "English", "Pearson", "5th Edition", 3, "MATH-A1"),
    ("9780070669253", "Discrete Mathematics and Its Applications", "Kenneth H. Rosen", "Mathematics", "Sciences", "English", "McGraw-Hill", "8th Edition", 5, "MATH-B1"),
    ("9780134093413", "Thomas' Calculus", "Joel R. Hass", "Mathematics", "Sciences", "English", "Pearson", "14th Edition", 4, "MATH-C1"),
    ("9780134444321", "High School English Grammar & Composition", "Wren & Martin", "English", "Humanities", "English", "S. Chand", "Revised Edition", 5, "ENG-A1"),
    ("9780140449136", "The Mahabharata", "C. Rajagopalachari", "Literature", "Humanities", "English", "Bharatiya Vidya Bhavan", "1st Edition", 4, "LIT-A1"),
    ("9788172234980", "The Discovery of India", "Jawaharlal Nehru", "Literature", "Humanities", "English", "Penguin India", "1st Edition", 3, "LIT-B1"),
    ("9780143031031", "Wings of Fire: An Autobiography", "A.P.J. Abdul Kalam", "Literature", "Humanities", "English", "Universities Press", "1st Edition", 5, "LIT-C1"),
    ("9780070151025", "Strategic Management & Business Policy", "Thomas L. Wheelen", "Business Management", "Management", "English", "Pearson", "15th Edition", 4, "MGT-C1"),
    ("9780070151026", "Corporate Finance", "Stephen A. Ross", "Finance", "Commerce", "English", "McGraw-Hill", "12th Edition", 4, "COM-B1"),
    ("9780070151027", "Managerial Economics", "Dominick Salvatore", "Economics", "Management", "English", "Oxford Press", "8th Edition", 4, "MGT-D1"),
    ("9780070151028", "Human Resource Management", "Gary Dessler", "Business Management", "Management", "English", "Pearson", "16th Edition", 5, "MGT-E1"),
    ("9780070151029", "Cost Accounting: A Managerial Emphasis", "Charles T. Horngren", "Accounting", "Commerce", "English", "Pearson", "15th Edition", 4, "COM-C1"),
    ("9780070151030", "Business Law", "M.C. Kuchhal", "Law", "Commerce", "English", "Vikas Publishing", "7th Edition", 3, "COM-D1"),
    ("9780070151031", "Indian Economy", "Ramesh Singh", "Economics", "Humanities", "English", "McGraw-Hill", "13th Edition", 5, "ECO-A1"),
    ("9780070151032", "Macroeconomics", "N. Gregory Mankiw", "Economics", "Humanities", "English", "Cengage", "10th Edition", 4, "ECO-B1"),
    ("9780070151033", "Microeconomics", "Robert Pindyck", "Economics", "Humanities", "English", "Pearson", "9th Edition", 4, "ECO-C1"),
    ("9780070151034", "Operations Management", "Jay Heizer", "Business Management", "Management", "English", "Pearson", "12th Edition", 3, "MGT-F1")
};

int dcrBookIdx = 0;
foreach (var b in dcrBooks)
{
    var physicalCopies = new BsonArray();
    for (int i = 1; i <= b.copies; i++)
    {
        var status = (i == 1 && dcrBookIdx % 4 == 0) ? "issued" : (i == b.copies && dcrBookIdx % 7 == 0) ? "reserved" : "available";
        physicalCopies.Add(new BsonDocument
        {
            ["accessionNumber"] = $"{b.isbn.Replace("-", "")}-{i:D3}",
            ["barcode"] = $"BC-{b.isbn.Replace("-", "")}-{i:D3}",
            ["status"] = status, ["shelfLocation"] = b.shelf,
            ["conditionNotes"] = "Good condition", ["addedAt"] = DateTime.UtcNow.AddDays(-60)
        });
    }

    var available = physicalCopies.Count(c => c.AsBsonDocument["status"] == "available");
    await ExecuteWithRetryAsync(async () => await booksColl.ReplaceOneAsync(
        new BsonDocument { ["collegeId"] = dcrId, ["isbn"] = b.isbn },
        new BsonDocument
        {
            ["collegeId"] = dcrId, ["isbn"] = b.isbn, ["title"] = b.title, ["author"] = b.author,
            ["category"] = b.category, ["department"] = b.dept, ["language"] = b.lang,
            ["publisher"] = b.pub, ["edition"] = b.ed, ["totalCopies"] = b.copies,
            ["availableCopies"] = available, ["shelfLocation"] = b.shelf,
            ["borrowCount"] = b.copies * 3, ["physicalCopies"] = physicalCopies,
            ["isActive"] = true, ["createdAt"] = DateTime.UtcNow.AddDays(-60), ["updatedAt"] = DateTime.UtcNow
        },
        new ReplaceOptions { IsUpsert = true }
    ));
    dcrBookIdx++;
}
Console.WriteLine($"  [LMS DB] Seeded {dcrBooks.Length} Business, Management & Arts titles");

Console.WriteLine();
Console.WriteLine("=== FINAL VERIFICATION ===");
Console.WriteLine($"[1. Chandigarh Engineering College ({cecId})]:");
Console.WriteLine($"  EduGuard Degrees:   {await egDegreesColl.CountDocumentsAsync(new BsonDocument("collegeId", new ObjectId(cecId)))} (B.Tech CSE, B.Tech ECE, BCA, MCA, M.Tech)");
Console.WriteLine($"  EduGuard Students:  {await egStudentsColl.CountDocumentsAsync(filterCecStudents)}");
Console.WriteLine($"  LMS Students:       {await lmsStudentsColl.CountDocumentsAsync(new BsonDocument("collegeId", cecId))}");
Console.WriteLine($"  LMS Books:          {await booksColl.CountDocumentsAsync(new BsonDocument("collegeId", cecId))} (CS & Engineering catalog)");

Console.WriteLine();
Console.WriteLine($"[2. Dronacharya PG College Rait ({dcrId})]:");
Console.WriteLine($"  EduGuard Degrees:   {await egDegreesColl.CountDocumentsAsync(new BsonDocument("collegeId", new ObjectId(dcrId)))} (BBA, B.Com, BA, MBA, M.Com)");
Console.WriteLine($"  EduGuard Students:  {await egStudentsColl.CountDocumentsAsync(filterDcrStudents)}");
Console.WriteLine($"  LMS Students:       {await lmsStudentsColl.CountDocumentsAsync(new BsonDocument("collegeId", dcrId))}");
Console.WriteLine($"  LMS Books:          {await booksColl.CountDocumentsAsync(new BsonDocument("collegeId", dcrId))} (Business & Commerce catalog)");

Console.WriteLine();
Console.WriteLine("=== SEEDING COMPLETED SUCCESSFULLY FOR BOTH COLLEGES WITH DISTINCT DEGREES & DATA ===");
