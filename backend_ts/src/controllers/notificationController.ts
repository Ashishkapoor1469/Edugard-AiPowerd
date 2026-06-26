import { Request, Response, NextFunction } from "express";
import Notification from "../models/Notification.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import { AuthRequest } from "../middleware/authMiddleware.js";

export const getNotifications = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    const { isRead, type, priority } = req.query;
    const query: any = { mentorId: req.user._id };

    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }
    if (type) {
      query.type = type;
    }
    if (priority) {
      query.priority = priority;
    }

    const notifications = await Notification.find(query)
      .populate("studentId", "name rollNo class riskLevel riskScore")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  }
);

export const markRead = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, mentorId: req.user._id } as any,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return next(new AppError(404, "Notification not found or access denied"));
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  }
);

export const markAllRead = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    await Notification.updateMany(
      { mentorId: req.user._id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  }
);

export const deleteNotification = catchAsync(
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Not authenticated"));
    }

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      mentorId: req.user._id,
    } as any);

    if (!notification) {
      return next(new AppError(404, "Notification not found or access denied"));
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  }
);
