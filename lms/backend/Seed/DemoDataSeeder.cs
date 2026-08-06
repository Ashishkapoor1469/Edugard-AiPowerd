using Lms.Api.Data;
using Lms.Api.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Lms.Api.Seed;

public static class DemoDataSeeder
{
    public const string DemoCollegeId = "650000000000000000000001";
    public const string DemoCollegeName = "Dronacharya College of Engineering";
    public const string DemoAdminId = "650000000000000000000010";
    public const string DemoLibrarian1Id = "650000000000000000000020";
    public const string DemoLibrarian2Id = "650000000000000000000021";

    public static async Task SeedAsync(LmsMongoContext db, string targetCollegeId = DemoCollegeId, CancellationToken token = default)
    {
        // Find all colleges present in the database to ensure every logged in college gets sample data
        var collegeIds = new HashSet<string> { targetCollegeId, DemoCollegeId };
        
        var existingBookColleges = await db.Books.Distinct(x => x.CollegeId, Builders<Book>.Filter.Empty).ToListAsync(token);
        var existingSettingColleges = await db.Settings.Distinct(x => x.CollegeId, Builders<LibrarySettings>.Filter.Empty).ToListAsync(token);
        var existingStudentColleges = await db.Students.Distinct(x => x.CollegeId, Builders<LibraryStudent>.Filter.Empty).ToListAsync(token);
        
        foreach (var c in existingBookColleges) if (!string.IsNullOrEmpty(c)) collegeIds.Add(c);
        foreach (var c in existingSettingColleges) if (!string.IsNullOrEmpty(c)) collegeIds.Add(c);
        foreach (var c in existingStudentColleges) if (!string.IsNullOrEmpty(c)) collegeIds.Add(c);

        foreach (var collegeId in collegeIds)
        {
            await SeedCollegeDataAsync(db, collegeId, token);
        }
    }

