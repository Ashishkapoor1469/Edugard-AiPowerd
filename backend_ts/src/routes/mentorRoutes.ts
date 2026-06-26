import { Router, Response, NextFunction } from "express";
import {
  getMentors,
  getMentorStudents,
  updateMentorClasses,
  getMentorsList,
} from "../controllers/mentorController.js";
import authMiddleware, { AuthRequest } from "../middleware/authMiddleware.js";
import AppError from "../utils/AppError.js";

const router = Router();

// Apply auth to all mentor routes
router.use(authMiddleware as any);

router.get("/list", getMentorsList as any);

const restrictToAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    next(new AppError(403, "Access denied. Admin role required."));
  }
};

router.get("/", restrictToAdmin as any, getMentors as any);
router.get("/:id/students", getMentorStudents as any);
router.patch("/:id/classes", restrictToAdmin as any, updateMentorClasses as any);

export default router;
