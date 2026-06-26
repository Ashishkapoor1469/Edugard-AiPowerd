import { Request, Response, NextFunction } from "express";
import Mentor from "../models/Mentor.js";
import Student from "../models/Student.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

// Get all mentors (admin only)
export const getMentors = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const mentors = await Mentor.find().select("-password");
    res.status(200).json({
      success: true,
      count: mentors.length,
      data: mentors,
    });
  }
);

// Get students assigned to this mentor based on their classes
export const getMentorStudents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const mentor = await Mentor.findById(req.params.id);
    if (!mentor) {
      return next(new AppError(404, "Mentor not found"));
    }

    // Find students whose class matches any of mentor's assigned classes
    const students = await Student.find({
      class: { $in: mentor.assignedClasses },
    }).sort({ riskScore: -1 });

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  }
);

// Assign classes to mentor (admin only)
export const updateMentorClasses = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { assignedClasses } = req.body;

    if (!Array.isArray(assignedClasses)) {
      return next(new AppError(400, "assignedClasses must be an array of strings"));
    }

    const mentor = await Mentor.findByIdAndUpdate(
      req.params.id,
      { assignedClasses },
      { new: true, runValidators: true }
    );

    if (!mentor) {
      return next(new AppError(404, "Mentor not found"));
    }

    res.status(200).json({
      success: true,
      data: mentor,
    });
  }
);

// Get list of mentors with active student counts (accessible by students/mentors)
export const getMentorsList = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const mentors = await Mentor.find({ role: "mentor" }).select("name email assignedClasses");
    
    const result = [];
    for (const mentor of mentors) {
      const studentCount = await Student.countDocuments({ mentorId: mentor._id });
      result.push({
        _id: mentor._id,
        name: mentor.name,
        email: mentor.email,
        assignedClasses: mentor.assignedClasses,
        studentCount,
        capacity: 30,
      });
    }

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  }
);
