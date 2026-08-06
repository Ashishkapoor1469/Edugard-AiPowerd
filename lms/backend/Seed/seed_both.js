const { MongoClient, ObjectId } = require('mongodb');

const EDUGUARD_URI = 'mongodb+srv://kapoorashish714_db_user:6BwvdR5PQwQtx4uY@cluster0.qjdjvy8.mongodb.net/eduguard?retryWrites=true&w=majority';
const LMS_URI = 'mongodb+srv://kapoorashish714_db_user:BfPlxjWxqurQ6B3O@cluster0.eqfqbiz.mongodb.net/eduguard_lms?retryWrites=true&w=majority&appName=Cluster0';

const CEC_ID = '6a453bea6e6992abc402a10';
const DCR_ID = '6a476d19895a35a0e96a2fcd';

async function main() {
  console.log('=== EduGuard + LMS Node.js Seeder (Both Colleges, Both DBs) ===\n');

  // Connect to both clusters
  const egClient = new MongoClient(EDUGUARD_URI);
  const lmsClient = new MongoClient(LMS_URI);

  await egClient.connect();
  console.log('[EduGuard DB] Connected to cluster0.qjdjvy8');
  await lmsClient.connect();
  console.log('[LMS DB] Connected to cluster0.eqfqbiz');

  const egDb = egClient.db('eduguard');
  const lmsDb = lmsClient.db('eduguard_lms');

  // ==============================
  // COLLEGE 1: Chandigarh Engineering College
  // ==============================
  console.log('\n=== 1. Chandigarh Engineering College (Tech & Engineering) ===');

  // 1A. Degrees
  await egDb.collection('degrees').deleteMany({ collegeId: new ObjectId(CEC_ID) });
  const cecDegrees = [
    { name: 'B.Tech CSE', durationYears: 4 },
    { name: 'B.Tech ECE', durationYears: 4 },
    { name: 'BCA', durationYears: 3 },
    { name: 'MCA', durationYears: 2 },
    { name: 'M.Tech', durationYears: 2 }
  ];
  await egDb.collection('degrees').insertMany(cecDegrees.map(d => ({
    collegeId: new ObjectId(CEC_ID), ...d, createdAt: new Date(), updatedAt: new Date()
  })));
  console.log('  [EduGuard DB] Seeded 5 degrees: B.Tech CSE, B.Tech ECE, BCA, MCA, M.Tech');

  // 1B. Fetch existing CEC students from EduGuard
  const cecStudents = await egDb.collection('students').find({
    $or: [{ collegeId: CEC_ID }, { collegeId: new ObjectId(CEC_ID) }]
  }).toArray();
  console.log(`  [EduGuard DB] Found ${cecStudents.length} existing students`);

  // 1C. LMS Settings
  await lmsDb.collection('settings').replaceOne(
    { collegeId: CEC_ID },
    {
      collegeId: CEC_ID, defaultIssueLimit: 2,
      degreeIssueLimits: { 'BCA': 3, 'B.Tech CSE': 4, 'M.Tech': 5 },
      loanDays: 14, maxRenewalCount: 1, dailyFineRate: 5, fineAlertThreshold: 50,
      importantOverdueDays: 7, holidays: ['2026-08-15', '2026-10-02', '2026-12-25'],
      catalogVersion: 1, updatedAt: new Date()
    },
    { upsert: true }
  );

  // 1D. LMS Students for CEC
  for (const s of cecStudents) {
    await lmsDb.collection('students').replaceOne(
      { collegeId: CEC_ID, eduGuardStudentId: s._id.toString() },
      {
        collegeId: CEC_ID, eduGuardStudentId: s._id.toString(),
        name: s.name || 'Student', rollNo: s.rollNo || 'CEC-001',
        email: s.email || '', phoneNo: s.phoneNo || '9876543210',
        course: s.course || 'B.Tech CSE', className: s.class || 'CS-5A',
        semester: s.semester || 5,
        registeredBy: '6a453bea6e6992abc402a15',
        registeredAt: new Date(), updatedAt: new Date()
      },
      { upsert: true }
    );
  }
  console.log(`  [LMS DB] Seeded ${cecStudents.length} student library profiles`);

  // 1E. CEC Engineering Books (25 titles)
  const cecBooks = [
    { isbn: '9780262046305', title: 'Introduction to Algorithms', author: 'Thomas H. Cormen', category: 'Computer Science', dept: 'Computer Science', pub: 'MIT Press', ed: '4th', copies: 5, shelf: 'CS-A1' },
    { isbn: '9780078022159', title: 'Database System Concepts', author: 'Abraham Silberschatz', category: 'Databases', dept: 'Computer Science', pub: 'McGraw-Hill', ed: '7th', copies: 4, shelf: 'CS-B1' },
    { isbn: '9780132350884', title: 'Clean Code', author: 'Robert C. Martin', category: 'Software Engineering', dept: 'Computer Science', pub: 'Prentice Hall', ed: '1st', copies: 3, shelf: 'CS-C1' },
    { isbn: '9780134685991', title: 'Effective Java', author: 'Joshua Bloch', category: 'Programming', dept: 'Computer Science', pub: 'Addison-Wesley', ed: '3rd', copies: 4, shelf: 'CS-A2' },
    { isbn: '9780201633610', title: 'Design Patterns', author: 'Erich Gamma', category: 'Software Engineering', dept: 'Computer Science', pub: 'Addison-Wesley', ed: '1st', copies: 3, shelf: 'CS-C2' },
    { isbn: '9780131103627', title: 'The C Programming Language', author: 'Brian W. Kernighan', category: 'Programming', dept: 'Computer Science', pub: 'Prentice Hall', ed: '2nd', copies: 5, shelf: 'CS-A3' },
    { isbn: '9780136006633', title: 'Artificial Intelligence: A Modern Approach', author: 'Stuart Russell', category: 'AI', dept: 'Computer Science', pub: 'Pearson', ed: '4th', copies: 4, shelf: 'AI-A1' },
    { isbn: '9780596009205', title: 'Head First Design Patterns', author: 'Eric Freeman', category: 'Software Engineering', dept: 'Computer Science', pub: "O'Reilly", ed: '2nd', copies: 3, shelf: 'CS-C3' },
    { isbn: '9780133591620', title: 'Operating System Concepts', author: 'Abraham Silberschatz', category: 'Operating Systems', dept: 'Computer Science', pub: 'Wiley', ed: '10th', copies: 4, shelf: 'OS-A1' },
    { isbn: '9780132143011', title: 'Computer Networking', author: 'James F. Kurose', category: 'Networking', dept: 'Computer Science', pub: 'Pearson', ed: '8th', copies: 4, shelf: 'NET-A1' },
    { isbn: '9781449331818', title: 'Learning Python', author: 'Mark Lutz', category: 'Programming', dept: 'Computer Science', pub: "O'Reilly", ed: '5th', copies: 4, shelf: 'CS-P1' },
    { isbn: '9780135957059', title: 'The Pragmatic Programmer', author: 'David Thomas', category: 'Software Engineering', dept: 'Computer Science', pub: 'Addison-Wesley', ed: '2nd', copies: 3, shelf: 'CS-C4' },
    { isbn: '9780321573513', title: 'Algorithms', author: 'Robert Sedgewick', category: 'Data Structures', dept: 'Computer Science', pub: 'Addison-Wesley', ed: '4th', copies: 3, shelf: 'CS-A4' },
    { isbn: '9780262035613', title: 'Deep Learning', author: 'Ian Goodfellow', category: 'AI', dept: 'Computer Science', pub: 'MIT Press', ed: '1st', copies: 4, shelf: 'AI-C1' },
    { isbn: '9781491957660', title: 'Python Data Science Handbook', author: 'Jake VanderPlas', category: 'AI', dept: 'Computer Science', pub: "O'Reilly", ed: '2nd', copies: 3, shelf: 'AI-P1' },
    { isbn: '9780596520687', title: 'JavaScript: The Good Parts', author: 'Douglas Crockford', category: 'Web Dev', dept: 'Computer Science', pub: "O'Reilly", ed: '1st', copies: 3, shelf: 'WEB-A1' },
    { isbn: '9781491950296', title: 'Building Microservices', author: 'Sam Newman', category: 'Software Engineering', dept: 'Computer Science', pub: "O'Reilly", ed: '2nd', copies: 3, shelf: 'CS-M1' },
    { isbn: '9780132354165', title: 'Clean Architecture', author: 'Robert C. Martin', category: 'Software Engineering', dept: 'Computer Science', pub: 'Prentice Hall', ed: '1st', copies: 4, shelf: 'CS-C5' },
    { isbn: '9781491954461', title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', category: 'Databases', dept: 'Computer Science', pub: "O'Reilly", ed: '1st', copies: 4, shelf: 'CS-D4' },
    { isbn: '9780073523323', title: 'Database Management Systems', author: 'Raghu Ramakrishnan', category: 'Databases', dept: 'Computer Science', pub: 'McGraw-Hill', ed: '3rd', copies: 4, shelf: 'CS-D2' },
    { isbn: '9781492051299', title: 'Learning React', author: 'Alex Banks', category: 'Web Dev', dept: 'Computer Science', pub: "O'Reilly", ed: '2nd', copies: 3, shelf: 'WEB-R1' },
    { isbn: '9780134686097', title: "Computer Systems: A Programmer's Perspective", author: 'Randal E. Bryant', category: 'OS', dept: 'Computer Science', pub: 'Pearson', ed: '3rd', copies: 3, shelf: 'OS-B1' },
    { isbn: '9780132126953', title: 'Modern Operating Systems', author: 'Andrew S. Tanenbaum', category: 'OS', dept: 'Computer Science', pub: 'Pearson', ed: '4th', copies: 4, shelf: 'OS-C1' },
    { isbn: '9780133937664', title: 'Software Engineering', author: 'Ian Sommerville', category: 'Software Engineering', dept: 'Computer Science', pub: 'Pearson', ed: '10th', copies: 4, shelf: 'CS-S1' },
    { isbn: '9780134757599', title: 'Refactoring', author: 'Martin Fowler', category: 'Software Engineering', dept: 'Computer Science', pub: 'Addison-Wesley', ed: '2nd', copies: 3, shelf: 'CS-R1' }
  ];
  await seedBooks(lmsDb, CEC_ID, cecBooks);
  console.log(`  [LMS DB] Seeded ${cecBooks.length} CS & Engineering books`);

  // CEC Announcement
  await lmsDb.collection('announcements').replaceOne(
    { collegeId: CEC_ID, title: 'Lab Access Extended Hours' },
    { collegeId: CEC_ID, title: 'Lab Access Extended Hours', content: 'Computer labs will remain open until 10 PM during project submission week. Library reference books are available for overnight checkout.', targetAudience: 'all', createdBy: 'Dr. Rajesh Kumar (Head Librarian)', createdAt: new Date(Date.now() - 2*86400000) },
    { upsert: true }
  );

  // ==============================
  // COLLEGE 2: Dronacharya PG College Rait
  // ==============================
  console.log('\n=== 2. Dronacharya PG College Rait (Business, Commerce & Arts) ===');

  // 2A. Degrees
  await egDb.collection('degrees').deleteMany({ collegeId: new ObjectId(DCR_ID) });
  const dcrDegrees = [
    { name: 'BBA', durationYears: 3 },
    { name: 'B.Com', durationYears: 3 },
    { name: 'BA', durationYears: 3 },
    { name: 'MBA', durationYears: 2 },
    { name: 'M.Com', durationYears: 2 }
  ];
  await egDb.collection('degrees').insertMany(dcrDegrees.map(d => ({
    collegeId: new ObjectId(DCR_ID), ...d, createdAt: new Date(), updatedAt: new Date()
  })));
  console.log('  [EduGuard DB] Seeded 5 degrees: BBA, B.Com, BA, MBA, M.Com');

  // 2B. 12 new students for DCR in EduGuard
  const dcrStudentData = [
    { name: 'Aarav Sharma', course: 'BBA', cls: 'BBA-1A', sem: 1, email: 'aarav.s@dronacharya.eduguard.com', rollNo: 'DCR-2024-200', phone: '9876543310' },
    { name: 'Ananya Verma', course: 'BBA', cls: 'BBA-3A', sem: 3, email: 'ananya.v@dronacharya.eduguard.com', rollNo: 'DCR-2024-201', phone: '9876543311' },
    { name: 'Sneha Patel', course: 'B.Com', cls: 'BCOM-2B', sem: 2, email: 'sneha.p@dronacharya.eduguard.com', rollNo: 'DCR-2024-202', phone: '9876543312' },
    { name: 'Vikram Singh', course: 'BA', cls: 'BA-3A', sem: 3, email: 'vikram.s@dronacharya.eduguard.com', rollNo: 'DCR-2024-203', phone: '9876543313' },
    { name: 'Divya Joshi', course: 'BBA', cls: 'BBA-5B', sem: 5, email: 'divya.j@dronacharya.eduguard.com', rollNo: 'DCR-2024-204', phone: '9876543314' },
    { name: 'Aditya Saxena', course: 'B.Com', cls: 'BCOM-4A', sem: 4, email: 'aditya.s@dronacharya.eduguard.com', rollNo: 'DCR-2024-205', phone: '9876543315' },
    { name: 'Meera Das', course: 'BA', cls: 'BA-1B', sem: 1, email: 'meera.d@dronacharya.eduguard.com', rollNo: 'DCR-2024-206', phone: '9876543316' },
    { name: 'Manish Kumar', course: 'BBA', cls: 'BBA-1A', sem: 1, email: 'manish.k@dronacharya.eduguard.com', rollNo: 'DCR-2024-207', phone: '9876543317' },
    { name: 'Amit Shah', course: 'B.Com', cls: 'BCOM-6A', sem: 6, email: 'amit.s@dronacharya.eduguard.com', rollNo: 'DCR-2024-208', phone: '9876543318' },
    { name: 'Simran Kaur', course: 'BA', cls: 'BA-5A', sem: 5, email: 'simran.k@dronacharya.eduguard.com', rollNo: 'DCR-2024-209', phone: '9876543319' },
    { name: 'Priya Sen', course: 'MBA', cls: 'MBA-1A', sem: 1, email: 'priya.s@dronacharya.eduguard.com', rollNo: 'DCR-2024-210', phone: '9876543320' },
    { name: 'Karan Kapoor', course: 'M.Com', cls: 'MCOM-2A', sem: 2, email: 'karan.k@dronacharya.eduguard.com', rollNo: 'DCR-2024-211', phone: '9876543321' }
  ];

  const dcrEgStudentIds = [];
  for (const s of dcrStudentData) {
    const existing = await egDb.collection('students').findOne({ email: s.email });
    if (existing) {
      dcrEgStudentIds.push({ id: existing._id.toString(), ...s });
    } else {
      const res = await egDb.collection('students').insertOne({
        collegeId: new ObjectId(DCR_ID),
        name: s.name, email: s.email, rollNo: s.rollNo, phoneNo: s.phone,
        course: s.course, class: s.cls, semester: s.sem,
        verificationStatus: 'approved', isVerified: true,
        password: '$2a$11$4d6hYhC9s27ar0BsSIRFXOQDeP5OJSUb7W.p/xnes.9I93fxfdkmS',
        createdAt: new Date()
      });
      dcrEgStudentIds.push({ id: res.insertedId.toString(), ...s });
    }
  }
  console.log(`  [EduGuard DB] Seeded/verified ${dcrEgStudentIds.length} students`);

  // 2C. LMS Settings for DCR
  await lmsDb.collection('settings').replaceOne(
    { collegeId: DCR_ID },
    {
      collegeId: DCR_ID, defaultIssueLimit: 2,
      degreeIssueLimits: { 'BBA': 3, 'B.Com': 3, 'MBA': 4, 'M.Com': 4 },
      loanDays: 14, maxRenewalCount: 1, dailyFineRate: 5, fineAlertThreshold: 50,
      importantOverdueDays: 7, holidays: ['2026-08-15', '2026-10-02', '2026-12-25'],
      catalogVersion: 1, updatedAt: new Date()
    },
    { upsert: true }
  );

  // 2D. LMS Students for DCR
  for (const s of dcrEgStudentIds) {
    await lmsDb.collection('students').replaceOne(
      { collegeId: DCR_ID, eduGuardStudentId: s.id },
      {
        collegeId: DCR_ID, eduGuardStudentId: s.id,
        name: s.name, rollNo: s.rollNo, email: s.email, phoneNo: s.phone,
        course: s.course, className: s.cls, semester: s.sem,
        registeredBy: '6a476d19895a35a0e96a2fce',
        registeredAt: new Date(), updatedAt: new Date()
      },
      { upsert: true }
    );
  }
  console.log(`  [LMS DB] Seeded ${dcrEgStudentIds.length} student library profiles`);

  // 2E. DCR Business & Commerce Books (20 titles)
  const dcrBooks = [
    { isbn: '9780070151024', title: 'Principles of Marketing', author: 'Philip Kotler', category: 'Business', dept: 'Management', pub: 'Pearson', ed: '18th', copies: 5, shelf: 'MGT-A1' },
    { isbn: '9780070659179', title: 'Organizational Behavior', author: 'Stephen P. Robbins', category: 'Business', dept: 'Management', pub: 'Pearson', ed: '19th', copies: 4, shelf: 'MGT-B1' },
    { isbn: '9781119456339', title: 'Financial Accounting', author: 'Ambrish Gupta', category: 'Accounting', dept: 'Commerce', pub: 'Pearson', ed: '6th', copies: 4, shelf: 'COM-A1' },
    { isbn: '9780070669253', title: 'Discrete Mathematics', author: 'Kenneth H. Rosen', category: 'Mathematics', dept: 'Sciences', pub: 'McGraw-Hill', ed: '8th', copies: 5, shelf: 'MATH-B1' },
    { isbn: '9780134093413', title: "Thomas' Calculus", author: 'Joel R. Hass', category: 'Mathematics', dept: 'Sciences', pub: 'Pearson', ed: '14th', copies: 4, shelf: 'MATH-C1' },
    { isbn: '9780134444321', title: 'English Grammar & Composition', author: 'Wren & Martin', category: 'English', dept: 'Humanities', pub: 'S. Chand', ed: 'Revised', copies: 5, shelf: 'ENG-A1' },
    { isbn: '9780140449136', title: 'The Mahabharata', author: 'C. Rajagopalachari', category: 'Literature', dept: 'Humanities', pub: 'Bharatiya Vidya Bhavan', ed: '1st', copies: 4, shelf: 'LIT-A1' },
    { isbn: '9788172234980', title: 'The Discovery of India', author: 'Jawaharlal Nehru', category: 'Literature', dept: 'Humanities', pub: 'Penguin India', ed: '1st', copies: 3, shelf: 'LIT-B1' },
    { isbn: '9780143031031', title: 'Wings of Fire', author: 'A.P.J. Abdul Kalam', category: 'Literature', dept: 'Humanities', pub: 'Universities Press', ed: '1st', copies: 5, shelf: 'LIT-C1' },
    { isbn: '9780070151025', title: 'Strategic Management', author: 'Thomas L. Wheelen', category: 'Business', dept: 'Management', pub: 'Pearson', ed: '15th', copies: 4, shelf: 'MGT-C1' },
    { isbn: '9780070151026', title: 'Corporate Finance', author: 'Stephen A. Ross', category: 'Finance', dept: 'Commerce', pub: 'McGraw-Hill', ed: '12th', copies: 4, shelf: 'COM-B1' },
    { isbn: '9780070151027', title: 'Managerial Economics', author: 'Dominick Salvatore', category: 'Economics', dept: 'Management', pub: 'Oxford Press', ed: '8th', copies: 4, shelf: 'MGT-D1' },
    { isbn: '9780070151028', title: 'Human Resource Management', author: 'Gary Dessler', category: 'Business', dept: 'Management', pub: 'Pearson', ed: '16th', copies: 5, shelf: 'MGT-E1' },
    { isbn: '9780070151029', title: 'Cost Accounting', author: 'Charles T. Horngren', category: 'Accounting', dept: 'Commerce', pub: 'Pearson', ed: '15th', copies: 4, shelf: 'COM-C1' },
    { isbn: '9780070151030', title: 'Business Law', author: 'M.C. Kuchhal', category: 'Law', dept: 'Commerce', pub: 'Vikas Publishing', ed: '7th', copies: 3, shelf: 'COM-D1' },
    { isbn: '9780070151031', title: 'Indian Economy', author: 'Ramesh Singh', category: 'Economics', dept: 'Humanities', pub: 'McGraw-Hill', ed: '13th', copies: 5, shelf: 'ECO-A1' },
    { isbn: '9780070151032', title: 'Macroeconomics', author: 'N. Gregory Mankiw', category: 'Economics', dept: 'Humanities', pub: 'Cengage', ed: '10th', copies: 4, shelf: 'ECO-B1' },
    { isbn: '9780070151033', title: 'Microeconomics', author: 'Robert Pindyck', category: 'Economics', dept: 'Humanities', pub: 'Pearson', ed: '9th', copies: 4, shelf: 'ECO-C1' },
    { isbn: '9780070151034', title: 'Operations Management', author: 'Jay Heizer', category: 'Business', dept: 'Management', pub: 'Pearson', ed: '12th', copies: 3, shelf: 'MGT-F1' },
    { isbn: '9780321982384', title: 'Linear Algebra', author: 'David C. Lay', category: 'Mathematics', dept: 'Sciences', pub: 'Pearson', ed: '5th', copies: 3, shelf: 'MATH-A1' }
  ];
  await seedBooks(lmsDb, DCR_ID, dcrBooks);
  console.log(`  [LMS DB] Seeded ${dcrBooks.length} Business & Commerce books`);

  // DCR Announcement
  await lmsDb.collection('announcements').replaceOne(
    { collegeId: DCR_ID, title: 'Semester-End Library Hours' },
    { collegeId: DCR_ID, title: 'Semester-End Library Hours', content: 'Library reading rooms will remain open on weekends during exam preparation. Additional copies of reference textbooks are now available.', targetAudience: 'all', createdBy: 'Mrs. Sunita Verma (Librarian)', createdAt: new Date(Date.now() - 3*86400000) },
    { upsert: true }
  );

  // ==============================
  // FINAL VERIFICATION
  // ==============================
  console.log('\n=== FINAL VERIFICATION ===');
  console.log(`[1. Chandigarh Engineering College (${CEC_ID})]:`);
  console.log(`  EduGuard Degrees:   ${await egDb.collection('degrees').countDocuments({ collegeId: new ObjectId(CEC_ID) })} (B.Tech CSE, B.Tech ECE, BCA, MCA, M.Tech)`);
  console.log(`  EduGuard Students:  ${await egDb.collection('students').countDocuments({ $or: [{ collegeId: CEC_ID }, { collegeId: new ObjectId(CEC_ID) }] })}`);
  console.log(`  LMS Students:       ${await lmsDb.collection('students').countDocuments({ collegeId: CEC_ID })}`);
  console.log(`  LMS Books:          ${await lmsDb.collection('books').countDocuments({ collegeId: CEC_ID })} (CS & Engineering)`);

  console.log();
  console.log(`[2. Dronacharya PG College Rait (${DCR_ID})]:`);
  console.log(`  EduGuard Degrees:   ${await egDb.collection('degrees').countDocuments({ collegeId: new ObjectId(DCR_ID) })} (BBA, B.Com, BA, MBA, M.Com)`);
  console.log(`  EduGuard Students:  ${await egDb.collection('students').countDocuments({ $or: [{ collegeId: DCR_ID }, { collegeId: new ObjectId(DCR_ID) }] })}`);
  console.log(`  LMS Students:       ${await lmsDb.collection('students').countDocuments({ collegeId: DCR_ID })}`);
  console.log(`  LMS Books:          ${await lmsDb.collection('books').countDocuments({ collegeId: DCR_ID })} (Business & Commerce)`);

  console.log('\n=== SEEDING COMPLETED SUCCESSFULLY ===');

  await egClient.close();
  await lmsClient.close();
}

async function seedBooks(lmsDb, collegeId, books) {
  let idx = 0;
  for (const b of books) {
    const physicalCopies = [];
    for (let i = 1; i <= b.copies; i++) {
      const status = (i === 1 && idx % 4 === 0) ? 'issued' : (i === b.copies && idx % 7 === 0) ? 'reserved' : 'available';
      physicalCopies.push({
        accessionNumber: `${b.isbn.replace(/-/g, '')}-${String(i).padStart(3, '0')}`,
        barcode: `BC-${b.isbn.replace(/-/g, '')}-${String(i).padStart(3, '0')}`,
        status, shelfLocation: b.shelf, conditionNotes: 'Good condition',
        addedAt: new Date(Date.now() - 60*86400000)
      });
    }
    const available = physicalCopies.filter(c => c.status === 'available').length;
    await lmsDb.collection('books').replaceOne(
      { collegeId, isbn: b.isbn },
      {
        collegeId, isbn: b.isbn, title: b.title, author: b.author,
        category: b.category, department: b.dept, language: 'English',
        publisher: b.pub, edition: b.ed, totalCopies: b.copies,
        availableCopies: available, shelfLocation: b.shelf,
        borrowCount: b.copies * 3, physicalCopies, isActive: true,
        createdAt: new Date(Date.now() - 60*86400000), updatedAt: new Date()
      },
      { upsert: true }
    );
    idx++;
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
