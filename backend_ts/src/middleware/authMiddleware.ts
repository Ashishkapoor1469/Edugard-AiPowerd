import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Mentor, { IMentor } from "../models/Mentor.js";
import Student, { IStudent } from "../models/Student.js";
import AppError from "../utils/AppError.js";

// Extend Request interface locally to support dual resolve
export interface AuthRequest extends Request {
  user?: IMentor;
  student?: IStudent;
  role?: "admin" | "mentor" | "student";
}

const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return next(new AppError(401, "Not authorized, token is missing"));
    }

    const secret = process.env.JWT_SECRET || "your_jwt_secret_key";
    
    // Verify token
    const decoded = jwt.verify(token, secret) as { id: string };

    // 1. Try to find in Mentor (admin or mentor)
    const mentor = await Mentor.findById(decoded.id);
    if (mentor) {
      req.user = mentor;
      req.role = mentor.role;
      return next();
    }

    // 2. Try to find in Student
    const student = await Student.findById(decoded.id);
    if (student) {
      req.student = student;
      req.role = "student";
      return next();
    }

    return next(new AppError(401, "Not authorized, user profile not found"));
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return next(new AppError(401, "Session expired, please login again"));
    }
    return next(new AppError(401, "Not authorized, token verification failed"));
  }
};

export default authMiddleware;
