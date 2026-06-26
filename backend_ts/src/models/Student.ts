import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcrypt";

export interface IClassTest {
  testNumber: number;
  marks: number;
  maxMarks: number;
}

export interface IExamMarks {
  marks: number | null;
  maxMarks: number;
}

export interface ISubjectMarks {
  subjectName: string;
  isPractical: boolean;
  classTests: IClassTest[];
  midTerm: IExamMarks;
  houseExam: IExamMarks;
}

export interface IStudent extends Document {
  rollNo: string;
  name: string;
  email?: string;
  password?: string;
  phoneNo?: string;
  isVerified: boolean;
  verificationToken?: string | null;
  course: string;
  class: string;
  mentorId?: mongoose.Types.ObjectId;
  semester: number;
  attendance: number | null;
  marks: ISubjectMarks[];
  behavior: "excellent" | "good" | "average" | "bad" | null;
  contribution: string[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  riskExplanation: string;
  aiImprovementPlan: string;
  notifications: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const classTestSchema = new Schema<IClassTest>(
  {
    testNumber: { type: Number, required: true },
    marks: { type: Number, required: true, min: 0 },
    maxMarks: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const examMarksSchema = new Schema<IExamMarks>(
  {
    marks: { type: Number, default: null, min: 0 },
    maxMarks: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const subjectMarksSchema = new Schema<ISubjectMarks>(
  {
    subjectName: { type: String, required: true, trim: true },
    isPractical: { type: Boolean, default: false },
    classTests: { type: [classTestSchema], default: [] },
    midTerm: { type: examMarksSchema, default: () => ({ marks: null, maxMarks: 100 }) },
    houseExam: { type: examMarksSchema, default: () => ({ marks: null, maxMarks: 100 }) },
  },
  { _id: false }
);

const studentSchema = new Schema<IStudent>(
  {
    rollNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: {
      type: String,
      select: false, // Don't return by default
    },
    phoneNo: { type: String, trim: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, default: null },
    course: { type: String, required: true, trim: true, index: true },
    class: { type: String, required: true, trim: true, index: true },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "Mentor",
      index: true,
    },
    semester: { type: Number, required: true, min: 1, max: 8 },
    attendance: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    marks: { type: [subjectMarksSchema], default: [] },
    behavior: {
      type: String,
      enum: ["excellent", "good", "average", "bad", null],
      default: null,
    },
    contribution: { type: [String], default: [] },
    riskScore: { type: Number, default: 0 },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
      index: true,
    },
    riskExplanation: { type: String, default: "" },
    aiImprovementPlan: { type: String, default: "" },
    notifications: [{ type: Schema.Types.ObjectId, ref: "Notification" }],
  },
  {
    timestamps: true,
  }
);

// Hash student password before saving
studentSchema.pre("save", async function (this: any) {
  if (!this.password) {
    // If no password, set a default of their rollNo
    this.password = this.rollNo;
  }
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
studentSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

// Indexes
studentSchema.index({ rollNo: 1 }, { unique: true });
studentSchema.index({ class: 1, riskLevel: 1 });
studentSchema.index({ mentorId: 1 });

export default mongoose.model<IStudent>("Student", studentSchema);
