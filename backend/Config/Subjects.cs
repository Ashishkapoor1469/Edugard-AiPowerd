using System;
using System.Collections.Generic;

namespace EduGuard.Config
{
    public class SubjectDefinition
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public bool IsPractical { get; set; }
    }

    public static class Subjects
    {
        public static readonly Dictionary<string, Dictionary<int, List<SubjectDefinition>>> CourseSubjects = new(StringComparer.OrdinalIgnoreCase)
        {
            ["BCA"] = new()
            {
                [1] = new()
                {
                    new() { Code = "BCA0101", Name = "Mathematics-I", IsPractical = false },
                    new() { Code = "BCA0102", Name = "Applied English", IsPractical = false },
                    new() { Code = "BCA0103", Name = "Computer Fundamentals", IsPractical = false },
                    new() { Code = "BCA0104", Name = "C Programming", IsPractical = false },
                    new() { Code = "BCA0105", Name = "Office Automation Tools", IsPractical = false },
                    new() { Code = "BCA0104(P)", Name = "C Programming Lab", IsPractical = true },
                    new() { Code = "BCA0105(P)", Name = "Office Automation Tools Lab", IsPractical = true }
                },
                [2] = new()
                {
                    new() { Code = "BCA0201", Name = "Mathematics-II", IsPractical = false },
                    new() { Code = "BCA0202", Name = "Communicative English", IsPractical = false },
                    new() { Code = "BCA0203", Name = "Digital Electronics", IsPractical = false },
                    new() { Code = "BCA0204", Name = "Data Structures", IsPractical = false },
                    new() { Code = "BCA0205", Name = "Data Base Management System", IsPractical = false },
                    new() { Code = "BCA0204(P)", Name = "Data Structures Lab", IsPractical = true },
                    new() { Code = "BCA0205(P)", Name = "DBMS Lab", IsPractical = true }
                },
                [3] = new()
                {
                    new() { Code = "BCA0301", Name = "Mathematics-III", IsPractical = false },
                    new() { Code = "BCA0302", Name = "Business Practices and Management", IsPractical = false },
                    new() { Code = "BCA0303", Name = "Object-Oriented Programming with C++", IsPractical = false },
                    new() { Code = "BCA0304", Name = "Desktop Publishing and Designing", IsPractical = false },
                    new() { Code = "BCA0305", Name = "Statistical Methods", IsPractical = false },
                    new() { Code = "BCA0303(P)", Name = "OOP with C++ Lab", IsPractical = true },
                    new() { Code = "BCA0304(P)", Name = "Desktop Publishing Lab", IsPractical = true }
                },
                [4] = new()
                {
                    new() { Code = "BCA0401", Name = "Personnel Management", IsPractical = false },
                    new() { Code = "BCA0402", Name = "Accounting and Financial Management", IsPractical = false },
                    new() { Code = "BCA0403", Name = "System Analysis and Design", IsPractical = false },
                    new() { Code = "BCA0404", Name = "Internet Technology & Web Page Design", IsPractical = false },
                    new() { Code = "BCA0405", Name = "Programming in Visual Basic", IsPractical = false },
                    new() { Code = "BCA0404(P)", Name = "Web Page Design Lab", IsPractical = true },
                    new() { Code = "BCA0405(P)", Name = "Visual Basic Lab", IsPractical = true }
                },
                [5] = new()
                {
                    new() { Code = "BCA0501", Name = "Operating System", IsPractical = false },
                    new() { Code = "BCA0502", Name = "Software Engineering", IsPractical = false },
                    new() { Code = "BCA0503", Name = "Object-Oriented Programming with Java", IsPractical = false },
                    new() { Code = "BCA0504", Name = "Computer Graphics", IsPractical = false },
                    new() { Code = "BCA0503(P)", Name = "Java Programming Lab", IsPractical = true },
                    new() { Code = "BCA0504(P)", Name = "Computer Graphics Lab", IsPractical = true }
                },
                [6] = new()
                {
                    new() { Code = "BCA0601", Name = "Computer Networks", IsPractical = false },
                    new() { Code = "BCA0602", Name = "Numerical Methods", IsPractical = false },
                    new() { Code = "BCA0603", Name = "Multimedia Applications", IsPractical = false },
                    new() { Code = "BCA0604", Name = "Major Project", IsPractical = false },
                    new() { Code = "BCA0605", Name = "Seminar", IsPractical = false },
                    new() { Code = "BCA0603(P)", Name = "Multimedia Applications Lab", IsPractical = true }
                }
            },
            ["BBA"] = new()
            {
                [1] = new()
                {
                    new() { Code = "BBA101", Name = "Principles of Management", IsPractical = false },
                    new() { Code = "BBA102", Name = "Business Communication", IsPractical = false },
                    new() { Code = "BBA103", Name = "Microeconomics", IsPractical = false },
                    new() { Code = "BBA104", Name = "Financial Accounting", IsPractical = false },
                    new() { Code = "BBA105", Name = "Business Mathematics", IsPractical = false }
                }
            },
            ["BTECH"] = new()
            {
                [1] = new()
                {
                    new() { Code = "BT101", Name = "Engineering Mathematics", IsPractical = false },
                    new() { Code = "BT102", Name = "Engineering Physics", IsPractical = false },
                    new() { Code = "BT103", Name = "Engineering Chemistry", IsPractical = false },
                    new() { Code = "BT104", Name = "Programming Fundamentals", IsPractical = false },
                    new() { Code = "BT102(P)", Name = "Physics Lab", IsPractical = true },
                    new() { Code = "BT103(P)", Name = "Chemistry Lab", IsPractical = true },
                    new() { Code = "BT104(P)", Name = "Programming Lab", IsPractical = true }
                }
            }
        };

        public static List<SubjectDefinition> GetSubjectsForSemester(string course, int semester)
        {
            if (string.IsNullOrEmpty(course)) return new();
            if (CourseSubjects.TryGetValue(course, out var semesters))
            {
                if (semesters.TryGetValue(semester, out var subs))
                {
                    return subs;
                }
            }
            return new();
        }

        public static List<SubjectDefinition> GetAllSubjectsForCourse(string course)
        {
            if (string.IsNullOrEmpty(course)) return new();
            var allSubjects = new List<SubjectDefinition>();
            if (CourseSubjects.TryGetValue(course, out var semesters))
            {
                foreach (var subs in semesters.Values)
                {
                    allSubjects.AddRange(subs);
                }
            }
            return allSubjects;
        }
    }
}
