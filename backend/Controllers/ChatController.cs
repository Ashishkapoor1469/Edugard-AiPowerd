using System;
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
    [Route("api/chat")]
    public class ChatController : ControllerBase
    {
        private readonly MongoService _mongoService;

        public ChatController(MongoService mongoService)
        {
            _mongoService = mongoService;
        }

        [HttpGet("{studentId}")]
        public async Task<IActionResult> GetMessages(string studentId)
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "Not authenticated" });
            }

            // Check if the requesting user is a student
            var isStudent = await _mongoService.Students.Find(s => s.Id == userId).AnyAsync();

            FilterDefinition<Message> filter;
            if (isStudent)
            {
                // If student, fetch messages belonging to them
                filter = Builders<Message>.Filter.Eq(m => m.StudentId, userId);
            }
            else
            {
                // If mentor, query messages for studentId and current mentor
                filter = Builders<Message>.Filter.And(
                    Builders<Message>.Filter.Eq(m => m.StudentId, studentId),
                    Builders<Message>.Filter.Eq(m => m.MentorId, userId)
                );
            }

            var messages = await _mongoService.Messages
                .Find(filter)
                .SortBy(m => m.CreatedAt)
                .ToListAsync();

            return Ok(new
            {
                success = true,
                count = messages.Count,
                data = messages
            });
        }
    }
}
