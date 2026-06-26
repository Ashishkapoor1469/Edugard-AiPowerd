import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcrypt";

export interface IMentor extends Document {
  name: string;
  email: string;
  password?: string;
  role: "mentor" | "admin";
  assignedClasses: string[];
  isOnline: boolean;
  comparePassword(candidate: string): Promise<boolean>;
}

const mentorSchema = new Schema<IMentor>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ["mentor", "admin"],
      default: "mentor",
    },
    assignedClasses: {
      type: [String],
      default: [],
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
mentorSchema.pre("save", async function (this: any) {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password as string, salt);
});

// Compare password method
mentorSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IMentor>("Mentor", mentorSchema);
