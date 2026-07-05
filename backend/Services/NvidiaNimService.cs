using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using EduGuard.Models;

namespace EduGuard.Services
{
    public class ClassStats
    {
        public string ClassName { get; set; } = string.Empty;
        public int TotalStudents { get; set; }
        public double AvgAttendance { get; set; }
        public double AvgMarks { get; set; }
        public int AtRiskCount { get; set; }
        public List<string> FailingSubjects { get; set; } = new();
    }

    public class NvidiaNimService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<NvidiaNimService> _logger;
        private readonly string _nvidiaApiKey;
        private readonly string _modelId;
        private readonly bool _isMock;
        private const string BaseUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

        public NvidiaNimService(IConfiguration configuration, ILogger<NvidiaNimService> logger)
        {
            _logger = logger;
            _httpClient = new HttpClient();
            
            _nvidiaApiKey = configuration.GetValue<string>("NVIDIA_API_KEY") ?? string.Empty;
            _modelId = configuration.GetValue<string>("NVIDIA_MODEL_ID") ?? "minimaxai/minimax-m3";
            _isMock = string.IsNullOrEmpty(_nvidiaApiKey) || _nvidiaApiKey == "your_nvidia_nim_api_key";

            if (_isMock)
            {
                _logger.LogWarning("[WARNING] NVIDIA_API_KEY environment variable is not defined. Using mock AI responses.");
            }
        }

