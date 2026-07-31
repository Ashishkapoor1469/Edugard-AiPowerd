using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using MongoDB.Driver;
using EduGuard.Models;
using EduGuard.Services;

namespace EduGuard.Hubs
{
    public class SendMessagePayload
    {
        public string RoomId { get; set; } = string.Empty;
        public string StudentId { get; set; } = string.Empty;
        public string MentorId { get; set; } = string.Empty;
        public string Sender { get; set; } = string.Empty; // "student", "mentor", "ai"
        public string Text { get; set; } = string.Empty;
    }

    public class EduGuardHub : Hub
    {
        private readonly MongoService _mongoService;
        private readonly INvidiaNimService _nvidiaNimService;

        // Tracks active connections per mentor ID
        private static readonly ConcurrentDictionary<string, HashSet<string>> MentorConnections = new();
        // Maps connection ID to mentor ID for easy lookup on disconnect
        private static readonly ConcurrentDictionary<string, string> ConnectionMentorMap = new();

        public EduGuardHub(MongoService mongoService, INvidiaNimService nvidiaNimService)
        {
            _mongoService = mongoService;
            _nvidiaNimService = nvidiaNimService;
        }

        private async Task StreamAiMessageAsync(string roomId, Message message)
        {
            var streamId = $"ai-stream-{Guid.NewGuid():N}";

            await Clients.Group(roomId).SendAsync("typing", new { sender = "ai", isTyping = false });
            await Clients.Group(roomId).SendAsync("aiMessageStart", new
            {
                messageId = streamId,
                studentId = message.StudentId,
                mentorId = message.MentorId
            });

            foreach (var chunk in BuildAiChunks(message.Text))
            {
                await Clients.Group(roomId).SendAsync("aiMessageChunk", new
                {
                    messageId = streamId,
                    studentId = message.StudentId,
                    chunk
                });
                await Task.Delay(35);
            }

            await Clients.Group(roomId).SendAsync("aiMessageEnd", new
            {
                messageId = streamId,
                studentId = message.StudentId
            });

            await Clients.Group(roomId).SendAsync("newMessage", message);
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

        public async Task JoinRoom(string roomId)
        {
            if (string.IsNullOrEmpty(roomId)) return;
            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            Console.WriteLine($"[SignalR] Connection {Context.ConnectionId} joined room: {roomId}");
        }

        public async Task MentorOnline(string mentorId)
        {
            if (string.IsNullOrEmpty(mentorId)) return;

            ConnectionMentorMap[Context.ConnectionId] = mentorId;
            
            var connections = MentorConnections.GetOrAdd(mentorId, _ => new HashSet<string>());
            lock (connections)
            {
                connections.Add(Context.ConnectionId);
            }

            // Update Mentor online status in DB
            var filter = Builders<Mentor>.Filter.Eq(m => m.Id, mentorId);
            var update = Builders<Mentor>.Update.Set(m => m.IsOnline, true);
            await _mongoService.Mentors.UpdateOneAsync(filter, update);

            // Broadcast status change to everyone
            await Clients.All.SendAsync("mentor:status", new { mentorId, isOnline = true });
            Console.WriteLine($"[SignalR] Mentor {mentorId} is online.");
        }

        public async Task SendMessage(SendMessagePayload data)
        {
            if (data == null || string.IsNullOrEmpty(data.RoomId) || string.IsNullOrEmpty(data.StudentId) || 
                string.IsNullOrEmpty(data.MentorId) || string.IsNullOrEmpty(data.Text))
            {
                return;
            }

            try
            {
                // Create and save message
                var message = new Message
                {
                    StudentId = data.StudentId,
                    MentorId = data.MentorId,
                    Sender = data.Sender,
                    Text = data.Text,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                await _mongoService.Messages.InsertOneAsync(message);

                // Broadcast new message to the group
                await Clients.Group(data.RoomId).SendAsync("newMessage", message);

                // If sender is a student, check if mentor is offline to trigger AI reply
                if (string.Equals(data.Sender, "student", StringComparison.OrdinalIgnoreCase))
                {
                    var mentor = await _mongoService.Mentors.Find(m => m.Id == data.MentorId).FirstOrDefaultAsync();
                    if (mentor != null && !mentor.IsOnline)
                    {
                        var student = await _mongoService.Students.Find(s => s.Id == data.StudentId).FirstOrDefaultAsync();
                        if (student != null)
                        {
                            // Fetch last 10 messages for context
                            var history = await _mongoService.Messages
                                .Find(m => m.StudentId == data.StudentId && m.MentorId == data.MentorId)
                                .SortBy(m => m.CreatedAt)
                                .Limit(10)
                                .ToListAsync();

                            // Emit typing indicator
                            await Clients.Group(data.RoomId).SendAsync("typing", new { sender = "ai", isTyping = true });

                            // Generate AI reply
                            var aiReplyText = await _nvidiaNimService.GenerateAIChatReplyAsync(student, history, data.Text);

                            var aiMessage = new Message
                            {
                                StudentId = data.StudentId,
                                MentorId = data.MentorId,
                                Sender = "ai",
                                Text = aiReplyText,
                                CreatedAt = DateTime.UtcNow,
                                UpdatedAt = DateTime.UtcNow
                            };

                            await _mongoService.Messages.InsertOneAsync(aiMessage);

                            // Stream AI text into the chat, then replace it with the saved DB message.
                            await StreamAiMessageAsync(data.RoomId, aiMessage);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[SignalR ERROR] Failed to send message: {ex.Message}");
                await Clients.Caller.SendAsync("error", new { message = "Failed to send message" });
            }
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            Console.WriteLine($"[SignalR] Connection disconnected: {Context.ConnectionId}");

            if (ConnectionMentorMap.TryRemove(Context.ConnectionId, out var mentorId))
            {
                if (MentorConnections.TryGetValue(mentorId, out var connections))
                {
                    bool isOffline = false;
                    lock (connections)
                    {
                        connections.Remove(Context.ConnectionId);
                        if (connections.Count == 0)
                        {
                            isOffline = true;
                            MentorConnections.TryRemove(mentorId, out _);
                        }
                    }

                    if (isOffline)
                    {
                        // Update DB online status
                        var filter = Builders<Mentor>.Filter.Eq(m => m.Id, mentorId);
                        var update = Builders<Mentor>.Update.Set(m => m.IsOnline, false);
                        await _mongoService.Mentors.UpdateOneAsync(filter, update);

                        // Broadcast status change
                        await Clients.All.SendAsync("mentor:status", new { mentorId, isOnline = false });
                        Console.WriteLine($"[SignalR] Mentor {mentorId} went offline.");
                    }
                }
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}
