const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'cln.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// Enable Foreign Keys
db.exec('PRAGMA foreign_keys = ON;');

// Schema Definition
db.exec(`
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

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

console.log('CLN Questions database initialized successfully at:', dbPath);
db.close();
