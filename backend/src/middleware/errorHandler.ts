import { Request, Response, NextFunction } from "express";
import ApiError from "../utils/Apperror.js";
const errorHandler = (
  error: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let statusCode = 500;
  let message = "Something went wrong in server";
  if (error instanceof ApiError) {
    statusCode = error.statuscode;
    message = error.message;
  }

  console.error(`[ERROR] ${req.method} ${req.originalUrl} - ${message}`);
  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default errorHandler;
