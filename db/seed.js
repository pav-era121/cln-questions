const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'cln.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

function seed() {
  console.log('Seeding CLN Questions database...');

  // Reset database tables
  db.exec(`
    DELETE FROM quiz_answers;
    DELETE FROM quiz_attempts;
    DELETE FROM questions;
    DELETE FROM quizzes;
    DELETE FROM chapters;
    DELETE FROM courses;
    DELETE FROM users;
  `);

  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('AdminPassword123', salt);
  const studentPasswordHash = bcrypt.hashSync('StudentPassword123', salt);

  // 1. Create Users
  const insertUser = db.prepare(`
    INSERT INTO users (id, full_name, email, phone, password_hash, marketing_consent, status, total_xp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const adminId = 'u-admin-01';
  const studentId = 'u-student-01';

  insertUser.run(adminId, 'CLN Administrator', 'admin@cln.edu.et', '+251900000000', adminPasswordHash, 1, 'ACTIVE', 0, new Date().toISOString());
  insertUser.run(studentId, 'Abebe Bikila', 'student@cln.edu.et', '+251911223344', studentPasswordHash, 1, 'ACTIVE', 1240, new Date().toISOString());

  // 2. Create Courses
  const insertCourse = db.prepare(`
    INSERT INTO courses (id, name, description, image_url, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const cLogic = 'c-logic-01';
  const cMath = 'c-math-02';
  const cPsych = 'c-psych-03';
  const cGlobal = 'c-global-04';
  const cEnglish = 'c-english-05';
  const cEntre = 'c-entre-06';

  insertCourse.run(cLogic, 'Logic & Critical Thinking', 'Build stronger analytical reasoning skills through focused chapter-based practice.', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500&auto=format&fit=crop&q=60', 'ACTIVE');
  insertCourse.run(cMath, 'Mathematics', 'Practice fundamental concepts, calculations, and problem-solving chapter by chapter.', 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=500&auto=format&fit=crop&q=60', 'ACTIVE');
  insertCourse.run(cPsych, 'Psychology', 'Test your understanding of human behavior, cognition, and psychological concepts.', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop&q=60', 'ACTIVE');
  insertCourse.run(cGlobal, 'Global Studies', 'Explore geopolitical systems, international relations, and global socio-economic dynamics.', 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=500&auto=format&fit=crop&q=60', 'ACTIVE');
  insertCourse.run(cEnglish, 'English / Communication', 'Master academic reading comprehension, effective essay structure, and formal vocabulary.', 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=500&auto=format&fit=crop&q=60', 'ACTIVE');
  insertCourse.run(cEntre, 'Entrepreneurship', 'Learn essential business planning, market validation, and innovation strategies.', 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=500&auto=format&fit=crop&q=60', 'ACTIVE');

  // 3. Create Chapters
  const insertChapter = db.prepare(`
    INSERT INTO chapters (id, course_id, name, description, image_url, chapter_order, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const chLogic1 = 'ch-logic-1';
  const chLogic2 = 'ch-logic-2';
  insertChapter.run(chLogic1, cLogic, 'Chapter 1: Introduction to Logic & Arguments', 'Distinguishing arguments from non-arguments, premises, and conclusions.', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=60', 1, 'ACTIVE');
  insertChapter.run(chLogic2, cLogic, 'Chapter 2: Informal Fallacies', 'Recognizing fallacies of relevance, weak induction, and presumption in daily reasoning.', 'https://images.unsplash.com/photo-1453733190371-0a9be8689023?w=500&auto=format&fit=crop&q=60', 2, 'ACTIVE');

  const chMath1 = 'ch-math-1';
  const chMath2 = 'ch-math-2';
  insertChapter.run(chMath1, cMath, 'Chapter 1: Propositional Logic & Set Theory', 'Truth tables, logical equivalences, set operations, and Venn diagrams.', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500&auto=format&fit=crop&q=60', 1, 'ACTIVE');
  insertChapter.run(chMath2, cMath, 'Chapter 2: Functions & Graphs', 'Domain, range, composition of functions, polynomial and exponential graphs.', 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=500&auto=format&fit=crop&q=60', 2, 'ACTIVE');

  const chPsych1 = 'ch-psych-1';
  const chPsych2 = 'ch-psych-2';
  insertChapter.run(chPsych1, cPsych, 'Chapter 1: Introduction to Psychology & Research Methods', 'Historical perspectives, major paradigms, and experimental methods in psychology.', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop&q=60', 1, 'ACTIVE');
  insertChapter.run(chPsych2, cPsych, 'Chapter 2: Sensation & Perception', 'How sensory receptors detect stimuli and how the brain interprets perceptual input.', 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500&auto=format&fit=crop&q=60', 2, 'ACTIVE');

  // 4. Create Quizzes
  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const qLogic1 = 'quiz-logic-1';
  const qLogic2 = 'quiz-logic-2';
  const qMath1 = 'quiz-math-1';
  const qPsych1 = 'quiz-psych-1';

  insertQuiz.run(qLogic1, chLogic1, 'Logic & Arguments Practice Quiz', 'Test your ability to identify premises, conclusions, and valid deductive structures.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qLogic2, chLogic2, 'Informal Fallacies Quiz', 'Identify fallacies such as Ad Hominem, Straw Man, and Begging the Question.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qMath1, chMath1, 'Sets & Propositional Logic Quiz', 'Test your understanding of set union, intersection, and truth value derivations.', 5, 10, 'Hard', 'ACTIVE');
  insertQuiz.run(qPsych1, chPsych1, 'Psychological Foundations Quiz', 'Practice key concepts of structuralism, behaviorism, and experimental controls.', 5, 10, 'Easy', 'ACTIVE');

  // 5. Create Questions
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Logic Quiz 1 Questions
  insertQuestion.run(
    'q-l1-1',
    qLogic1,
    'Which statement best defines a valid deductive argument?',
    'An argument where the conclusion is likely true based on premises.',
    'An argument where if all premises are assumed true, it is impossible for the conclusion to be false.',
    'An argument supported by statistical surveys and empirical data.',
    'An argument containing no emotional or biased language.',
    'B',
    'A deductive argument is valid if and only if its logical structure guarantees that true premises necessarily yield a true conclusion.'
  );

  insertQuestion.run(
    'q-l1-2',
    qLogic1,
    'In the argument: "All freshmen take Logic. Kebede is a freshman. Therefore, Kebede takes Logic.", what role does "Kebede is a freshman" play?',
    'The main conclusion',
    'A minor premise',
    'An informal fallacy',
    'A non-propositional statement',
    'B',
    'The statement provides specific factual evidence supporting the conclusion about Kebede, acting as the minor premise of the categorical syllogism.'
  );

  insertQuestion.run(
    'q-l1-3',
    qLogic1,
    'What is the primary indicator of an inductive argument?',
    'It claims that the conclusion follows with absolute logical certainty.',
    'It claims that the conclusion follows with some degree of probability.',
    'It contains no premises.',
    'It only applies to mathematical proofs.',
    'B',
    'Inductive reasoning establishes conclusions based on likelihood, sample observations, or analogy rather than strict logical necessity.'
  );

  insertQuestion.run(
    'q-l1-4',
    qLogic1,
    'Consider the statement: "If it rains, the ground is wet. The ground is wet. Therefore, it rained." What formal fallacy is committed here?',
    'Denying the Antecedent',
    'Affirming the Consequent',
    'Begging the Question',
    'Equivocation',
    'B',
    'Affirming the Consequent assumes that because the outcome (consequent) is true, the initial condition (antecedent) must have caused it, ignoring other potential causes.'
  );

  insertQuestion.run(
    'q-l1-5',
    qLogic1,
    'A sound argument must satisfy which two conditions?',
    'It must be valid and all its premises must be factually true.',
    'It must be persuasive and contain at least three premises.',
    'It must be inductive and empirically verified.',
    'It must have a conclusion that everyone agrees with.',
    'A',
    'Soundness requires both valid logical structure AND true premises in the real world.'
  );

  // Logic Quiz 2 Questions
  insertQuestion.run(
    'q-l2-1',
    qLogic2,
    'When someone attacks an opponent\'s personal character instead of addressing their argument, which fallacy is committed?',
    'Straw Man',
    'Ad Hominem',
    'Red Herring',
    'Appeal to Ignorance',
    'B',
    'Ad Hominem redirects focus from the argument to the arguer\'s character or personal circumstances.'
  );

  insertQuestion.run(
    'q-l2-2',
    qLogic2,
    'Misrepresenting an opponent\'s position to make it easier to attack is known as:',
    'Straw Man Fallacy',
    'Slippery Slope',
    'False Dilemma',
    'Begging the Question',
    'A',
    'The Straw Man fallacy creates a distorted version of the opponent\'s claim to refute it effortlessly.'
  );

  insertQuestion.run(
    'q-l2-3',
    qLogic2,
    '"We must either ban all cars or accept complete destruction of our city\'s air quality." This is an example of:',
    'Appeal to Emotion',
    'False Dichotomy / False Dilemma',
    'Hasty Generalization',
    'Equivocation',
    'B',
    'A False Dilemma artificially restricts available options to two extreme choices when intermediate solutions exist.'
  );

  insertQuestion.run(
    'q-l2-4',
    qLogic2,
    'Assuming that a small first step will inevitably lead to a chain of negative events without evidence is called:',
    'Begging the Question',
    'Slippery Slope Fallacy',
    'Post Hoc Fallacy',
    'Appeal to Force',
    'B',
    'The Slippery Slope fallacy asserts an unwarranted causal chain reaction leading to extreme consequences.'
  );

  insertQuestion.run(
    'q-l2-5',
    qLogic2,
    'If an argument relies on the premise that a claim must be true because it has not yet been proven false, it commits:',
    'Appeal to Ignorance (Argumentum ad Ignorantiam)',
    'Appeal to Popularity',
    'Circular Reasoning',
    'Tu Quoque',
    'A',
    'Appeal to Ignorance uses a lack of conclusive evidence as proof for the truth of a claim.'
  );

  // Math Quiz Questions
  insertQuestion.run(
    'q-m1-1',
    qMath1,
    'If set A = {1, 2, 3, 4} and set B = {3, 4, 5, 6}, what is the intersection A ∩ B?',
    '{1, 2, 3, 4, 5, 6}',
    '{3, 4}',
    '{1, 2, 5, 6}',
    'Empty set Ø',
    'B',
    'The intersection A ∩ B consists of elements that belong to BOTH set A and set B simultaneously, which are {3, 4}.'
  );

  insertQuestion.run(
    'q-m1-2',
    qMath1,
    'Under what truth assignment is the implication P → Q false?',
    'When P is true and Q is true.',
    'When P is true and Q is false.',
    'When P is false and Q is true.',
    'When P is false and Q is false.',
    'B',
    'A conditional statement P → Q is false IF AND ONLY IF the antecedent (P) is true and the consequent (Q) is false.'
  );

  insertQuestion.run(
    'q-m1-3',
    qMath1,
    'What is the contrapositive of the proposition "If x > 5, then x^2 > 25"?',
    'If x^2 > 25, then x > 5.',
    'If x ≤ 5, then x^2 ≤ 25.',
    'If x^2 ≤ 25, then x ≤ 5.',
    'If x > 5, then x^2 ≤ 25.',
    'C',
    'The contrapositive of P → Q is ¬Q → ¬P, which negates and swaps both the antecedent and consequent.'
  );

  insertQuestion.run(
    'q-m1-4',
    qMath1,
    'How many subsets does a set containing 4 distinct elements have?',
    '8',
    '12',
    '16',
    '32',
    'C',
    'The total number of subsets for a finite set of n elements is given by 2^n. For n = 4, 2^4 = 16.'
  );

  insertQuestion.run(
    'q-m1-5',
    qMath1,
    'Which of the following logical expressions is equivalent to ¬(P ∧ Q) according to De Morgan\'s Laws?',
    '¬P ∧ ¬Q',
    '¬P ∨ ¬Q',
    'P ∨ Q',
    '¬P → ¬Q',
    'B',
    'De Morgan\'s Law states that the negation of a conjunction is the disjunction of the negations: ¬(P ∧ Q) ≡ ¬P ∨ ¬Q.'
  );

  // Psychology Quiz Questions
  insertQuestion.run(
    'q-p1-1',
    qPsych1,
    'Which early school of psychology, founded by Wilhelm Wundt and Edward Titchener, aimed to analyze conscious experience using introspection?',
    'Behaviorism',
    'Structuralism',
    'Functionalism',
    'Psychoanalysis',
    'B',
    'Structuralism sought to break down conscious mental processes into basic structures via controlled introspection.'
  );

  insertQuestion.run(
    'q-p1-2',
    qPsych1,
    'In an experimental psychological study, the variable that is deliberately manipulated by the researcher is the:',
    'Dependent variable',
    'Independent variable',
    'Confounding variable',
    'Control variable',
    'B',
    'The independent variable is the cause or predictor variable systematically manipulated by the experimenter.'
  );

  insertQuestion.run(
    'q-p1-3',
    qPsych1,
    'Which famous perspective, originated by Sigmund Freud, emphasizes unconscious conflicts and early childhood experiences?',
    'Humanistic perspective',
    'Psychodynamic perspective',
    'Cognitive perspective',
    'Biological perspective',
    'B',
    'The psychodynamic approach focuses on unconscious motives, drives, and early psychological development.'
  );

  insertQuestion.run(
    'q-p1-4',
    qPsych1,
    'John B. Watson and B.F. Skinner were leading figures in which major psychological movement?',
    'Gestalt psychology',
    'Behaviorism',
    'Humanism',
    'Cognitive Neurosciences',
    'B',
    'Behaviorism rejected the study of unobservable mental states in favor of measurable, observable behaviors.'
  );

  insertQuestion.run(
    'q-p1-5',
    qPsych1,
    'What is the primary function of a double-blind procedure in psychological research?',
    'To guarantee that participants learn the experimental hypothesis.',
    'To eliminate both participant expectations and experimenter bias.',
    'To reduce the cost of conducting empirical surveys.',
    'To ensure correlation always implies causation.',
    'B',
    'In a double-blind trial, neither the subjects nor the administrators know who receives the treatment.'
  );

  // 6. Seed Sample Attempt for Student
  const insertAttempt = db.prepare(`
    INSERT INTO quiz_attempts (id, user_id, quiz_id, started_at, completed_at, score, percentage, xp_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAttempt.run('att-01', studentId, qLogic1, new Date(Date.now() - 3600000).toISOString(), new Date().toISOString(), 4, 80.0, 40);

  console.log('Database successfully seeded!');
  db.close();
}

seed();
