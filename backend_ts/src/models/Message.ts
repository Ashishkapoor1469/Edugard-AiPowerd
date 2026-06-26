import mongoose, { Schema, Document } from "mongoose";

export interface IMessage extends Document {
  studentId: mongoose.Types.ObjectId;
  mentorId: mongoose.Types.ObjectId;
  sender: "student" | "mentor" | "ai";
  text: string;
}

const messageSchema = new Schema<IMessage>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "Mentor",
      required: true,
    },
    sender: { type: String, enum: ["student", "mentor", "ai"], required: true },
    text: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IMessage>("Message", messageSchema);
