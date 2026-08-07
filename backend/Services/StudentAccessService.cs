using System.Security.Claims;
using EduGuard.Models;
using MongoDB.Driver;

namespace EduGuard.Services;

public interface IStudentAccessService
{
    Task<bool> CanReadAsync(ClaimsPrincipal actor, Student student, CancellationToken token = default);
    Task<bool> CanManageAsync(ClaimsPrincipal actor, Student student, CancellationToken token = default);
}

public sealed class StudentAccessService : IStudentAccessService
{
    private readonly MongoService _mongo;
    public StudentAccessService(MongoService mongo) => _mongo = mongo;

    public async Task<bool> CanReadAsync(ClaimsPrincipal actor, Student student, CancellationToken token = default)
    {
        var id = actor.FindFirst("id")?.Value;
        var role = actor.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(id)) return false;
        if (role == "student") return student.Id == id;
        return await CanManageAsync(actor, student, token);
    }

    public async Task<bool> CanManageAsync(ClaimsPrincipal actor, Student student, CancellationToken token = default)
    {
        var id = actor.FindFirst("id")?.Value;
        var role = actor.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(id)) return false;
        if (role == "mentor")
            return await _mongo.Mentors.Find(x => x.Id == id && x.Status == "approved").AnyAsync(token) && student.MentorId == id;
        if (role == "college-admin")
        {
            var admin = await _mongo.Admins.Find(x => x.Id == id && x.Role == role && x.Status == "active").FirstOrDefaultAsync(token);
            return !string.IsNullOrEmpty(admin?.CollegeId) && admin.CollegeId == student.CollegeId;
        }
        return role == "admin" && await _mongo.Admins.Find(x => x.Id == id && x.Role == role && x.Status == "active").AnyAsync(token);
    }
}
