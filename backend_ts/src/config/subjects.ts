export interface SubjectDefinition {
  code: string;
  name: string;
  isPractical: boolean;
}

export type CourseType = "BCA" | "BBA" | "BTECH" | "BSC" | "BCOM";

/**
 * Semester-wise subject definitions per course.
 * Structure: COURSE_SUBJECTS[course][semester] => SubjectDefinition[]
 */
export const COURSE_SUBJECTS: Record<string, Record<number, SubjectDefinition[]>> = {
  BCA: {
    1: [
      { code: "BCA0101", name: "Mathematics-I", isPractical: false },
      { code: "BCA0102", name: "Applied English", isPractical: false },
      { code: "BCA0103", name: "Computer Fundamentals", isPractical: false },
      { code: "BCA0104", name: "C Programming", isPractical: false },
      { code: "BCA0105", name: "Office Automation Tools", isPractical: false },
      { code: "BCA0104(P)", name: "C Programming Lab", isPractical: true },
      { code: "BCA0105(P)", name: "Office Automation Tools Lab", isPractical: true },
    ],
    2: [
      { code: "BCA0201", name: "Mathematics-II", isPractical: false },
      { code: "BCA0202", name: "Communicative English", isPractical: false },
      { code: "BCA0203", name: "Digital Electronics", isPractical: false },
      { code: "BCA0204", name: "Data Structures", isPractical: false },
      { code: "BCA0205", name: "Data Base Management System", isPractical: false },
      { code: "BCA0204(P)", name: "Data Structures Lab", isPractical: true },
      { code: "BCA0205(P)", name: "DBMS Lab", isPractical: true },
    ],
    3: [
      { code: "BCA0301", name: "Mathematics-III", isPractical: false },
      { code: "BCA0302", name: "Business Practices and Management", isPractical: false },
      { code: "BCA0303", name: "Object-Oriented Programming with C++", isPractical: false },
      { code: "BCA0304", name: "Desktop Publishing and Designing", isPractical: false },
      { code: "BCA0305", name: "Statistical Methods", isPractical: false },
      { code: "BCA0303(P)", name: "OOP with C++ Lab", isPractical: true },
      { code: "BCA0304(P)", name: "Desktop Publishing Lab", isPractical: true },
    ],
    4: [
      { code: "BCA0401", name: "Personnel Management", isPractical: false },
      { code: "BCA0402", name: "Accounting and Financial Management", isPractical: false },
      { code: "BCA0403", name: "System Analysis and Design", isPractical: false },
      { code: "BCA0404", name: "Internet Technology & Web Page Design", isPractical: false },
      { code: "BCA0405", name: "Programming in Visual Basic", isPractical: false },
      { code: "BCA0404(P)", name: "Web Page Design Lab", isPractical: true },
      { code: "BCA0405(P)", name: "Visual Basic Lab", isPractical: true },
    ],
    5: [
      { code: "BCA0501", name: "Operating System", isPractical: false },
      { code: "BCA0502", name: "Software Engineering", isPractical: false },
      { code: "BCA0503", name: "Object-Oriented Programming with Java", isPractical: false },
      { code: "BCA0504", name: "Computer Graphics", isPractical: false },
      { code: "BCA0503(P)", name: "Java Programming Lab", isPractical: true },
      { code: "BCA0504(P)", name: "Computer Graphics Lab", isPractical: true },
    ],
    6: [
      { code: "BCA0601", name: "Computer Networks", isPractical: false },
      { code: "BCA0602", name: "Numerical Methods", isPractical: false },
      { code: "BCA0603", name: "Multimedia Applications", isPractical: false },
      { code: "BCA0604", name: "Major Project", isPractical: false },
      { code: "BCA0605", name: "Seminar", isPractical: false },
      { code: "BCA0603(P)", name: "Multimedia Applications Lab", isPractical: true },
    ],
  },
  BBA: {
    1: [
      { code: "BBA101", name: "Principles of Management", isPractical: false },
      { code: "BBA102", name: "Business Communication", isPractical: false },
      { code: "BBA103", name: "Microeconomics", isPractical: false },
      { code: "BBA104", name: "Financial Accounting", isPractical: false },
      { code: "BBA105", name: "Business Mathematics", isPractical: false },
    ],
  },
  BTECH: {
    1: [
      { code: "BT101", name: "Engineering Mathematics", isPractical: false },
      { code: "BT102", name: "Engineering Physics", isPractical: false },
      { code: "BT103", name: "Engineering Chemistry", isPractical: false },
      { code: "BT104", name: "Programming Fundamentals", isPractical: false },
      { code: "BT102(P)", name: "Physics Lab", isPractical: true },
      { code: "BT103(P)", name: "Chemistry Lab", isPractical: true },
      { code: "BT104(P)", name: "Programming Lab", isPractical: true },
    ],
  },
};

/**
 * Get subjects for a given course and semester.
 * Falls back to an empty array if no config is found.
 */
export function getSubjectsForSemester(course: string, semester: number): SubjectDefinition[] {
  const courseConfig = COURSE_SUBJECTS[course.toUpperCase()];
  if (!courseConfig) return [];
  return courseConfig[semester] || [];
}

/**
 * Get all subjects across all semesters for a given course (flat list).
 */
export function getAllSubjectsForCourse(course: string): SubjectDefinition[] {
  const courseConfig = COURSE_SUBJECTS[course.toUpperCase()];
  if (!courseConfig) return [];
  const allSubjects: SubjectDefinition[] = [];
  for (const semester of Object.keys(courseConfig)) {
    const subs = courseConfig[Number(semester)];
    if (subs) {
      allSubjects.push(...subs);
    }
  }
  return allSubjects;
}
