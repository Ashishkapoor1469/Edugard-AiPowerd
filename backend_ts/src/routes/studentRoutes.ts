import { Router } from "express";
import {
  uploadStudents,
  getStudents,
  getStudentProfile,
  updateStudent,
  getStudentExplanation,
  getStudentImprovementPlan,
  getClassSummaryController,
  getStatsController,
  selectMentor,
} from "../controllers/studentController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import upload from "../middleware/upload.js";

const router = Router();

// Apply authMiddleware to all student routes
router.use(authMiddleware as any);

router.post("/upload", upload.single("file"), uploadStudents as any);
router.get("/", getStudents as any);
router.get("/stats", getStatsController as any);
router.patch("/select-mentor", selectMentor as any);
router.get("/:id", getStudentProfile as any);
router.patch("/:id", updateStudent as any);
router.get("/:id/explanation", getStudentExplanation as any);
router.get("/:id/improvement", getStudentImprovementPlan as any);
router.get("/class/:className/summary", getClassSummaryController as any);

export default router;
