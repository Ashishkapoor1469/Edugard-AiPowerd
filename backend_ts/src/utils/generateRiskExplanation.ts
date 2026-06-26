import aiClient, { AI_MODEL } from "../config/aiClient.js";
import { IStudent } from "../models/Student.js";
import { calculateSubjectAverage } from "./calculateRisk.js";

// Helper to check if API key is mock
const isMockAPI = !process.env.NVIDIA_API_KEY || process.env.NVIDIA_API_KEY === "your_nvidia_nim_api_key";

export async function generateRiskExplanation(student: IStudent): Promise<string> {
  const attendanceStr = student.attendance !== null ? `${student.attendance}%` : "Not recorded";
  const marksSummary = student.marks
    .map((m) => {
      const avg = calculateSubjectAverage(m);
      const avgStr = avg !== null ? `${avg.toFixed(1)}%` : "No marks";
      return `${m.subjectName}: ${avgStr}`;
    })
    .join(", ");

  const prompt = `Analyze the student performance data and write a professional 2-3 sentence explanation of why they are classified as at ${student.riskLevel.toUpperCase()} risk (risk score: ${student.riskScore}/100).
  Student Profile:
  - Name: ${student.name}
  - Roll No: ${student.rollNo}
  - Course: ${student.course}
  - Class: ${student.class}
  - Attendance: ${attendanceStr}
  - Behavior: ${student.behavior || "Not assessed"}
  - Contributions: ${student.contribution.length > 0 ? student.contribution.join(", ") : "None"}
  - Subject Marks Breakdown: ${marksSummary}
  
  Explain the risk factors clearly and concisely. Focus on attendance, average marks, behavior, or missing data. Do not include markdown headers, json format, or introductory phrases. Output only 2-3 sentences.`;

  if (isMockAPI) {
    // Generate high quality mock explanation
    const factors: string[] = [];
    if (student.attendance !== null && student.attendance < 75) {
      factors.push(`attendance is low at ${student.attendance}% (below 75% threshold)`);
    }
    const lowSubjects = student.marks.filter((m) => {
      const avg = calculateSubjectAverage(m);
      return avg !== null && avg < 40;
    });
    if (lowSubjects.length > 0) {
      factors.push(`struggling in subjects like ${lowSubjects.map((s) => s.subjectName).join(", ")}`);
    }
    if (student.behavior === "bad") {
      factors.push("behavioral concerns have been flagged");
    }

    const factorStr = factors.length > 0 ? `due to ${factors.join(" and ")}` : "based on general academic parameters";
    return `${student.name} is classified as ${student.riskLevel.toUpperCase()} risk (${student.riskScore}/100) ${factorStr}. Early intervention is recommended to address these concerns and prevent academic decline.`;
  }

  try {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a professional educational analyst. Provide only the direct explanation without any conversational filler or prefaces.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 150,
    });
    return response.choices[0]?.message?.content?.trim() || "No response generated from AI.";
  } catch (error) {
    console.error("Error calling NVIDIA NIM API for explanation:", error);
    return `Calculated risk level is ${student.riskLevel} with score ${student.riskScore}/100. (AI explanation generation failed).`;
  }
}

export async function generateImprovementPlan(student: IStudent): Promise<string> {
  const attendanceStr = student.attendance !== null ? `${student.attendance}%` : "Not recorded";
  const failingSubjects = student.marks
    .filter((m) => {
      const avg = calculateSubjectAverage(m);
      return avg !== null && avg < 35;
    })
    .map((m) => m.subjectName)
    .join(", ");

  const prompt = `Generate a list of 5-7 actionable, encouraging academic improvement bullet points for this student:
  Student Profile:
  - Name: ${student.name}
  - Course: ${student.course}
  - Class: ${student.class}
  - Attendance: ${attendanceStr}
  - Behavior: ${student.behavior || "average"}
  - Failing Subjects (avg < 35%): ${failingSubjects || "None"}
  
  Format the output as plain lines of bullet points starting with a hyphen (-) and nothing else. No intro or outro text. Provide exactly 5 to 7 bullet points.`;

  if (isMockAPI) {
    const plans = [
      `Set a strict target to attend all remaining lectures to raise attendance above 75%.`,
      `Engage in daily 45-minute self-study sessions for ${failingSubjects || "core topics"}.`,
      `Schedule a weekly meeting with the course mentor for academic doubts resolution.`,
      `Submit all upcoming assignments at least 24 hours prior to the deadline to secure grace marks.`,
      `Improve active participation in classroom discussions and practical lab work.`,
      `Participate in peer group study sessions to review complex modules.`,
    ];
    return plans.map((p) => `- ${p}`).join("\n");
  }

  try {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert academic advisor. Output only the hyphenated bullet points, with no introductory or concluding statements.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 250,
    });
    return response.choices[0]?.message?.content?.trim() || "No plan generated.";
  } catch (error) {
    console.error("Error calling NVIDIA NIM API for plan:", error);
    return "- Attend remedial classes for failing subjects.\n- Improve daily lecture attendance.\n- Submit assignments on time.\n- Schedule peer study sessions.";
  }
}

