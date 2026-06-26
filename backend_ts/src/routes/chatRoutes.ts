import { Router } from "express";
import { getMessages } from "../controllers/chatController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

// Apply auth to all chat routes
router.use(authMiddleware as any);

router.get("/:studentId", getMessages as any);

export default router;
