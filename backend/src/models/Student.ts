import mongoose, { Schema, Document } from "mongoose";

export interface ISubjectMarks {
  subjectName: string;
  isPractical: boolean;
  classTests: number[];
  midTerm: number | null;
  houseExam: number | null;
}

export interface IStudent extends Document {
  rollNo: string;
  name: string;
  email?: string;
  class?: string;
  mentorId?: mongoose.Types.ObjectId;
  attendence: number | null;
  marks: ISubjectMarks[];
  behavior: "good" | "average" | "bad" | null;
  contribution: string[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  riskExplanation: string;
}

const subjectMarksSchema = new Schema<ISubjectMarks>(
  {
    subjectName: { type: String, required: true, trim: true },
    isPractical: { type: Boolean, default: false },
    classTests: { type: [Number], default: [] },
    midTerm: { type: Number, default: null, min: 0, max: 100 },
    houseExam: { type: Number, default: null, min: 0, max: 100 },
  },
  {
    _id: false,
  },
);
const studentSchema = new Schema<IStudent>(
  {
    rollNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    class: { type: String, trim: true, index: true },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "Mentor",
    },
    attendence: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    marks: { type: [subjectMarksSchema], default: [] },
    behavior: { type: String, enum: ["good", "average", "bad"], default: null },
    contribution: { type: [String], default: [] },
    riskScore: { type: Number, default: 0 },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    riskExplanation: {
      type: String,
      defualt: "",
    },
  },
  {
    timestamps: true,
  },
);

studentSchema.index({ class: 1, riskLevel: 1 });
export default mongoose.model<IStudent>("Student", studentSchema);
