const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'cln_questions.db');
const db = new sqlite3.Database(dbPath);

// Helper for promise-based queries
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables and seed initial data if needed
async function initDb() {
  await run(`PRAGMA foreign_keys = ON;`);

  // USERS
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      marketing_consent INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'student',
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      total_xp INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // SUBJECTS (COURSES)
  await run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80',
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // CHAPTERS (NEW TABLE)
  await run(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80',
      order_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
    );
  `);

  // QUIZZES (Linked to Chapters & Subjects)
  await run(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL,
      chapter_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      question_count INTEGER NOT NULL DEFAULT 10,
      time_limit INTEGER NOT NULL DEFAULT 15,
      difficulty TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'published',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );
  `);

  // QUESTIONS
  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'mcq',
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);

  // QUIZ_ATTEMPTS
  await run(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      time_spent_seconds INTEGER DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      score INTEGER DEFAULT 0,
      percentage REAL DEFAULT 0.0,
      xp_earned INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);

  // QUIZ_ANSWERS
  await run(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_answer TEXT,
      is_correct INTEGER DEFAULT 0,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      UNIQUE(attempt_id, question_id)
    );
  `);

  // Auto-Migrations for existing databases created before chapter update
  try { await run(`ALTER TABLE quizzes ADD COLUMN chapter_id INTEGER;`); } catch (e) {}
  try { await run(`ALTER TABLE subjects ADD COLUMN image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&q=80';`); } catch (e) {}
  try { await run(`ALTER TABLE chapters ADD COLUMN image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80';`); } catch (e) {}

  // Ensure every subject has at least one chapter, and orphan quizzes get linked to a chapter
  const allSubjects = await all(`SELECT id FROM subjects`);
  for (const sub of allSubjects) {
    let firstChap = await get(`SELECT id FROM chapters WHERE subject_id = ? ORDER BY order_index ASC LIMIT 1`, [sub.id]);
    if (!firstChap) {
      const res = await run(`
        INSERT INTO chapters (subject_id, title, description, image_url, order_index)
        VALUES (?, 'Chapter 1: Fundamentals', 'General introductory topics and concepts.', 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&q=80', 1)
      `, [sub.id]);
      firstChap = { id: res.lastID };
    }
    // Link quizzes that have NULL chapter_id
    await run(`UPDATE quizzes SET chapter_id = ? WHERE subject_id = ? AND (chapter_id IS NULL OR chapter_id = 0)`, [firstChap.id, sub.id]);
  }

  console.log('Database tables initialized and migrated.');

  // Check if admin exists
  const adminUser = await get(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`);
  if (!adminUser) {
    const adminHash = await bcrypt.hash('adminpassword123', 10);
    await run(`
      INSERT INTO users (username, email, phone, marketing_consent, role, password_hash, status, total_xp)
      VALUES ('admin', 'admin@clnquestions.com', '+251911223344', 1, 'admin', ?, 'Active', 1000)
    `, [adminHash]);
    console.log('Default Admin user created: username "admin", password "adminpassword123"');
  }

  // Seed default subjects and chapters if empty
  const subjectCount = await get(`SELECT COUNT(*) as count FROM subjects`);
  if (subjectCount.count === 0) {
    console.log('Seeding initial courses, chapters, quizzes, and questions with real images...');

    // 1. Physics Course
    const physSubj = await run(`
      INSERT INTO subjects (name, description, image_url, status)
      VALUES ('Physics', 'Study of matter, kinematics, energy, electricity and magnetism.', 'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?w=600&q=80', 'active')
    `);

    // Chapter 1 for Physics
    const physCh1 = await run(`
      INSERT INTO chapters (subject_id, title, description, image_url, order_index)
      VALUES (?, 'Chapter 1: Kinematics & Motion', 'Understand velocity, acceleration, and projectile motion.', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&q=80', 1)
    `, [physSubj.lastID]);

    // Chapter 2 for Physics
    const physCh2 = await run(`
      INSERT INTO chapters (subject_id, title, description, image_url, order_index)
      VALUES (?, 'Chapter 2: Work, Energy & Power', 'Explore kinetic and potential energy transformations.', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80', 2)
    `, [physSubj.lastID]);

    // Quiz for Physics Chapter 1
    const physQuiz1 = await run(`
      INSERT INTO quizzes (subject_id, chapter_id, title, description, question_count, time_limit, difficulty, status)
      VALUES (?, ?, 'Physics — Mechanics & Kinematics', 'Test your knowledge on Newton laws and kinematics.', 5, 10, 'Medium', 'published')
    `, [physSubj.lastID, physCh1.lastID]);

    const qPhysics = [
      {
        question: "What is Newton's Second Law of Motion?",
        a: "F = mv", b: "F = ma", c: "P = mv", d: "E = mc²",
        correct: "B",
        explanation: "Newton's second law states that Force equals mass times acceleration (F = ma)."
      },
      {
        question: "What is the SI unit of work and energy?",
        a: "Newton", b: "Watt", c: "Joule", d: "Pascal",
        correct: "C",
        explanation: "Joule (J) is the SI unit for work and energy."
      },
      {
        question: "A car accelerates uniformly from rest to 20 m/s in 5 seconds. What is its acceleration?",
        a: "2 m/s²", b: "4 m/s²", c: "5 m/s²", d: "10 m/s²",
        correct: "B",
        explanation: "Acceleration a = (v - u) / t = (20 - 0) / 5 = 4 m/s²."
      },
      {
        question: "Which of the following is a scalar quantity?",
        a: "Velocity", b: "Acceleration", c: "Mass", d: "Force",
        correct: "C",
        explanation: "Mass has magnitude only, with no direction, making it a scalar quantity."
      },
      {
        question: "What is the gravitational acceleration near Earth's surface approximately?",
        a: "9.8 m/s²", b: "8.9 m/s²", c: "1.6 m/s²", d: "12 m/s²",
        correct: "A",
        explanation: "Standard acceleration due to Earth's gravity is approximately 9.8 m/s²."
      }
    ];

    for (const q of qPhysics) {
      await run(`
        INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [physQuiz1.lastID, q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation]);
    }

    // 2. Mathematics Course
    const mathSubj = await run(`
      INSERT INTO subjects (name, description, image_url, status)
      VALUES ('Mathematics', 'Algebra, Calculus, Trigonometry and Statistics.', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=600&q=80', 'active')
    `);

    const mathCh1 = await run(`
      INSERT INTO chapters (subject_id, title, description, image_url, order_index)
      VALUES (?, 'Chapter 1: Linear Equations & Polynomials', 'Master algebraic expressions and equations.', 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&q=80', 1)
    `, [mathSubj.lastID]);

    const mathQuiz1 = await run(`
      INSERT INTO quizzes (subject_id, chapter_id, title, description, question_count, time_limit, difficulty, status)
      VALUES (?, ?, 'Mathematics — Algebra Essentials', 'Master linear equations and quadratic formulas.', 5, 10, 'Easy', 'published')
    `, [mathSubj.lastID, mathCh1.lastID]);

    const qMath = [
      {
        question: "Solve for x in the equation: 3x + 9 = 24",
        a: "3", b: "5", c: "7", d: "15",
        correct: "B",
        explanation: "3x = 24 - 9 = 15 => x = 5."
      },
      {
        question: "What are the roots of the quadratic equation x² - 5x + 6 = 0?",
        a: "x = 1 and 6", b: "x = 2 and 3", c: "x = -2 and -3", d: "x = 0 and 5",
        correct: "B",
        explanation: "x² - 5x + 6 = (x - 2)(x - 3) = 0 => x = 2 or x = 3."
      },
      {
        question: "What is the slope of the line given by y = -4x + 7?",
        a: "7", b: "4", c: "-4", d: "-7",
        correct: "C",
        explanation: "In the slope-intercept form y = mx + c, the coefficient of x is the slope m = -4."
      },
      {
        question: "What is (a + b)² expanded?",
        a: "a² + b²", b: "a² + 2ab + b²", c: "a² - 2ab + b²", d: "2a + 2b",
        correct: "B",
        explanation: "(a + b)² = (a + b)(a + b) = a² + ab + ba + b² = a² + 2ab + b²."
      },
      {
        question: "If 2^x = 32, what is the value of x?",
        a: "4", b: "5", c: "6", d: "16",
        correct: "B",
        explanation: "2^5 = 32, so x = 5."
      }
    ];

    for (const q of qMath) {
      await run(`
        INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [mathQuiz1.lastID, q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation]);
    }

    // 3. Chemistry Course
    const chemSubj = await run(`
      INSERT INTO subjects (name, description, image_url, status)
      VALUES ('Chemistry', 'Periodic table, bonding, stoichiometry and organic chemistry.', 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80', 'active')
    `);

    const chemCh1 = await run(`
      INSERT INTO chapters (subject_id, title, description, image_url, order_index)
      VALUES (?, 'Chapter 1: Periodic Table & Chemical Bonding', 'Atomic structures and chemical bonds.', 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80', 1)
    `, [chemSubj.lastID]);

    const chemQuiz1 = await run(`
      INSERT INTO quizzes (subject_id, chapter_id, title, description, question_count, time_limit, difficulty, status)
      VALUES (?, ?, 'Chemistry — Bonding & Elements', 'Atomic numbers, elements, ionic and covalent bonding.', 5, 8, 'Medium', 'published')
    `, [chemSubj.lastID, chemCh1.lastID]);

    const qChem = [
      {
        question: "What element has the chemical symbol 'Na'?",
        a: "Nitrogen", b: "Sodium", c: "Nickel", d: "Neon",
        correct: "B",
        explanation: "Na comes from the Latin word 'Natrium', which is Sodium."
      },
      {
        question: "What type of chemical bond is formed when electrons are shared between atoms?",
        a: "Ionic bond", b: "Covalent bond", c: "Metallic bond", d: "Hydrogen bond",
        correct: "B",
        explanation: "Covalent bonds involve the sharing of electron pairs between atoms."
      },
      {
        question: "What is the pH of pure water at 25°C?",
        a: "0", b: "7", c: "14", d: "1",
        correct: "B",
        explanation: "Pure water is neutral with a pH of 7."
      },
      {
        question: "Which gas is most abundant in Earth's atmosphere?",
        a: "Oxygen", b: "Carbon Dioxide", c: "Nitrogen", d: "Hydrogen",
        correct: "C",
        explanation: "Nitrogen makes up approximately 78% of Earth's atmosphere."
      },
      {
        question: "What is the atomic number of Carbon?",
        a: "6", b: "12", c: "14", d: "8",
        correct: "A",
        explanation: "Carbon has 6 protons, so its atomic number is 6."
      }
    ];

    for (const q of qChem) {
      await run(`
        INSERT INTO questions (quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [chemQuiz1.lastID, q.question, q.a, q.b, q.c, q.d, q.correct, q.explanation]);
    }

    console.log('Seed data successfully initialized!');
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
