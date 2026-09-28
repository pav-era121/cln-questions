const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');
const path = require('path');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://cln-questions-pav-era121.aws-eu-west-1.turso.io';
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTA2MDIwNjAsImlkIjoiMDFhMGU4MzEtOTgwMS03NmY1LTlkZjktNDA2MWExOTNhMzU1Iiwia2lkIjoibGExZEtRazFyUGMzWkdiY1dxZlRBQU1fVVBBTFd4WGx1WWRvYTE1RTR6SSIsInJpZCI6ImEwYzFiOTRjLTZlM2EtNDY5ZS1iYzA3LWRkODljOTlhYzM2MSJ9.87Aev4kX789LCbXv5n1mhKdj00VpnaJQYJptaUPT1fPsBL0aJgV00sk_15rHxaDuUgt7EMFAI79iLoE8xJrdAg';

const turso = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN
});

const localDb = new DatabaseSync(path.join(__dirname, 'cln.db'));

async function sync() {
  console.log('Connecting to Turso...');

  // 1. Create Tables in Turso
  console.log('Creating tables in Turso...');
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      marketing_consent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'ACTIVE',
      total_xp INTEGER DEFAULT 0
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      chapter_order INTEGER DEFAULT 1,
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      question_count INTEGER DEFAULT 10,
      time_limit INTEGER DEFAULT 15,
      difficulty TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'ACTIVE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      image_url TEXT,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      score INTEGER DEFAULT 0,
      percentage REAL DEFAULT 0.0,
      xp_earned INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );
  `);

  await turso.execute(`
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
  `);

  console.log('Tables verified in Turso!');

  // Check if Turso already has courses
  const existingCourses = await turso.execute('SELECT COUNT(*) as count FROM courses');
  if (existingCourses.rows[0].count > 0) {
    console.log(`Turso already has ${existingCourses.rows[0].count} courses. Skipping initial seed copy.`);
    return;
  }

  console.log('Copying seed data from local cln.db to Turso...');

  // Copy users
  const users = localDb.prepare('SELECT * FROM users').all();
  for (const u of users) {
    await turso.execute({
      sql: 'INSERT OR IGNORE INTO users (id, full_name, email, phone, password_hash, marketing_consent, created_at, last_active, status, total_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [u.id, u.full_name, u.email, u.phone, u.password_hash, u.marketing_consent, u.created_at, u.last_active, u.status, u.total_xp]
    });
  }
  console.log(`Copied ${users.length} users.`);

  // Copy courses
  const courses = localDb.prepare('SELECT * FROM courses').all();
  for (const c of courses) {
    await turso.execute({
      sql: 'INSERT OR IGNORE INTO courses (id, name, description, image_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [c.id, c.name, c.description, c.image_url, c.status, c.created_at]
    });
  }
  console.log(`Copied ${courses.length} courses.`);

  // Copy chapters
  const chapters = localDb.prepare('SELECT * FROM chapters').all();
  for (const ch of chapters) {
    await turso.execute({
      sql: 'INSERT OR IGNORE INTO chapters (id, course_id, name, description, image_url, chapter_order, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [ch.id, ch.course_id, ch.name, ch.description, ch.image_url, ch.chapter_order, ch.status, ch.created_at]
    });
  }
  console.log(`Copied ${chapters.length} chapters.`);

  // Copy quizzes
  const quizzes = localDb.prepare('SELECT * FROM quizzes').all();
  for (const q of quizzes) {
    await turso.execute({
      sql: 'INSERT OR IGNORE INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [q.id, q.chapter_id, q.title, q.description, q.question_count, q.time_limit, q.difficulty, q.status, q.created_at]
    });
  }
  console.log(`Copied ${quizzes.length} quizzes.`);

  // Copy questions
  const questions = localDb.prepare('SELECT * FROM questions').all();
  for (const q of questions) {
    await turso.execute({
      sql: 'INSERT OR IGNORE INTO questions (id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [q.id, q.quiz_id, q.question_text, q.image_url, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.explanation]
    });
  }
  console.log(`Copied ${questions.length} questions.`);

  console.log('Turso synchronization complete!');
}

sync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
