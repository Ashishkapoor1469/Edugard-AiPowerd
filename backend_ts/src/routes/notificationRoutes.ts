import { Router } from "express";
import {
  getNotifications,
  markRead,
  markAllRead,
  deleteNotification,
} from "../controllers/notificationController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

// Apply auth to all notification routes
router.use(authMiddleware as any);

router.get("/", getNotifications as any);
router.patch("/read-all", markAllRead as any);
router.patch("/:id/read", markRead as any);
router.delete("/:id", deleteNotification as any);

export default router;
