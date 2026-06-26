import { Request, Response, NextFunction } from "express";
import AppError from "../utils/AppError.js";

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let success = false;

  // Log full stack trace for non-operational or 500 errors
  if (err instanceof AppError && err.isOperational) {
    console.warn(`[WARN] ${req.method} ${req.originalUrl} - ${statusCode}: ${message}`);
  } else {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} - Stack:`, err);
    // Hide details for raw internal server errors in production
    if (process.env.NODE_ENV === "production" && statusCode === 500) {
      message = "Something went wrong in the server. Please try again later.";
    }
  }

  res.status(statusCode).json({
    success,
    message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default errorHandler;