export async function generateAIChatReply(
  student: IStudent,
  chatHistory: { sender: string; text: string }[],
  latestMessage: string
): Promise<string> {
  const attendanceStr = student.attendance !== null ? `${student.attendance}%` : "Not recorded";
  
  const historyText = chatHistory
    .slice(-10)
    .map((msg) => `${msg.sender.toUpperCase()}: ${msg.text}`)
    .join("\n");

  const prompt = `You are an encouraging and supportive academic mentor assistant. The human mentor is offline, so you are replying to the student in their place.
  Student Context:
  - Student Name: ${student.name}
  - Course: ${student.course}
  - Class: ${student.class}
  - Attendance: ${attendanceStr}
  - Risk Level: ${student.riskLevel}
  - Behavior: ${student.behavior || "average"}
  
  Review the conversation history and write a response to the student's latest message in 2-3 sentences. Be empathetic, constructive, and offer clear academic guidance.
  
  Conversation History:
  ${historyText}
  STUDENT: ${latestMessage}
  
  Response (2-3 sentences only, direct message to student, do not include any prefixes):`;

  if (isMockAPI) {
    if (latestMessage.toLowerCase().includes("attendance") || latestMessage.toLowerCase().includes("absent")) {
      return `Hi ${student.name}, I understand it can be difficult to make every session, but let's work together to get your attendance back on track. We can schedule a brief 10-minute chat after class tomorrow to review the lectures you missed.`;
    }
    if (latestMessage.toLowerCase().includes("exam") || latestMessage.toLowerCase().includes("marks") || latestMessage.toLowerCase().includes("fail")) {
      return `Please don't be discouraged by these recent results, ${student.name}. We can arrange some remedial tutoring sessions this week to go over the exam topics you found challenging. Let's make a plan to rebuild your confidence.`;
    }
    return `Hi ${student.name}, thank you for reaching out. I've noted your message and would love to help you work through these challenges. Let's schedule a time to meet briefly tomorrow to discuss this further.`;
  }

  try {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an empathetic college mentor. Respond directly and warmly to the student. Keep your response strictly under 3 sentences. Do not prepend any labels like 'MENTOR:' or 'AI:'.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.6,
      max_tokens: 150,
    });
    return response.choices[0]?.message?.content?.trim() || "I'm offline right now, but I will review your message soon and we can discuss this in our next class.";
  } catch (error) {
    console.error("Error calling NVIDIA NIM API for chat:", error);
    return "I hear your concerns and am happy to help you. Let's plan to connect in person after our next class to discuss this together.";
  }
}

export async function generateClassSummary(classStats: {
  className: string;
  totalStudents: number;
  avgAttendance: number;
  avgMarks: number;
  atRiskCount: number;
  failingSubjects: string[];
}): Promise<string> {
  const prompt = `Analyze the aggregated academic performance metrics for class ${classStats.className} and write a 1 paragraph professional summary (4-5 sentences) of the class's academic health and recommendations.
  Class Stats:
  - Class Name: ${classStats.className}
  - Total Students: ${classStats.totalStudents}
  - Class Average Attendance: ${classStats.avgAttendance.toFixed(1)}%
  - Class Average Marks Percentage: ${classStats.avgMarks.toFixed(1)}%
  - Students at High/Critical Risk: ${classStats.atRiskCount}
  - Top Failing/Troubled Subjects: ${classStats.failingSubjects.length > 0 ? classStats.failingSubjects.join(", ") : "None"}
  
  Write a concise paragraph detailing which subjects or student groups need most attention and action items for the faculty. Do not return any intro or outro text, only the paragraph.`;

  if (isMockAPI) {
    const subjectTrouble = classStats.failingSubjects.length > 0 
      ? `especially in ${classStats.failingSubjects.join(" and ")}`
      : "";
    return `Class ${classStats.className} exhibits a stable overall average grade of ${classStats.avgMarks.toFixed(1)}% and attendance of ${classStats.avgAttendance.toFixed(1)}%, but remains vulnerable with ${classStats.atRiskCount} students flagged at high or critical risk levels. Immediate attention is required to address academic issues ${subjectTrouble}, where failure rates are elevated. It is recommended to schedule special remedial classes, implement weekly attendance tracking reviews, and coordinate direct mentor-student outreach to support those who are currently lagging behind.`;
  }

  try {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an educational director. Provide a direct, professional 1-paragraph summary with zero meta-commentary.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    return response.choices[0]?.message?.content?.trim() || "No class summary generated.";
  } catch (error) {
    console.error("Error calling NVIDIA NIM API for class summary:", error);
    return `Class average marks stand at ${classStats.avgMarks.toFixed(1)}% with an attendance rate of ${classStats.avgAttendance.toFixed(1)}%. There are ${classStats.atRiskCount} student(s) at high/critical risk. Specialized attention is advised for failing subjects.`;
  }
}
