using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;
using EduGuard.Hubs;

namespace EduGuard.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/chat")]
    public class ChatController : ControllerBase
    {
        private readonly MongoService _mongoService;
        private readonly IHubContext<EduGuardHub> _hubContext;
        private readonly NvidiaNimService _nvidiaNimService;

        public ChatController(MongoService mongoService, IHubContext<EduGuardHub> hubContext, NvidiaNimService nvidiaNimService)
        {
            _mongoService = mongoService;
            _hubContext = hubContext;
            _nvidiaNimService = nvidiaNimService;
        }

        // GET /api/chat/{studentId} — Fetch chat history
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

        // POST /api/chat/send — Send a chat message via REST (reliable)
        [HttpPost("send")]
        public async Task<IActionResult> SendMessage([FromBody] SendChatRequest request)
        {
            var userId = User.FindFirst("id")?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { success = false, message = "Not authenticated" });
            }

            if (request == null || string.IsNullOrEmpty(request.StudentId) ||
                string.IsNullOrEmpty(request.MentorId) || string.IsNullOrEmpty(request.Text))
            {
                return BadRequest(new { success = false, message = "studentId, mentorId, and text are required" });
            }

            try
            {
                // Determine sender role
                var sender = request.Sender ?? "mentor";

                // Create and save message
                var message = new Message
                {
                    StudentId = request.StudentId,
                    MentorId = request.MentorId,
                    Sender = sender,
                    Text = request.Text,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                await _mongoService.Messages.InsertOneAsync(message);

                // Broadcast to the SignalR room (room = studentId)
                var roomId = request.StudentId;
                await _hubContext.Clients.Group(roomId).SendAsync("newMessage", message);

                // If a student sent the message, check if mentor is offline for AI reply
                if (string.Equals(sender, "student", StringComparison.OrdinalIgnoreCase))
                {
                    var mentor = await _mongoService.Mentors.Find(m => m.Id == request.MentorId).FirstOrDefaultAsync();
                    if (mentor != null && !mentor.IsOnline)
                    {
                        var student = await _mongoService.Students.Find(s => s.Id == request.StudentId).FirstOrDefaultAsync();
                        if (student != null)
                        {
                            // Fetch last 10 messages for context
                            var history = await _mongoService.Messages
                                .Find(m => m.StudentId == request.StudentId && m.MentorId == request.MentorId)
                                .SortByDescending(m => m.CreatedAt)
                                .Limit(10)
                                .ToListAsync();
                            history.Reverse();

                            // Emit typing indicator
                            await _hubContext.Clients.Group(roomId).SendAsync("typing", new { sender = "ai", isTyping = true });

                            // Generate AI reply
                            var aiReplyText = await _nvidiaNimService.GenerateAIChatReplyAsync(student, history, request.Text);

                            var aiMessage = new Message
                            {
                                StudentId = request.StudentId,
                                MentorId = request.MentorId,
                                Sender = "ai",
                                Text = aiReplyText,
                                CreatedAt = DateTime.UtcNow,
                                UpdatedAt = DateTime.UtcNow
                            };

                            await _mongoService.Messages.InsertOneAsync(aiMessage);

                            // Turn off typing indicator and broadcast AI message
                            await _hubContext.Clients.Group(roomId).SendAsync("typing", new { sender = "ai", isTyping = false });
                            await _hubContext.Clients.Group(roomId).SendAsync("newMessage", aiMessage);
                        }
                    }
                }

                return Ok(new
                {
                    success = true,
                    message = "Message sent",
                    data = message
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ChatController ERROR] Failed to send message: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to send message" });
            }
        }
    }

    public class SendChatRequest
    {
        public string StudentId { get; set; } = string.Empty;
        public string MentorId { get; set; } = string.Empty;
        public string Sender { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
    }
}
