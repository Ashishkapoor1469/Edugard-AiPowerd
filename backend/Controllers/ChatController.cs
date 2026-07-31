using System;
using System.Collections.Generic;
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
        private readonly INvidiaNimService _nvidiaNimService;
        private readonly IPushNotificationQueue _pushQueue;

        public ChatController(MongoService mongoService, IHubContext<EduGuardHub> hubContext, INvidiaNimService nvidiaNimService, IPushNotificationQueue pushQueue)
        {
            _mongoService = mongoService;
            _hubContext = hubContext;
            _nvidiaNimService = nvidiaNimService;
            _pushQueue = pushQueue;
        }

        private async Task StreamAiMessageAsync(string roomId, Message message)
        {
            var streamId = $"ai-stream-{Guid.NewGuid():N}";

            await _hubContext.Clients.Group(roomId).SendAsync("typing", new { sender = "ai", isTyping = false });
            await _hubContext.Clients.Group(roomId).SendAsync("aiMessageStart", new
            {
                messageId = streamId,
                studentId = message.StudentId,
                mentorId = message.MentorId
            });

            foreach (var chunk in BuildAiChunks(message.Text))
            {
                await _hubContext.Clients.Group(roomId).SendAsync("aiMessageChunk", new
                {
                    messageId = streamId,
                    studentId = message.StudentId,
                    chunk
                });
                await Task.Delay(35);
            }

            await _hubContext.Clients.Group(roomId).SendAsync("aiMessageEnd", new
            {
                messageId = streamId,
                studentId = message.StudentId
            });

            await _hubContext.Clients.Group(roomId).SendAsync("newMessage", message);
        }

        private static IEnumerable<string> BuildAiChunks(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                yield break;
            }

            var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            foreach (var word in words)
            {
                yield return $"{word} ";
            }
        }

        // GET /api/chat/{studentId} — Fetch chat history
        [HttpGet("{studentId}")]
        public async Task<IActionResult> GetMessages(string studentId, [FromQuery] int page = 1, [FromQuery] int limit = 20)
        {
            page = Math.Max(1, page);
            limit = Math.Clamp(limit, 1, 50);

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

            var total = await _mongoService.Messages.CountDocumentsAsync(filter);
            var messages = await _mongoService.Messages
                .Find(filter)
                .SortByDescending(m => m.CreatedAt)
                .Skip((page - 1) * limit)
                .Limit(limit)
                .ToListAsync();
            messages.Reverse();

            return Ok(new
            {
                success = true,
                count = messages.Count,
                total,
                pages = (int)Math.Ceiling(total / (double)limit),
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
                var userRole = User.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;

                if (userRole == "student")
                {
                    if (request.StudentId != userId)
                    {
                        return Forbid();
                    }

                    var student = await _mongoService.Students.Find(s => s.Id == request.StudentId).FirstOrDefaultAsync();
                    if (student == null)
                    {
                        return NotFound(new { success = false, message = "Student not found" });
                    }

                    if (!string.IsNullOrEmpty(student.MentorId))
                    {
                        if (request.MentorId != student.MentorId)
                        {
                            return BadRequest(new { success = false, message = "Student can only chat with their assigned mentor." });
                        }
                    }
                    else
                    {
                        // No mentor assigned, must chat with AI assistant
                        if (request.MentorId != "ai-assistant")
                        {
                            return BadRequest(new { success = false, message = "No mentor assigned. You can only chat with EduGuard AI Assistant." });
                        }
                    }
                }
                else if (userRole == "mentor")
                {
                    if (request.MentorId != userId)
                    {
                        return Forbid();
                    }

                    var student = await _mongoService.Students.Find(s => s.Id == request.StudentId).FirstOrDefaultAsync();
                    if (student == null)
                    {
                        return NotFound(new { success = false, message = "Student not found" });
                    }

                    if (student.MentorId != userId)
                    {
                        return BadRequest(new { success = false, message = "You can only chat with students assigned to you." });
                    }
                }

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

                var recipientId = string.Equals(sender, "mentor", StringComparison.OrdinalIgnoreCase) ? request.StudentId : request.MentorId;
                if (recipientId != "ai-assistant")
                    await _pushQueue.EnqueueAsync(recipientId, $"chat:{message.Id}:{recipientId}",
                        new PushMessage("New chat message", request.Text.Length > 120 ? request.Text[..120] : request.Text, "normal",
                            new Dictionary<string, string> { ["type"] = "chat", ["path"] = $"/students/{request.StudentId}?tab=chat", ["studentId"] = request.StudentId }));

                // Broadcast to the SignalR room (room = studentId)
                var roomId = request.StudentId;
                await _hubContext.Clients.Group(roomId).SendAsync("newMessage", message);

                // Check if we should trigger AI reply
                // Condition A: If no mentor is assigned (MentorId == "ai-assistant")
                // Condition B: If mentor is assigned, but offline
                bool triggerAI = false;
                if (string.Equals(sender, "student", StringComparison.OrdinalIgnoreCase))
                {
                    if (request.MentorId == "ai-assistant")
                    {
                        triggerAI = true;
                    }
                    else
                    {
                        var mentor = await _mongoService.Mentors.Find(m => m.Id == request.MentorId).FirstOrDefaultAsync();
                        if (mentor != null && !mentor.IsOnline)
                        {
                            triggerAI = true;
                        }
                    }
                }

                if (triggerAI)
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

                        // Stream AI text into the chat, then replace it with the saved DB message.
                        await StreamAiMessageAsync(roomId, aiMessage);
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
