export interface User {
  id: string;
  name: string;
  email: string;
  role: "librarian" | "college-admin" | "student";
  collegeId: string;
}

export interface PhysicalCopy {
  accessionNumber: string;
  barcode: string;
  status: "available" | "issued" | "reserved" | "lost" | "damaged" | "missing" | "repair" | "withdrawn";
  shelfLocation: string;
  conditionNotes?: string;
  addedAt?: string;
}

export interface Book {
  _id: string;
  isbn: string;
  title: string;
  author: string;
  category: string;
  department?: string;
  language?: string;
  publisher?: string;
  edition?: string;
  tags?: string[];
  totalCopies: number;
  availableCopies: number;
  shelfLocation: string;
  coverImage: string;
  borrowCount: number;
  physicalCopies?: PhysicalCopy[];
}

export interface Issuance {
  _id: string;
  studentId: string;
  bookId: string;
  accessionNumber?: string;
  bookTitle: string;
  issueDate: string;
  dueDate: string;
  loanDays: number;
  returnedAt?: string;
  status: string;
  renewalCount: number;
}

export interface Reservation {
  _id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  loanDays: number;
  status: string;
  createdAt: string;
}

export interface Fine {
  _id: string;
  studentId: string;
  bookTitle: string;
  amount: number;
  paidAmount: number;
  waivedAmount: number;
  status: string;
}

export interface LibraryStudent {
  _id: string;
  eduGuardStudentId: string;
  name: string;
  rollNo: string;
  email: string;
  phoneNo?: string;
  course?: string;
  className: string;
  semester: number;
  registeredAt: string;
}

export interface EduGuardStudent extends Omit<LibraryStudent, "_id" | "eduGuardStudentId" | "registeredAt"> {
  id: string;
  registered: boolean;
}

export interface LibraryAnnouncement {
  _id?: string;
  title: string;
  content: string;
  targetAudience: "all" | "students" | "librarians";
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface LibraryAudit {
  _id: string;
  collegeId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, string>;
  createdAt: string;
}

