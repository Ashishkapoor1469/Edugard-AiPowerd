import { Router } from "express";
import { register, login, getMe, verifyAndSetPassword } from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-set-password", verifyAndSetPassword);
router.get("/me", authMiddleware as any, getMe as any);

export default router;
