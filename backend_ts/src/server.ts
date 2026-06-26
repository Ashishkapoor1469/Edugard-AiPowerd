import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { setIO } from "./utils/socketManager.js";
import errorHandler from "./middleware/errorHandler.js";

// Routes imports
import authRoutes from "./routes/authRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import mentorRoutes from "./routes/mentorRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

// Models & AI Helpers
import Mentor from "./models/Mentor.js";
import Student from "./models/Student.js";
import Message from "./models/Message.js";
import { generateAIChatReply } from "./utils/generateRiskExplanation.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Middlewares
app.use(cors({ origin: "*" })); // In development, allow all origins
app.use(express.json());

// Set up routes
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/mentors", mentorRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);

// Catch-all route
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global Error Handler Middleware
app.use(errorHandler as any);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

setIO(io);

// Socket.io Events
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Mentor goes online
  socket.on("mentor:online", async (mentorId: string) => {
    if (!mentorId) return;
    try {
      socket.data.mentorId = mentorId;
      await Mentor.findByIdAndUpdate(mentorId, { isOnline: true });
      // Join mentor's personal notification room
      socket.join(mentorId);
      console.log(`Mentor ${mentorId} is online and joined room.`);
      io.emit("mentor:status", { mentorId, isOnline: true });
    } catch (err) {
      console.error("Error in mentor:online event:", err);
    }
  });

  // Join a Chat Room
  socket.on("joinRoom", (roomId: string) => {
    if (!roomId) return;
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room: ${roomId}`);
  });

  // Send Chat Message
  socket.on(
    "sendMessage",
    async (data: {
      roomId: string;
      studentId: string;
      mentorId: string;
      sender: "student" | "mentor" | "ai";
      text: string;
    }) => {
      const { roomId, studentId, mentorId, sender, text } = data;
      if (!roomId || !studentId || !mentorId || !text) return;

      try {
        // Save user message to database
        const savedMessage = await Message.create({
          studentId,
          mentorId,
          sender,
          text,
        });

        // Broadcast to chat room
        io.to(roomId).emit("newMessage", savedMessage);

        // If the sender is a student, check if mentor is offline to trigger AI reply
        if (sender === "student") {
          const mentor = await Mentor.findById(mentorId);
          if (mentor && !mentor.isOnline) {
            // Find student details for context
            const student = await Student.findById(studentId);
            if (student) {
              // Retrieve chat history for AI context
              const history = await Message.find({ studentId, mentorId })
                .sort({ createdAt: -1 })
                .limit(10);
              const historyChronological = history
                .map((m) => ({ sender: m.sender, text: m.text }))
                .reverse();

              // Emit a typing indicator
              io.to(roomId).emit("typing", { sender: "ai", isTyping: true });

              // Generate AI response
              const aiReplyText = await generateAIChatReply(
                student,
                historyChronological,
                text
              );

              // Save AI message to DB
              const aiMessage = await Message.create({
                studentId,
                mentorId,
                sender: "ai",
                text: aiReplyText,
              });

              // Stop typing and broadcast AI message
              io.to(roomId).emit("typing", { sender: "ai", isTyping: false });
              io.to(roomId).emit("newMessage", aiMessage);
            }
          }
        }
      } catch (err) {
        console.error("Error handling sendMessage socket event:", err);
        socket.emit("error", { message: "Failed to send message" });
      }
    }
  );

  // Disconnect event
  socket.on("disconnect", async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const mentorId = socket.data.mentorId;
    if (mentorId) {
      try {
        // Check if mentor has any other active socket connections
        const activeSockets = await io.in(mentorId).fetchSockets();
        if (activeSockets.length === 0) {
          await Mentor.findByIdAndUpdate(mentorId, { isOnline: false });
          console.log(`Mentor ${mentorId} went offline.`);
          io.emit("mentor:status", { mentorId, isOnline: false });
        }
      } catch (err) {
        console.error("Error updating online status on disconnect:", err);
      }
    }
  });
});

// Start Server
httpServer.listen(port, () => {
  console.log(`EduGuard Server running on port ${port}`);
});