    private static async Task SeedCollegeDataAsync(LmsMongoContext db, string collegeId, CancellationToken token)
    {
        // 1. Seed Library Settings
        var existingSettings = await db.Settings.Find(x => x.CollegeId == collegeId).FirstOrDefaultAsync(token);
        if (existingSettings == null)
        {
            var settings = new LibrarySettings
            {
                CollegeId = collegeId,
                DefaultIssueLimit = 2,
                DegreeIssueLimits = new Dictionary<string, int>
                {
                    ["BCA"] = 3,
                    ["B.Tech Computer Science"] = 4,
                    ["M.Tech"] = 5
                },
                LoanDays = 14,
                MaxRenewalCount = 1,
                DailyFineRate = 5,
                FineAlertThreshold = 50,
                ImportantOverdueDays = 7,
                Holidays = new List<string> { "2026-08-15", "2026-10-02", "2026-12-25" },
                CatalogVersion = 1,
                UpdatedAt = DateTime.UtcNow
            };
            await db.Settings.InsertOneAsync(settings, cancellationToken: token);
        }

        // 2. Seed 20 Students
        var studentNames = new[]
        {
            ("Ashish Kapoor", "BCA", "BCA-3A", 3, "ashish.k@eduguard.local", "9876543210"),
            ("Riya Sharma", "B.Tech Computer Science", "CS-5B", 5, "riya.s@eduguard.local", "9876543211"),
            ("Aarav Mehta", "BCA", "BCA-1A", 1, "aarav.m@eduguard.local", "9876543212"),
            ("Ananya Verma", "BBA", "BBA-3A", 3, "ananya.v@eduguard.local", "9876543213"),
            ("Rohan Gupta", "B.Tech Computer Science", "CS-7A", 7, "rohan.g@eduguard.local", "9876543214"),
            ("Sneha Patel", "B.Com", "BCOM-2B", 2, "sneha.p@eduguard.local", "9876543215"),
            ("Vikram Singh", "BA", "BA-3A", 3, "vikram.s@eduguard.local", "9876543216"),
            ("Pooja Nair", "BCA", "BCA-5A", 5, "pooja.n@eduguard.local", "9876543217"),
            ("Karan Malhotra", "B.Tech Computer Science", "CS-3A", 3, "karan.m@eduguard.local", "9876543218"),
            ("Divya Joshi", "BBA", "BBA-5B", 5, "divya.j@eduguard.local", "9876543219"),
            ("Siddharth Rao", "B.Tech Computer Science", "CS-1A", 1, "siddharth.r@eduguard.local", "9876543220"),
            ("Kavya Reddy", "BCA", "BCA-3B", 3, "kavya.r@eduguard.local", "9876543221"),
            ("Aditya Saxena", "B.Com", "BCOM-4A", 4, "aditya.s@eduguard.local", "9876543222"),
            ("Meera Das", "BA", "BA-1B", 1, "meera.d@eduguard.local", "9876543223"),
            ("Varun Chaudhry", "B.Tech Computer Science", "CS-5A", 5, "varun.c@eduguard.local", "9876543224"),
            ("Ishita Banerjee", "BCA", "BCA-1B", 1, "ishita.b@eduguard.local", "9876543225"),
            ("Manish Kumar", "BBA", "BBA-1A", 1, "manish.k@eduguard.local", "9876543226"),
            ("Neha Pandey", "B.Tech Computer Science", "CS-3B", 3, "neha.p@eduguard.local", "9876543227"),
            ("Amit Shah", "B.Com", "BCOM-6A", 6, "amit.s@eduguard.local", "9876543228"),
            ("Simran Kaur", "BA", "BA-5A", 5, "simran.k@eduguard.local", "9876543229")
        };

        var studentIds = new List<string>();
        for (var i = 0; i < studentNames.Length; i++)
        {
            var (name, course, className, semester, email, phone) = studentNames[i];
            var eduguardId = $"6500000000000000000001{(i + 1):D2}";
            studentIds.Add(eduguardId);
            var rollNo = $"DCR-2024-{(100 + i)}";

            var update = Builders<LibraryStudent>.Update
                .Set(x => x.Name, name)
                .Set(x => x.RollNo, rollNo)
                .Set(x => x.Email, email)
                .Set(x => x.PhoneNo, phone)
                .Set(x => x.Course, course)
                .Set(x => x.ClassName, className)
                .Set(x => x.Semester, semester)
                .Set(x => x.UpdatedAt, DateTime.UtcNow)
                .SetOnInsert(x => x.CollegeId, collegeId)
                .SetOnInsert(x => x.EduGuardStudentId, eduguardId)
                .SetOnInsert(x => x.RegisteredBy, DemoLibrarian1Id)
                .SetOnInsert(x => x.RegisteredAt, DateTime.UtcNow);

            await db.Students.UpdateOneAsync(
                x => x.CollegeId == collegeId && x.EduGuardStudentId == eduguardId,
                update,
                new UpdateOptions { IsUpsert = true },
                token);
        }

        // 3. Seed 50 Books with Physical Copies
        var catalogData = new[]
        {
            ("9780262046305", "Introduction to Algorithms", "Thomas H. Cormen", "Computer Science", "Computer Science", "English", "MIT Press", "4th Edition", 5, "CS-A1"),
            ("9780078022159", "Database System Concepts", "Abraham Silberschatz", "Databases", "Computer Science", "English", "McGraw-Hill", "7th Edition", 4, "CS-B1"),
            ("9780132350884", "Clean Code: A Handbook of Agile Software Craftsmanship", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 3, "CS-C1"),
            ("9780134685991", "Effective Java", "Joshua Bloch", "Programming", "Computer Science", "English", "Addison-Wesley", "3rd Edition", 4, "CS-A2"),
            ("9780201633610", "Design Patterns: Elements of Reusable Object-Oriented Software", "Erich Gamma, Richard Helm", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "1st Edition", 3, "CS-C2"),
            ("9780131103627", "The C Programming Language", "Brian W. Kernighan, Dennis M. Ritchie", "Programming", "Computer Science", "English", "Prentice Hall", "2nd Edition", 5, "CS-A3"),
            ("9780136006633", "Artificial Intelligence: A Modern Approach", "Stuart Russell, Peter Norvig", "Artificial Intelligence", "Computer Science", "English", "Pearson", "4th Edition", 4, "AI-A1"),
            ("9780596009205", "Head First Design Patterns", "Eric Freeman, Elisabeth Robson", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-C3"),
            ("9780133591620", "Operating System Concepts", "Abraham Silberschatz, Peter B. Galvin", "Operating Systems", "Computer Science", "English", "Wiley", "10th Edition", 4, "OS-A1"),
            ("9780132143011", "Computer Networking: A Top-Down Approach", "James F. Kurose, Keith W. Ross", "Networking", "Computer Science", "English", "Pearson", "8th Edition", 4, "NET-A1"),
            ("9781449331818", "Learning Python", "Mark Lutz", "Programming", "Computer Science", "English", "O'Reilly Media", "5th Edition", 4, "CS-P1"),
            ("9780135957059", "The Pragmatic Programmer", "David Thomas, Andrew Hunt", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "2nd Edition", 3, "CS-C4"),
            ("9780321573513", "Algorithms", "Robert Sedgewick, Kevin Wayne", "Data Structures", "Computer Science", "English", "Addison-Wesley", "4th Edition", 3, "CS-A4"),
            ("9780262162098", "Structure and Interpretation of Computer Programs", "Harold Abelson, Gerald Jay Sussman", "Programming", "Computer Science", "English", "MIT Press", "2nd Edition", 2, "CS-P2"),
            ("9780134494166", "Compilers: Principles, Techniques, and Tools", "Alfred V. Aho, Monica S. Lam", "Computer Science", "Computer Science", "English", "Pearson", "2nd Edition", 3, "CS-B2"),
            ("9781119456339", "Financial Accounting for Management", "Ambrish Gupta", "Accounting", "Commerce", "English", "Pearson", "6th Edition", 4, "COM-A1"),
            ("9780070151024", "Principles of Marketing", "Philip Kotler, Gary Armstrong", "Business Management", "Management", "English", "Pearson", "18th Edition", 5, "MGT-A1"),
            ("9780070659179", "Organizational Behavior", "Stephen P. Robbins", "Business Management", "Management", "English", "Pearson", "19th Edition", 4, "MGT-B1"),
            ("9780321982384", "Linear Algebra and Its Applications", "David C. Lay", "Mathematics", "Sciences", "English", "Pearson", "5th Edition", 3, "MATH-A1"),
            ("9780070669253", "Discrete Mathematics and Its Applications", "Kenneth H. Rosen", "Mathematics", "Computer Science", "English", "McGraw-Hill", "8th Edition", 5, "MATH-B1"),
            ("9780134093413", "Thomas' Calculus", "Joel R. Hass, Christopher E. Heil", "Mathematics", "Sciences", "English", "Pearson", "14th Edition", 4, "MATH-C1"),
            ("9780387310732", "Pattern Recognition and Machine Learning", "Christopher M. Bishop", "Artificial Intelligence", "Computer Science", "English", "Springer", "1st Edition", 3, "AI-B1"),
            ("9780262035613", "Deep Learning", "Ian Goodfellow, Yoshua Bengio, Aaron Courville", "Artificial Intelligence", "Computer Science", "English", "MIT Press", "1st Edition", 4, "AI-C1"),
            ("9781491957660", "Python Data Science Handbook", "Jake VanderPlas", "Artificial Intelligence", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "AI-P1"),
            ("9780596520687", "JavaScript: The Good Parts", "Douglas Crockford", "Web Development", "Computer Science", "English", "O'Reilly Media", "1st Edition", 3, "WEB-A1"),
            ("9781491950296", "Building Microservices", "Sam Newman", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "CS-M1"),
            ("9780321125217", "Domain-Driven Design", "Eric Evans", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "1st Edition", 2, "CS-D1"),
            ("9780132354165", "Clean Architecture", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 4, "CS-C5"),
            ("9780596007126", "Head First Object-Oriented Analysis and Design", "Brett D. McLaughlin", "Software Engineering", "Computer Science", "English", "O'Reilly Media", "1st Edition", 3, "CS-O1"),
            ("9781449331825", "Python Cookbook", "David Beazley, Brian K. Jones", "Programming", "Computer Science", "English", "O'Reilly Media", "3rd Edition", 3, "CS-P3"),
            ("9780134686097", "Computer Systems: A Programmer's Perspective", "Randal E. Bryant, David R. O'Hallaron", "Operating Systems", "Computer Science", "English", "Pearson", "3rd Edition", 3, "OS-B1"),
            ("9780132126953", "Modern Operating Systems", "Andrew S. Tanenbaum", "Operating Systems", "Computer Science", "English", "Pearson", "4th Edition", 4, "OS-C1"),
            ("9780133937664", "Software Engineering", "Ian Sommerville", "Software Engineering", "Computer Science", "English", "Pearson", "10th Edition", 4, "CS-S1"),
            ("9780137081073", "The DevOps Handbook", "Gene Kim, Jez Humble", "Software Engineering", "Computer Science", "English", "IT Revolution Press", "2nd Edition", 3, "CS-V1"),
            ("9780134757599", "Refactoring: Improving the Design of Existing Code", "Martin Fowler", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "2nd Edition", 3, "CS-R1"),
            ("9780073523323", "Database Management Systems", "Raghu Ramakrishnan, Johannes Gehrke", "Databases", "Computer Science", "English", "McGraw-Hill", "3rd Edition", 4, "CS-D2"),
            ("9780321565785", "SQL Queries for Mere Mortals", "John L. Viescas", "Databases", "Computer Science", "English", "Addison-Wesley", "4th Edition", 3, "CS-D3"),
            ("9781491954461", "Designing Data-Intensive Applications", "Martin Kleppmann", "Databases", "Computer Science", "English", "O'Reilly Media", "1st Edition", 4, "CS-D4"),
            ("9780132316811", "Introduction to High Performance Computing", "Victor Eijkhout", "Computer Science", "Computer Science", "English", "Lulu.com", "2nd Edition", 2, "CS-H1"),
            ("9780134685992", "Java Concurrency in Practice", "Brian Goetz", "Programming", "Computer Science", "English", "Addison-Wesley", "1st Edition", 3, "CS-J1"),
            ("9780137081074", "Continuous Delivery", "Jez Humble, David Farley", "Software Engineering", "Computer Science", "English", "Addison-Wesley", "1st Edition", 3, "CS-CD1"),
            ("9780132350885", "Clean Agile: Back to Basics", "Robert C. Martin", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 3, "CS-CA1"),
            ("9780321656568", "Working Effectively with Legacy Code", "Michael Feathers", "Software Engineering", "Computer Science", "English", "Prentice Hall", "1st Edition", 2, "CS-L1"),
            ("9781449373320", "Designing Web APIs", "Brenda Jin, Saurabh Sahni", "Web Development", "Computer Science", "English", "O'Reilly Media", "1st Edition", 3, "WEB-B1"),
            ("9781492051299", "Learning React", "Alex Banks, Eve Porcello", "Web Development", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "WEB-R1"),
            ("9781491956229", "Full Stack Development with Node & React", "Ethan Brown", "Web Development", "Computer Science", "English", "O'Reilly Media", "2nd Edition", 3, "WEB-F1"),
            ("9780134444321", "High School English Grammar & Composition", "Wren & Martin", "English", "Humanities", "English", "S. Chand", "Revised Edition", 5, "ENG-A1"),
            ("9780140449136", "The Mahabharata", "C. Rajagopalachari", "Literature", "Humanities", "English", "Bharatiya Vidya Bhavan", "1st Edition", 4, "LIT-A1"),
            ("9788172234980", "The Discovery of India", "Jawaharlal Nehru", "Literature", "Humanities", "English", "Penguin India", "1st Edition", 3, "LIT-B1"),
            ("9780143031031", "Wings of Fire: An Autobiography", "A.P.J. Abdul Kalam", "Literature", "Humanities", "English", "Universities Press", "1st Edition", 5, "LIT-C1")
        };

        var seededBooks = new List<Book>();
        foreach (var tuple in catalogData)
        {
            var (isbn, title, author, category, dept, lang, pub, ed, copies, shelf) = tuple;
            var existingBook = await db.Books.Find(x => x.CollegeId == collegeId && x.Isbn == isbn).FirstOrDefaultAsync(token);
            
            var physicalCopies = Enumerable.Range(1, copies).Select(i => new PhysicalCopy
            {
                AccessionNumber = $"{isbn.Replace("-", "")}-{i:D3}",
                Barcode = $"BC-{isbn.Replace("-", "")}-{i:D3}",
                Status = i == 1 && seededBooks.Count % 4 == 0 ? "issued" : i == copies && seededBooks.Count % 7 == 0 ? "reserved" : "available",
                ShelfLocation = shelf,
                ConditionNotes = "Good condition",
                AddedAt = DateTime.UtcNow.AddDays(-60)
            }).ToList();

            var available = physicalCopies.Count(c => c.Status == "available");

            if (existingBook == null)
            {
                var newBook = new Book
                {
                    CollegeId = collegeId,
                    Isbn = isbn,
                    Title = title,
                    Author = author,
                    Category = category,
                    Department = dept,
                    Language = lang,
                    Publisher = pub,
                    Edition = ed,
                    TotalCopies = copies,
                    AvailableCopies = available,
                    ShelfLocation = shelf,
                    BorrowCount = copies * 3,
                    PhysicalCopies = physicalCopies,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow.AddDays(-60),
                    UpdatedAt = DateTime.UtcNow
                };
                await db.Books.InsertOneAsync(newBook, cancellationToken: token);
                seededBooks.Add(newBook);
            }
            else
            {
                existingBook.Department = dept;
                existingBook.Language = lang;
                existingBook.Publisher = pub;
                existingBook.Edition = ed;
                if (existingBook.PhysicalCopies == null || existingBook.PhysicalCopies.Count == 0)
                {
                    existingBook.PhysicalCopies = physicalCopies;
                }
                await db.Books.ReplaceOneAsync(x => x.Id == existingBook.Id, existingBook, cancellationToken: token);
                seededBooks.Add(existingBook);
            }
        }

        // 4. Seed Sample Issuances, Fines, Reservations, & Announcements
        if (seededBooks.Count >= 5 && studentIds.Count >= 5)
        {
            // Issuance 1: Active Loan
            var iss1Key = $"{collegeId}:demo-issue-1";
            if (!await db.Issuances.Find(x => x.IssueIdempotencyKey == iss1Key).AnyAsync(token))
            {
                var iss1 = new Issuance
                {
                    CollegeId = collegeId,
                    BookId = seededBooks[0].Id!,
                    StudentId = studentIds[0],
                    AccessionNumber = seededBooks[0].PhysicalCopies.FirstOrDefault()?.AccessionNumber ?? "ACC-001",
                    BookTitle = seededBooks[0].Title,
                    ClassName = "BCA-3A",
                    Status = "active",
                    IssueDate = DateTime.UtcNow.AddDays(-5),
                    DueDate = DateTime.UtcNow.AddDays(9),
                    LoanDays = 14,
                    ActiveSlot = 1,
                    IssueIdempotencyKey = iss1Key,
                    IssuedBy = DemoLibrarian1Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-5)
                };
                await db.Issuances.InsertOneAsync(iss1, cancellationToken: token);
            }

            // Issuance 2: Overdue Loan with Fine
            var iss2Key = $"{collegeId}:demo-issue-2";
            var iss2 = await db.Issuances.Find(x => x.IssueIdempotencyKey == iss2Key).FirstOrDefaultAsync(token);
            if (iss2 == null)
            {
                iss2 = new Issuance
                {
                    CollegeId = collegeId,
                    BookId = seededBooks[1].Id!,
                    StudentId = studentIds[1],
                    AccessionNumber = seededBooks[1].PhysicalCopies.FirstOrDefault()?.AccessionNumber ?? "ACC-002",
                    BookTitle = seededBooks[1].Title,
                    ClassName = "CS-5B",
                    Status = "active",
                    IssueDate = DateTime.UtcNow.AddDays(-20),
                    DueDate = DateTime.UtcNow.AddDays(-6),
                    LoanDays = 14,
                    ActiveSlot = 1,
                    IssueIdempotencyKey = iss2Key,
                    IssuedBy = DemoLibrarian1Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-20)
                };
                await db.Issuances.InsertOneAsync(iss2, cancellationToken: token);

                // Add overdue fine
                var fine = new Fine
                {
                    CollegeId = collegeId,
                    IssuanceId = iss2.Id!,
                    StudentId = studentIds[1],
                    BookTitle = seededBooks[1].Title,
                    Amount = 30, // 6 days * 5 rs
                    PaidAmount = 0,
                    WaivedAmount = 0,
                    Status = "unpaid",
                    CalculatedThrough = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await db.Fines.ReplaceOneAsync(x => x.IssuanceId == iss2.Id!, fine, new ReplaceOptions { IsUpsert = true }, token);
            }

            // Seed Announcement
            if (!await db.Announcements.Find(x => x.CollegeId == collegeId).AnyAsync(token))
            {
                var announcement = new LibraryAnnouncement
                {
                    CollegeId = collegeId,
                    Title = "Mid-Semester Book Return Drive",
                    Content = "Please return or renew all borrowed books before the upcoming mid-semester examinations. Late fine waivers available for prompt returns.",
                    TargetAudience = "all",
                    CreatedBy = "Rajesh Kumar (Head Librarian)",
                    CreatedAt = DateTime.UtcNow.AddDays(-2)
                };
                await db.Announcements.InsertOneAsync(announcement, cancellationToken: token);
            }
        }
    }

}