        private async Task<string> CallNvidiaApiAsync(string systemPrompt, string userPrompt, double temperature, int maxTokens)
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _nvidiaApiKey);

                var payload = new
                {
                    model = _modelId,
                    messages = new[]
                    {
                        new { role = "system", content = systemPrompt },
                        new { role = "user", content = userPrompt }
                    },
                    temperature = temperature,
                    max_tokens = maxTokens
                };

                request.Content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.SendAsync(request);
                if (!response.IsSuccessStatusCode)
                {
                    var errorDetails = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException($"NVIDIA API returned status {response.StatusCode}: {errorDetails}");
                }

                var responseBody = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;
                if (root.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0)
                {
                    var choice = choices[0];
                    if (choice.TryGetProperty("message", out var message) && message.TryGetProperty("content", out var content))
                    {
                        return content.GetString()?.Trim() ?? string.Empty;
                    }
                }

                return "No response generated from AI.";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calling NVIDIA NIM API.");
                throw;
            }
        }

        public async Task<string> GenerateRiskExplanationAsync(Student student)
        {
            var attendanceStr = student.Attendance.HasValue ? $"{student.Attendance.Value:F1}%" : "Not recorded";
            
            var subjectAverages = new List<string>();
            if (student.Marks != null)
            {
                foreach (var m in student.Marks)
                {
                    var avg = RiskEngine.CalculateSubjectAverage(m);
                    var avgStr = avg.HasValue ? $"{avg.Value:F1}%" : "No marks";
                    subjectAverages.Add($"{m.SubjectName}: {avgStr}");
                }
            }
            var marksSummary = string.Join(", ", subjectAverages);

            var contributionsStr = (student.Contribution != null && student.Contribution.Count > 0)
                ? string.Join(", ", student.Contribution)
                : "None";

            var prompt = $@"Analyze the student performance data and write a professional 2-3 sentence explanation of why they are classified as at {student.RiskLevel.ToUpper()} risk (risk score: {student.RiskScore}/100).
Student Profile:
- Name: {student.Name}
- Roll No: {student.RollNo}
- Course: {student.Course}
- Class: {student.Class}
- Attendance: {attendanceStr}
- Behavior: {student.Behavior ?? "Not assessed"}
- Contributions: {contributionsStr}
- Subject Marks Breakdown: {marksSummary}

Explain the risk factors clearly and concisely. Focus on attendance, average marks, behavior, or missing data. Do not include markdown headers, json format, or introductory phrases. Output only 2-3 sentences.";

            if (_isMock)
            {
                var factors = new List<string>();
                if (student.Attendance.HasValue && student.Attendance.Value < 75)
                {
                    factors.Add($"attendance is low at {student.Attendance.Value:F1}% (below 75% threshold)");
                }
                
                var lowSubjects = new List<string>();
                if (student.Marks != null)
                {
                    foreach (var m in student.Marks)
                    {
                        var avg = RiskEngine.CalculateSubjectAverage(m);
                        if (avg.HasValue && avg.Value < 40)
                        {
                            lowSubjects.Add(m.SubjectName);
                        }
                    }
                }

                if (lowSubjects.Count > 0)
                {
                    factors.Add($"struggling in subjects like {string.Join(", ", lowSubjects)}");
                }
                if (string.Equals(student.Behavior, "bad", StringComparison.OrdinalIgnoreCase))
                {
                    factors.Add("behavioral concerns have been flagged");
                }

                var factorStr = factors.Count > 0 ? $"due to {string.Join(" and ", factors)}" : "based on general academic parameters";
                return $"{student.Name} is classified as {student.RiskLevel.ToUpper()} risk ({student.RiskScore}/100) {factorStr}. Early intervention is recommended to address these concerns and prevent academic decline.";
            }

            try
            {
                return await CallNvidiaApiAsync(
                    "You are a professional educational analyst. Provide only the direct explanation without any conversational filler or prefaces.",
                    prompt,
                    0.2,
                    150
                );
            }
            catch
            {
                return $"Calculated risk level is {student.RiskLevel} with score {student.RiskScore}/100. (AI explanation generation failed).";
            }
        }

        public async Task<string> GenerateImprovementPlanAsync(Student student)
        {
            var attendanceStr = student.Attendance.HasValue ? $"{student.Attendance.Value:F1}%" : "Not recorded";
            
            var failingList = new List<string>();
            if (student.Marks != null)
            {
                foreach (var m in student.Marks)
                {
                    var avg = RiskEngine.CalculateSubjectAverage(m);
                    if (avg.HasValue && avg.Value < 35)
                    {
                        failingList.Add(m.SubjectName);
                    }
                }
            }
            var failingSubjects = string.Join(", ", failingList);

            var prompt = $@"Generate a list of 5-7 actionable, encouraging academic improvement bullet points for this student:
Student Profile:
- Name: {student.Name}
- Course: {student.Course}
- Class: {student.Class}
- Attendance: {attendanceStr}
- Behavior: {student.Behavior ?? "average"}
- Failing Subjects (avg < 35%): {(!string.IsNullOrEmpty(failingSubjects) ? failingSubjects : "None")}

Format the output as plain lines of bullet points starting with a hyphen (-) and nothing else. No intro or outro text. Provide exactly 5 to 7 bullet points.";

            if (_isMock)
            {
                var coreTopics = !string.IsNullOrEmpty(failingSubjects) ? failingSubjects : "core topics";
                var plans = new List<string>
                {
                    "Set a strict target to attend all remaining lectures to raise attendance above 75%.",
                    $"Engage in daily 45-minute self-study sessions for {coreTopics}.",
                    "Schedule a weekly meeting with the course mentor for academic doubts resolution.",
                    "Submit all upcoming assignments at least 24 hours prior to the deadline to secure grace marks.",
                    "Improve active participation in classroom discussions and practical lab work.",
                    "Participate in peer group study sessions to review complex modules."
                };
                return string.Join("\n", plans.Select(p => $"- {p}"));
            }

            try
            {
                return await CallNvidiaApiAsync(
                    "You are an expert academic advisor. Output only the hyphenated bullet points, with no introductory or concluding statements.",
                    prompt,
                    0.5,
                    250
                );
            }
            catch
            {
                return "- Attend remedial classes for failing subjects.\n- Improve daily lecture attendance.\n- Submit assignments on time.\n- Schedule peer study sessions.";
            }
        }

        public async Task<string> GenerateAIChatReplyAsync(Student student, List<Message> chatHistory, string latestMessage)
        {
            var attendanceStr = student.Attendance.HasValue ? $"{student.Attendance.Value:F1}%" : "Not recorded";
            
            var historyLines = chatHistory
                .TakeLast(10)
                .Select(msg => $"{msg.Sender.ToUpper()}: {msg.Text}");
            var historyText = string.Join("\n", historyLines);

            var prompt = $@"You are an encouraging and supportive academic mentor assistant. The human mentor is offline, so you are replying to the student in their place.
Student Context:
- Student Name: {student.Name}
- Course: {student.Course}
- Class: {student.Class}
- Attendance: {attendanceStr}
- Risk Level: {student.RiskLevel}
- Behavior: {student.Behavior ?? "average"}

Review the conversation history and write a response to the student's latest message in 2-3 sentences. Be empathetic, constructive, and offer clear academic guidance.

Conversation History:
{historyText}
STUDENT: {latestMessage}

Response (2-3 sentences only, direct message to student, do not include any prefixes):";

            if (_isMock)
            {
                var lmLower = (latestMessage ?? "").ToLower();
                if (lmLower.Contains("attendance") || lmLower.Contains("absent"))
                {
                    return $"Hi {student.Name}, I understand it can be difficult to make every session, but let's work together to get your attendance back on track. We can schedule a brief 10-minute chat after class tomorrow to review the lectures you missed.";
                }
                if (lmLower.Contains("exam") || lmLower.Contains("marks") || lmLower.Contains("fail"))
                {
                    return $"Please don't be discouraged by these recent results, {student.Name}. We can arrange some remedial tutoring sessions this week to go over the exam topics you found challenging. Let's make a plan to rebuild your confidence.";
                }
                return $"Hi {student.Name}, thank you for reaching out. I've noted your message and would love to help you work through these challenges. Let's schedule a time to meet briefly tomorrow to discuss this further.";
            }

            try
            {
                return await CallNvidiaApiAsync(
                    "You are an empathetic college mentor. Respond directly and warmly to the student. Keep your response strictly under 3 sentences. Do not prepend any labels like 'MENTOR:' or 'AI:'.",
                    prompt,
                    0.6,
                    150
                );
            }
            catch
            {
                return "I hear your concerns and am happy to help you. Let's plan to connect in person after our next class to discuss this together.";
            }
        }

        public async Task<string> GenerateClassSummaryAsync(ClassStats classStats)
        {
            var failingSubjectsStr = (classStats.FailingSubjects != null && classStats.FailingSubjects.Count > 0)
                ? string.Join(", ", classStats.FailingSubjects)
                : "None";

            var prompt = $@"Analyze the aggregated academic performance metrics for class {classStats.ClassName} and write a 1 paragraph professional summary (4-5 sentences) of the class's academic health and recommendations.
Class Stats:
- Class Name: {classStats.ClassName}
- Total Students: {classStats.TotalStudents}
- Class Average Attendance: {classStats.AvgAttendance:F1}%
- Class Average Marks Percentage: {classStats.AvgMarks:F1}%
- Students at High/Critical Risk: {classStats.AtRiskCount}
- Top Failing/Troubled Subjects: {failingSubjectsStr}

Write a concise paragraph detailing which subjects or student groups need most attention and action items for the faculty. Do not return any intro or outro text, only the paragraph.";

            if (_isMock)
            {
                var subjectTrouble = (classStats.FailingSubjects != null && classStats.FailingSubjects.Count > 0)
                    ? $"especially in {string.Join(" and ", classStats.FailingSubjects)}"
                    : "";
                return $"Class {classStats.ClassName} exhibits a stable overall average grade of {classStats.AvgMarks:F1}% and attendance of {classStats.AvgAttendance:F1}%, but remains vulnerable with {classStats.AtRiskCount} students flagged at high or critical risk levels. Immediate attention is required to address academic issues {subjectTrouble}, where failure rates are elevated. It is recommended to schedule special remedial classes, implement weekly attendance tracking reviews, and coordinate direct mentor-student outreach to support those who are currently lagging behind.";
            }

            try
            {
                return await CallNvidiaApiAsync(
                    "You are an educational director. Provide a direct, professional 1-paragraph summary with zero meta-commentary.",
                    prompt,
                    0.3,
                    200
                );
            }
            catch
            {
                return $"Class average marks stand at {classStats.AvgMarks:F1}% with an attendance rate of {classStats.AvgAttendance:F1}%. There are {classStats.AtRiskCount} student(s) at high/critical risk. Specialized attention is advised for failing subjects.";
            }
        }

        public async Task<string> GenerateSyllabusDataAsync(string university, string course)
        {
            var systemPrompt = "You are an academic curriculum designer. Provide a structured, clean markdown course syllabus layout matching the requested university and course with subjects, credits, and semester structure. Do not return intro/outro remarks.";
            var userPrompt = $@"Generate a detailed course structure and subjects list for:
University: {university}
Course: {course}

Format as:
## Semester 1
- **Subject Name**: Credits (Brief detail)
Include at least 4 key subjects per semester, structured credits, and relevant syllabus information.";

            if (_isMock)
            {
                return $@"# Syllabus for {course} ({university})

## Semester 1
- **Programming in C**: 4 Credits (Basics of C, loops, functions, arrays)
- **Computer Fundamentals**: 3 Credits (Introduction to computers, hardware, OS basics)
- **Mathematical Foundation**: 4 Credits (Discrete math, set theory, matrices)
- **Communication Skills**: 3 Credits (English grammar, verbal & non-verbal skills)

## Semester 2
- **Data Structures**: 4 Credits (Stacks, queues, linked lists, trees)
- **Database Management Systems**: 4 Credits (SQL, schema design, normalization)
- **Digital Electronics**: 3 Credits (Gates, boolean algebra, circuits)
- **Environmental Science**: 2 Credits (Ecosystems, pollution, resources)";
            }

            try
            {
                return await CallNvidiaApiAsync(systemPrompt, userPrompt, 0.4, 800);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to call NIM for syllabus generation");
                throw;
            }
        }

        public async Task<string> GeneratePersonalizedStudyPlanAsync(Student student, string weakSubjects, string learningSpeed, string upcomingExams)
        {
            var systemPrompt = "You are an expert academic advisor. Output a detailed, actionable weekly personalized study plan in clean Markdown. Structure it clearly. Do not return intro/outro remarks.";
            
            var marksStr = string.Join("\n", student.Marks.Select(m => $"- {m.SubjectName}: CT Avg={m.ClassTests.Select(t => t.Marks).DefaultIfEmpty(0).Average():F1}, Mid={m.MidTerm?.Marks}, House={m.HouseExam?.Marks}"));
            
            var userPrompt = $@"Create a personalized study plan for student:
Name: {student.Name}
Roll No: {student.RollNo}
Current Attendance: {student.Attendance:F1}%
Current Subject Performance:
{marksStr}

Mentor-specified Inputs:
- Weak Subjects: {weakSubjects}
- Learning Speed: {learningSpeed}
- Upcoming Exams: {upcomingExams}

Generate a weekly study schedule, priority tasks, subject allocation guide, and revision techniques customized for this student.";

            if (_isMock)
            {
                return $@"# AI Personalized Study Plan for {student.Name}

## Executive Summary
- **Learning Speed**: {learningSpeed}
- **Primary Focus**: {weakSubjects}
- **Upcoming Target**: {upcomingExams}
- **Current Attendance**: {student.Attendance:F1}%

## Weekly Schedule & Priority
- **Monday & Wednesday (Critical Review)**: Focus on **{weakSubjects}** for 2 hours. Review fundamentals, tackle 5 practices.
- **Tuesday & Thursday (Maintenance)**: Focus on other subjects for 1 hour. Solve 3 practices.
- **Friday (Revision)**: Mock assessments, time-limited tests.
- **Saturday (Doubt Clearing)**: Consult textbooks, library materials, or email mentor.

## Subject Priority Allocation
1. **{weakSubjects}** (High Priority - Daily 1.5 hours)
2. Remaining subjects (Medium Priority - Alternate days 1 hour)

## Recommended Techniques
- **Pomodoro Method**: 25 min study, 5 min break to maintain focus.
- **Feynman Technique**: Try explaining core concepts of weak subjects in simple terms to solidifying understanding.
- **Spaced Repetition**: Review notes 1 day, 3 days, and 7 days after learning.";
            }

            try
            {
                return await CallNvidiaApiAsync(systemPrompt, userPrompt, 0.5, 1000);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to call NIM for study plan generation");
                throw;
            }
        }
    }
}
