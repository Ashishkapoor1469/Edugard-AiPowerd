import mongoose from "mongoose";
import dotenv from "dotenv";
import Mentor from "../models/Mentor.js";
import Student from "../models/Student.js";
import { calculateRisk } from "../utils/calculateRisk.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://kapoorashish714_db_user:6BwvdR5PQwQtx4uY@cluster0.qjdjvy8.mongodb.net/eduguard?retryWrites=true&w=majority";

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB Atlas for seeding...");

    // 1. Seed or find default mentor
    const mentorEmail = "mentor@eduguard.com";
    let mentor = await Mentor.findOne({ email: mentorEmail });

    if (!mentor) {
      mentor = await Mentor.create({
        name: "Professor Ashish",
        email: mentorEmail,
        password: "password123",
        role: "mentor",
        assignedClasses: ["BCA-A", "BCA-B", "BBA-A", "BTECH-A"],
        isOnline: false,
      });
      console.log("Seeded default mentor successfully!");
    } else {
      console.log("Mentor user 'mentor@eduguard.com' already exists.");
    }

    // 2. Define mock students
    const mockStudents = [
      {
        rollNo: "BCA-2026-001",
        name: "Ashish Kumar",
        email: "student@eduguard.com",
        password: "password123",
        phoneNo: "+919876543210",
        isVerified: true,
        course: "BCA",
        class: "BCA-A",
        semester: 1,
        attendance: 85,
        behavior: "good",
        contribution: ["Code Club", "Tech Fest"],
        marks: [
          {
            subjectName: "Mathematics-I",
            isPractical: false,
            classTests: [
              { testNumber: 1, marks: 18, maxMarks: 20 },
              { testNumber: 2, marks: 16, maxMarks: 20 }
            ],
            midTerm: { marks: 82, maxMarks: 100 },
            houseExam: { marks: 78, maxMarks: 100 }
          },
          {
            subjectName: "C Programming",
            isPractical: true,
            classTests: [
              { testNumber: 1, marks: 19, maxMarks: 20 },
              { testNumber: 2, marks: 17, maxMarks: 20 }
            ],
            midTerm: { marks: 88, maxMarks: 100 },
            houseExam: { marks: 91, maxMarks: 100 }
          },
          {
            subjectName: "Computer Fundamentals",
            isPractical: false,
            classTests: [
              { testNumber: 1, marks: 15, maxMarks: 20 }
            ],
            midTerm: { marks: 75, maxMarks: 100 },
            houseExam: { marks: 80, maxMarks: 100 }
          }
        ]
      },
      {
        rollNo: "BCA-2026-002",
        name: "Rahul Sharma",
        email: "rahul@eduguard.com",
        password: "password123",
        phoneNo: "+919876543211",
        isVerified: true,
        course: "BCA",
        class: "BCA-A",
        semester: 1,
        attendance: 45, // High risk due to attendance < 50%
        behavior: "bad", // High risk due to behavior
        contribution: [],
        marks: [
          {
            subjectName: "Mathematics-I",
            isPractical: false,
            classTests: [
              { testNumber: 1, marks: 6, maxMarks: 20 },
              { testNumber: 2, marks: 5, maxMarks: 20 }
            ],
            midTerm: { marks: 32, maxMarks: 100 }, // failing
            houseExam: { marks: 28, maxMarks: 100 } // failing
          },
          {
            subjectName: "C Programming",
            isPractical: true,
            classTests: [
              { testNumber: 1, marks: 8, maxMarks: 20 }
            ],
            midTerm: { marks: 42, maxMarks: 100 },
            houseExam: { marks: 35, maxMarks: 100 }
          }
        ]
      },
      {
        rollNo: "BCA-2026-003",
        name: "Priya Patel",
        email: "priya@eduguard.com",
        password: "password123",
        phoneNo: "+919876543212",
        isVerified: true,
        course: "BCA",
        class: "BCA-A",
        semester: 1,
        attendance: 72, // Medium risk due to attendance 50-74%
        behavior: "average",
        contribution: ["Cultural Coordinator"],
        marks: [
          {
            subjectName: "Mathematics-I",
            isPractical: false,
            classTests: [
              { testNumber: 1, marks: 12, maxMarks: 20 }
            ],
            midTerm: { marks: 58, maxMarks: 100 },
            houseExam: { marks: 62, maxMarks: 100 }
          },
          {
            subjectName: "C Programming",
            isPractical: true,
            classTests: [
              { testNumber: 1, marks: 14, maxMarks: 20 }
            ],
            midTerm: { marks: 65, maxMarks: 100 },
            houseExam: { marks: 68, maxMarks: 100 }
          }
        ]
      }
    ];

    // 3. Insert and calculate risk for each mock student
    for (const studentData of mockStudents) {
      // Delete existing student with same email or rollNo to avoid duplicate index errors
      await Student.deleteOne({ $or: [{ email: studentData.email }, { rollNo: studentData.rollNo }] });

      // Create model instance
      const studentInstance = new Student({
        ...studentData,
        mentorId: mentor._id
      });

      // Calculate risk score and level
      const riskResult = calculateRisk(studentInstance);
      studentInstance.riskScore = riskResult.riskScore;
      studentInstance.riskLevel = riskResult.riskLevel;

      await studentInstance.save();
      console.log(`Seeded student: ${studentInstance.name} (RollNo: ${studentInstance.rollNo}) with Risk Score: ${studentInstance.riskScore}% (${studentInstance.riskLevel})`);
    }

    console.log("\nAll mock student data seeded successfully!");
    console.log("==================================================");
    console.log("MENTOR CREDENTIALS:");
    console.log("Email: mentor@eduguard.com");
    console.log("Password: password123");
    console.log("--------------------------------------------------");
    console.log("STUDENT CREDENTIALS:");
    console.log("Email: student@eduguard.com");
    console.log("Password: password123");
    console.log("==================================================\n");

  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

seed();
