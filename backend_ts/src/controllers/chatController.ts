import { Request, Response, NextFunction } from "express";
import Message from "../models/Message.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

// Fetch message history for a specific student and the logged-in mentor
export const getMessages = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    const { studentId } = req.params;
    if (!studentId) {
      return next(new AppError(400, "Please provide studentId"));
    }

    const messages = await Message.find({
      studentId: studentId,
      mentorId: req.user._id,
    }).sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  }
);
