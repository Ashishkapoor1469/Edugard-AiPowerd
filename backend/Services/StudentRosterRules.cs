using EduGuard.Models;
using MongoDB.Driver;

namespace EduGuard.Services;

public static class StudentRosterRules
{
    public static FilterDefinition<Student> Active(string collegeId, string? classId = null)
    {
        var filter = Builders<Student>.Filter.Eq(student => student.CollegeId, collegeId) &
            (Builders<Student>.Filter.Eq(student => student.VerificationStatus, "approved") |
             Builders<Student>.Filter.Eq(student => student.VerificationStatus, "verified") |
             Builders<Student>.Filter.Eq(student => student.IsVerified, true));
        return string.IsNullOrWhiteSpace(classId) ? filter : filter & Builders<Student>.Filter.Eq(student => student.Class, classId);
    }
}
