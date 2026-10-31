const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const db = require('../db/client');

const PDF_DIR = 'C:/Users/HP/Downloads/Telegram Desktop/manufacturing ii';

const CHAPTER_METADATA = [
  {
    order: 1,
    id: 'ch_mfg_01',
    fileName: 'CLN_Chapter_01_Traditional_Machining_Processes.pdf',
    name: 'Chapter 01: Traditional Machining Processes & Machine Tools',
    description: 'Turning, milling, drilling, shaping, planing, machine tool kinematics, and core cutting operations.'
  },
  {
    order: 2,
    id: 'ch_mfg_02',
    fileName: 'CLN_Chapter_02_Kinematics_of_Machine_Tools.pdf',
    name: 'Chapter 02: Kinematics of Machine Tools & Speed Regulation',
    description: 'Transmission diagrams, gearbox structural design, ray diagrams, speed ratios, and spindle kinematics.'
  },
  {
    order: 3,
    id: 'ch_mfg_03',
    fileName: 'CLN_Chapter_03_Mechanics_of_Metal_Cutting.pdf',
    name: 'Chapter 03: Mechanics of Metal Cutting & Chip Formation',
    description: 'Orthogonal cutting, Merchant circle diagram, shear plane physics, chip compression ratio, and power dissipation.'
  },
  {
    order: 4,
    id: 'ch_mfg_04',
    fileName: 'CLN_Chapter_04_Tool_Materials_Geometry_and_Wear.pdf',
    name: 'Chapter 04: Tool Materials, Geometry & Tool Wear',
    description: 'HSS, Carbides, Ceramics, CBN, ASA tool signatures, Taylor tool life equation, crater and flank wear mechanisms.'
  },
  {
    order: 5,
    id: 'ch_mfg_05',
    fileName: 'CLN_Chapter_05_Machining_Economics_and_BEA.pdf',
    name: 'Chapter 05: Machining Economics & Break-Even Analysis',
    description: 'Minimum cost cutting speed, maximum production rate cutting speed, tooling costs, and break-even batch analysis.'
  },
  {
    order: 6,
    id: 'ch_mfg_06',
    fileName: 'CLN_Chapter_06_Non_Traditional_Machining.pdf',
    name: 'Chapter 06: Non-Traditional Machining Processes',
    description: 'EDM, ECM, USM, AJM, LBM, EBM, and chemical machining principles, mechanics, and material removal rates.'
  },
  {
    order: 7,
    id: 'ch_mfg_07',
    fileName: 'CLN_Chapter_07_Welding_and_Joining_Technology.pdf',
    name: 'Chapter 07: Welding & Joining Technology',
    description: 'Fusion welding (SMAW, GMAW, GTAW, SAW), solid-state joining, weld metallurgy, HAZ, and weld defect analysis.'
  }
];

async function parsePdfQuestions(filePath) {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const res = await parser.getText();

  let fullText = res.pages.map(p => {
    let t = p.text;
    t = t.replace(/CLN Learning Materials[^\n]*\n?/gi, '');
    return t;
  }).join('\n');

  const qRegex = /QUESTION\s+(\d+)\s+OF\s+100[^\n]*\n([\s\S]*?)(?=(?:QUESTION\s+\d+\s+OF\s+100|$))/gi;
  let match;
  const questions = [];

  while ((match = qRegex.exec(fullText)) !== null) {
    const qNum = parseInt(match[1], 10);
    const block = match[2];

    const optAMatch = block.match(/A\)\s+([\s\S]*?)(?=B\)\s+)/);
    const optBMatch = block.match(/B\)\s+([\s\S]*?)(?=C\)\s+)/);
    const optCMatch = block.match(/C\)\s+([\s\S]*?)(?=D\)\s+)/);
    const optDMatch = block.match(/D\)\s+([\s\S]*?)(?=Correct Answer:)/i);
    const ansMatch = block.match(/Correct Answer:\s*([A-D])/i);
    const qTextMatch = block.match(/([\s\S]*?)(?=A\)\s+)/);
    const expMatch = block.match(/Correct Answer:\s*[A-D][^\n]*\n([\s\S]*)/i);

    let explanation = expMatch ? expMatch[1].trim() : '';
    // If Q50, strip any Part B banner trailing text
    if (qNum === 50) {
      explanation = explanation.replace(/(?:GRADE BOOSTER:\s*PART\s*B|MODULE[^\n]*PART\s*B|PART\s*B[\s\S]*?)[\s\S]*$/i, '').trim();
    }

    questions.push({
      num: qNum,
      questionText: qTextMatch ? qTextMatch[1].trim() : '',
      optionA: optAMatch ? optAMatch[1].trim() : '',
      optionB: optBMatch ? optBMatch[1].trim() : '',
      optionC: optCMatch ? optCMatch[1].trim() : '',
      optionD: optDMatch ? optDMatch[1].trim() : '',
      correctAnswer: ansMatch ? ansMatch[1].toUpperCase() : '',
      explanation: explanation,
      difficulty: qNum <= 50 ? 'Medium' : 'Hard'
    });
  }

  return questions;
}

