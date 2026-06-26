using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/mentors")]
    public class MentorController : ControllerBase
    {
        private readonly MongoService _mongoService;

        public MentorController(MongoService mongoService)
        {
            _mongoService = mongoService;
        }

        [HttpGet("list")]
        public async Task<IActionResult> GetMentorsList()
        {
            var mentors = await _mongoService.Mentors.Find(_ => true).ToListAsync();
            var resultList = new List<object>();

            foreach (var mentor in mentors)
            {
                // Count current students assigned to this mentor
                var assignedCount = await _mongoService.Students.CountDocumentsAsync(s => s.MentorId == mentor.Id);

                resultList.Add(new
                {
                    _id = mentor.Id,
                    id = mentor.Id,
                    name = mentor.Name,
                    email = mentor.Email,
                    role = mentor.Role,
                    isOnline = mentor.IsOnline,
                    assignedClasses = mentor.AssignedClasses,
                    assignedCount,
                    studentCount = assignedCount,
                    capacity = 30
                });
            }

            return Ok(new { success = true, data = resultList });
        }
    }
}
