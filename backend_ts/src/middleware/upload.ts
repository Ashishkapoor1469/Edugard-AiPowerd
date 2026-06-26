import multer from "multer";
import type { Request } from "express";
import AppError from "../utils/AppError.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const originalName = file.originalname || "";
    const ext = originalName.slice(originalName.lastIndexOf(".")).toLowerCase();
    const allowed = [".xlsx", ".xls"];

    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError(400, "Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
});

export default upload;
