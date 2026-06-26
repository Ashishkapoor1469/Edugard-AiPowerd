import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  mentorId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  type: "high_risk" | "attendance_drop" | "marks_drop" | "behavior_change" | "critical_alert";
  message: string;
  isRead: boolean;
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "Mentor",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    type: {
      type: String,
      enum: ["high_risk", "attendance_drop", "marks_drop", "behavior_change", "critical_alert"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "low",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying unread notifications for a mentor
notificationSchema.index({ mentorId: 1, isRead: 1 });

export default mongoose.model<INotification>("Notification", notificationSchema);
