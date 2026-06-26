import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Mentor from "../models/Mentor.js";
import Student from "../models/Student.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

const signToken = (id: string): string => {
  const secret = process.env.JWT_SECRET || "your_jwt_secret_key";
  return jwt.sign({ id }, secret, {
    expiresIn: "30d",
  });
};

export const register = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, password, role, assignedClasses } = req.body;

    if (!name || !email || !password) {
      return next(new AppError(400, "Please provide name, email and password"));
    }

    // Check if mentor already exists
    const existing = await Mentor.findOne({ email });
    if (existing) {
      return next(new AppError(400, "Email is already registered"));
    }

    const mentor = await Mentor.create({
      name,
      email,
      password,
      role: role || "mentor",
      assignedClasses: assignedClasses || [],
      isOnline: false,
    });

    const token = signToken((mentor._id as any).toString());

    res.status(201).json({
      success: true,
      token,
      data: {
        id: mentor._id,
        name: mentor.name,
        email: mentor.email,
        role: mentor.role,
        assignedClasses: mentor.assignedClasses,
      },
    });
  }
);

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError(400, "Please provide email and password"));
    }

    // 1. Try to log in as Mentor
    const mentor = await Mentor.findOne({ email }).select("+password");
    if (mentor && (await mentor.comparePassword(password))) {
      const token = signToken((mentor._id as any).toString());
      return res.status(200).json({
        success: true,
        token,
        data: {
          id: mentor._id,
          name: mentor.name,
          email: mentor.email,
          role: mentor.role,
          assignedClasses: mentor.assignedClasses,
        },
      });
    }

    // 2. Try to log in as Student (strictly by email)
    const student = await Student.findOne({ email: email.toLowerCase() }).select("+password");

    if (student) {
      if (!student.isVerified) {
        return next(new AppError(401, "Account is not verified. Please check your email to activate."));
      }

      if (await student.comparePassword(password)) {
        const token = signToken((student._id as any).toString());
        return res.status(200).json({
          success: true,
          token,
          data: {
            id: student._id,
            name: student.name,
            email: student.email,
            role: "student",
            rollNo: student.rollNo,
            course: student.course,
            class: student.class,
            mentorId: student.mentorId,
          },
        });
      }
    }

    return next(new AppError(401, "Invalid email or password"));
  }
);

export const getMe = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.role === "student" && req.student) {
      return res.status(200).json({
        success: true,
        data: {
          id: req.student._id,
          name: req.student.name,
          email: req.student.email,
          role: "student",
          rollNo: req.student.rollNo,
          course: req.student.course,
          class: req.student.class,
          mentorId: req.student.mentorId,
        },
      });
    }

    if (req.user) {
      return res.status(200).json({
        success: true,
        data: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          assignedClasses: req.user.assignedClasses,
        },
      });
    }

    return next(new AppError(401, "You are not logged in"));
  }
);

export const verifyAndSetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      return next(new AppError(400, "Please provide email, token, and password"));
    }

    const student = await Student.findOne({
      email: email.toLowerCase(),
      verificationToken: token,
    });

    if (!student) {
      return next(new AppError(400, "Invalid email or verification token"));
    }

    // Set password, verify student, and clear token
    student.password = password;
    student.isVerified = true;
    student.verificationToken = null;

    await student.save();

    res.status(200).json({
      success: true,
      message: "Account verified and password set successfully. You can now log in.",
    });
  }
);