async function main() {
  console.log('🚀 Starting Manufacturing Engineering II Import...');

  // 1. Ensure `is_private` column exists on courses
  try {
    await db.exec('ALTER TABLE courses ADD COLUMN is_private INTEGER DEFAULT 0;');
  } catch (e) {
    // Already exists
  }

  // 2. Insert or update the Course
  const courseId = 'c_manufacturing_ii';
  const existingCourse = await db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);

  if (!existingCourse) {
    console.log('Inserting course:', courseId);
    await db.prepare(`
      INSERT INTO courses (id, name, description, image_url, status, created_at, is_private)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1)
    `).run(
      courseId,
      'Manufacturing Engineering II (MEng 31xx)',
      'Advanced engineering mastery package covering Traditional Machining, Kinematics, Cutting Mechanics, Tool Geometry & Wear, Economics, Non-Traditional Machining, and Welding & Joining.',
      '/img/manufacturing_ii.svg',
      new Date().toISOString()
    );
  } else {
    console.log('Updating existing course:', courseId);
    await db.prepare(`
      UPDATE courses
      SET name = ?, description = ?, image_url = ?, status = 'ACTIVE', is_private = 1
      WHERE id = ?
    `).run(
      'Manufacturing Engineering II (MEng 31xx)',
      'Advanced engineering mastery package covering Traditional Machining, Kinematics, Cutting Mechanics, Tool Geometry & Wear, Economics, Non-Traditional Machining, and Welding & Joining.',
      '/img/manufacturing_ii.svg',
      courseId
    );
  }

  // 3. Process each chapter
  for (const ch of CHAPTER_METADATA) {
    console.log(`\n📂 Processing Chapter ${ch.order}: ${ch.name}...`);
    const pdfPath = path.join(PDF_DIR, ch.fileName);
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Upsert Chapter
    const existingChapter = await db.prepare('SELECT id FROM chapters WHERE id = ?').get(ch.id);
    if (!existingChapter) {
      await db.prepare(`
        INSERT INTO chapters (id, course_id, name, description, image_url, chapter_order, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(
        ch.id,
        courseId,
        ch.name,
        ch.description,
        '/img/manufacturing_ii.svg',
        ch.order,
        new Date().toISOString()
      );
    } else {
      await db.prepare(`
        UPDATE chapters
        SET name = ?, description = ?, image_url = ?, chapter_order = ?, status = 'ACTIVE'
        WHERE id = ?
      `).run(
        ch.name,
        ch.description,
        '/img/manufacturing_ii.svg',
        ch.order,
        ch.id
      );
    }

    // 4. Upsert the 2 Quizzes for this chapter
    const quizAId = `quiz_mfg_${ch.order}_part_a`;
    const quizBId = `quiz_mfg_${ch.order}_part_b`;

    const existingQuizA = await db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizAId);
    if (!existingQuizA) {
      await db.prepare(`
        INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status, created_at)
        VALUES (?, ?, ?, ?, 50, 50, 'Medium', 'ACTIVE', ?)
      `).run(
        quizAId,
        ch.id,
        `Part A: Conceptual & Theoretical Mastery (Questions 1–50)`,
        `50 rigorous conceptual and theoretical questions testing foundational physics, principles, mechanisms, and process mechanics.`,
        new Date().toISOString()
      );
    }

    const existingQuizB = await db.prepare('SELECT id FROM quizzes WHERE id = ?').get(quizBId);
    if (!existingQuizB) {
      await db.prepare(`
        INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status, created_at)
        VALUES (?, ?, ?, ?, 50, 60, 'Hard', 'ACTIVE', ?)
      `).run(
        quizBId,
        ch.id,
        `Part B: Numerical & Engineering Calculations (Questions 51–100)`,
        `50 rigorous numerical problems, cutting force equations, speed/feed optimizations, cycle times, and derivations.`,
        new Date().toISOString()
      );
    }

    // 5. Parse questions from PDF
    const parsedQuestions = await parsePdfQuestions(pdfPath);
    console.log(`  Parsed ${parsedQuestions.length} questions from ${ch.fileName}`);
    if (parsedQuestions.length !== 100) {
      console.warn(`  ⚠️ Warning: Expected 100 questions, got ${parsedQuestions.length}`);
    }

    // 6. Insert questions
    let insertedCount = 0;
    for (const q of parsedQuestions) {
      const qQuizId = q.num <= 50 ? quizAId : quizBId;
      const paddedNum = String(q.num).padStart(3, '0');
      const paddedOrder = String(ch.order).padStart(2, '0');
      const questionId = `q_mfg_${paddedOrder}_${paddedNum}`;

      const existingQ = await db.prepare('SELECT id FROM questions WHERE id = ?').get(questionId);
      if (!existingQ) {
        await db.prepare(`
          INSERT INTO questions (id, quiz_id, question_text, image_url, option_a, option_b, option_c, option_d, correct_answer, explanation, difficulty)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          questionId,
          qQuizId,
          q.questionText,
          q.optionA,
          q.optionB,
          q.optionC,
          q.optionD,
          q.correctAnswer,
          q.explanation,
          q.difficulty
        );
      } else {
        await db.prepare(`
          UPDATE questions
          SET quiz_id = ?, question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?, correct_answer = ?, explanation = ?, difficulty = ?
          WHERE id = ?
        `).run(
          qQuizId,
          q.questionText,
          q.optionA,
          q.optionB,
          q.optionC,
          q.optionD,
          q.correctAnswer,
          q.explanation,
          q.difficulty,
          questionId
        );
      }
      insertedCount++;
    }
    console.log(`  ✅ Successfully saved ${insertedCount} questions for Chapter ${ch.order}`);
  }

  console.log('\n🎉 ALL 7 CHAPTERS AND 700 QUESTIONS IMPORTED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
