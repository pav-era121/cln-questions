const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'cln.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

function seed() {
  console.log('Seeding complete CLN Questions database with all freshman courses...');

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

  // Logic
  const chLogic1 = 'ch-logic-1';
  const chLogic2 = 'ch-logic-2';
  insertChapter.run(chLogic1, cLogic, 'Chapter 1: Introduction to Logic & Arguments', 'Distinguishing arguments from non-arguments, premises, and conclusions.', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500', 1, 'ACTIVE');
  insertChapter.run(chLogic2, cLogic, 'Chapter 2: Informal Fallacies', 'Recognizing fallacies of relevance, weak induction, and presumption in daily reasoning.', 'https://images.unsplash.com/photo-1453733190371-0a9be8689023?w=500', 2, 'ACTIVE');

  // Mathematics
  const chMath1 = 'ch-math-1';
  const chMath2 = 'ch-math-2';
  insertChapter.run(chMath1, cMath, 'Chapter 1: Propositional Logic & Set Theory', 'Truth tables, logical equivalences, set operations, and Venn diagrams.', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500', 1, 'ACTIVE');
  insertChapter.run(chMath2, cMath, 'Chapter 2: Functions & Graphs', 'Domain, range, composition of functions, polynomial and exponential graphs.', 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=500', 2, 'ACTIVE');

  // Psychology
  const chPsych1 = 'ch-psych-1';
  const chPsych2 = 'ch-psych-2';
  insertChapter.run(chPsych1, cPsych, 'Chapter 1: Introduction to Psychology & Research Methods', 'Historical perspectives, major paradigms, and experimental methods in psychology.', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500', 1, 'ACTIVE');
  insertChapter.run(chPsych2, cPsych, 'Chapter 2: Sensation & Perception', 'How sensory receptors detect stimuli and how the brain interprets perceptual input.', 'https://images.unsplash.com/photo-1559757175-5700dde675bc?w=500', 2, 'ACTIVE');

  // English
  const chEng1 = 'ch-eng-1';
  const chEng2 = 'ch-eng-2';
  insertChapter.run(chEng1, cEnglish, 'Chapter 1: Academic Reading & Contextual Vocabulary', 'Skimming, scanning, making inferences, and identifying topic sentences.', 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=500', 1, 'ACTIVE');
  insertChapter.run(chEng2, cEnglish, 'Chapter 2: Paragraph Development & Essay Writing', 'Cohesion, coherence, thesis statements, and transition signals.', 'https://images.unsplash.com/photo-1453733190371-0a9be8689023?w=500', 2, 'ACTIVE');

  // Global Studies
  const chGlob1 = 'ch-glob-1';
  const chGlob2 = 'ch-glob-2';
  insertChapter.run(chGlob1, cGlobal, 'Chapter 1: Understanding Global Politics & Nation States', 'Sovereignty, state and non-state actors, and international systems.', 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=500', 1, 'ACTIVE');
  insertChapter.run(chGlob2, cGlobal, 'Chapter 2: Globalization & International Relations', 'Economic integration, cultural exchange, and global security challenges.', 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500', 2, 'ACTIVE');

  // Entrepreneurship
  const chEnt1 = 'ch-ent-1';
  const chEnt2 = 'ch-ent-2';
  insertChapter.run(chEnt1, cEntre, 'Chapter 1: Entrepreneurial Mindset & Ideation', 'Creativity, opportunity recognition, and innovation in Ethiopian contexts.', 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=500', 1, 'ACTIVE');
  insertChapter.run(chEnt2, cEntre, 'Chapter 2: Business Models & Market Feasibility', 'Value propositions, customer segments, revenue streams, and feasibility analysis.', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500', 2, 'ACTIVE');

  // 4. Create Quizzes
  const insertQuiz = db.prepare(`
    INSERT INTO quizzes (id, chapter_id, title, description, question_count, time_limit, difficulty, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const qLogic1 = 'quiz-logic-1';
  const qLogic2 = 'quiz-logic-2';
  const qMath1 = 'quiz-math-1';
  const qMath2 = 'quiz-math-2';
  const qPsych1 = 'quiz-psych-1';
  const qPsych2 = 'quiz-psych-2';
  const qEng1 = 'quiz-eng-1';
  const qEng2 = 'quiz-eng-2';
  const qGlob1 = 'quiz-glob-1';
  const qGlob2 = 'quiz-glob-2';
  const qEnt1 = 'quiz-ent-1';
  const qEnt2 = 'quiz-ent-2';

  insertQuiz.run(qLogic1, chLogic1, 'Logic & Arguments Practice Quiz', 'Identify premises, conclusions, and valid deductive structures.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qLogic2, chLogic2, 'Informal Fallacies Quiz', 'Identify fallacies such as Ad Hominem, Straw Man, and Begging the Question.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qMath1, chMath1, 'Sets & Propositional Logic Quiz', 'Set operations, Venn diagrams, and truth value derivations.', 5, 10, 'Hard', 'ACTIVE');
  insertQuiz.run(qMath2, chMath2, 'Functions & Relations Quiz', 'Domain, range, injective/surjective functions, and inverse mappings.', 5, 10, 'Hard', 'ACTIVE');
  insertQuiz.run(qPsych1, chPsych1, 'Psychological Foundations Quiz', 'Key concepts of structuralism, behaviorism, and experimental controls.', 5, 10, 'Easy', 'ACTIVE');
  insertQuiz.run(qPsych2, chPsych2, 'Sensation & Perception Quiz', 'Absolute threshold, sensory adaptation, and perceptual illusions.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qEng1, chEng1, 'Reading Comprehension & Context Clues', 'Extract central ideas, determine contextual word meanings, and recognize tone.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qEng2, chEng2, 'Sentence Structure & Mechanics Quiz', 'Fragments, comma splices, dangling modifiers, and paragraph cohesion.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qGlob1, chGlob1, 'Global Politics & State Sovereignty Quiz', 'Westphalian sovereignty, realism, liberalism, and intergovernmental bodies.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qGlob2, chGlob2, 'Globalization & International Trade Quiz', 'Free trade, globalization dimensions, and international financial institutions.', 5, 10, 'Medium', 'ACTIVE');
  insertQuiz.run(qEnt1, chEnt1, 'Entrepreneurial Opportunity & Innovation Quiz', 'Identify problem-solution fits, entrepreneurial traits, and innovation models.', 5, 10, 'Easy', 'ACTIVE');
  insertQuiz.run(qEnt2, chEnt2, 'Business Planning & Feasibility Quiz', 'Business Model Canvas components, financial forecasting, and break-even analysis.', 5, 10, 'Medium', 'ACTIVE');

  // 5. Create Questions
  const insertQuestion = db.prepare(`
    INSERT INTO questions (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Logic Quiz 1
  insertQuestion.run('q-l1-1', qLogic1, 'Which statement best defines a valid deductive argument?', 'An argument where the conclusion is likely true based on premises.', 'An argument where if all premises are assumed true, it is impossible for the conclusion to be false.', 'An argument supported by statistical surveys and empirical data.', 'An argument containing no emotional or biased language.', 'B', 'Deductive validity means the truth of the premises strictly guarantees the truth of the conclusion.');
  insertQuestion.run('q-l1-2', qLogic1, 'In the argument: "All freshmen take Logic. Kebede is a freshman. Therefore, Kebede takes Logic.", what role does "Kebede is a freshman" play?', 'The main conclusion', 'A minor premise', 'An informal fallacy', 'A non-propositional statement', 'B', 'It functions as the minor premise linking the individual subject to the general category.');
  insertQuestion.run('q-l1-3', qLogic1, 'What is the primary indicator of an inductive argument?', 'It claims that the conclusion follows with absolute certainty.', 'It claims that the conclusion follows with some degree of probability.', 'It contains no premises.', 'It only applies to mathematical proofs.', 'B', 'Inductive arguments establish plausible likelihood rather than strict necessity.');
  insertQuestion.run('q-l1-4', qLogic1, 'Consider: "If it rains, the ground is wet. The ground is wet. Therefore, it rained." What formal fallacy is committed?', 'Denying the Antecedent', 'Affirming the Consequent', 'Begging the Question', 'Equivocation', 'B', 'Affirming the consequent assumes that the occurrence of the consequence proves the condition occurred.');
  insertQuestion.run('q-l1-5', qLogic1, 'A sound argument must satisfy which two conditions?', 'It must be valid and all premises must be factually true.', 'It must be persuasive and contain at least three premises.', 'It must be inductive and empirically verified.', 'It must have a conclusion everyone agrees with.', 'A', 'Soundness requires both valid logical form and true factual premises.');

  // Logic Quiz 2
  insertQuestion.run('q-l2-1', qLogic2, 'Attacking an opponent’s personal character instead of addressing their substantive argument is known as:', 'Straw Man', 'Ad Hominem', 'Red Herring', 'Appeal to Pity', 'B', 'Argumentum ad hominem directs the argument against the person making the claim.');
  insertQuestion.run('q-l2-2', qLogic2, 'Distorting or exaggerating an opponent\'s position to make it easier to attack is the:', 'Straw Man fallacy', 'False Dilemma fallacy', 'Slippery Slope fallacy', 'Hasty Generalization fallacy', 'A', 'A Straw Man sets up a caricatured version of the actual viewpoint.');
  insertQuestion.run('q-l2-3', qLogic2, 'Drawing a general conclusion from an inadequate or biased sample size is called:', 'Weak Analogy', 'Hasty Generalization', 'Accident', 'False Cause', 'B', 'Hasty Generalization commits an inductive leap without sufficient sample evidence.');
  insertQuestion.run('q-l2-4', qLogic2, '"Either you support our educational policy completely or you hate national progress." This illustrates:', 'Appeal to Force', 'False Dilemma / Either-Or', 'Begging the Question', 'Complex Question', 'B', 'False Dilemma artificially restricts alternatives to two extremes.');
  insertQuestion.run('q-l2-5', qLogic2, 'Assuming as a premise the very conclusion that one is trying to prove is called:', 'Circular Reasoning (Begging the Question)', 'Equivocation', 'Appeal to Ignorance', 'Composition', 'A', 'Petitio Principii uses the claim itself as justification.');

  // Math Quiz 1
  insertQuestion.run('q-m1-1', qMath1, 'If proposition P is True and proposition Q is False, what is the truth value of the implication P → Q?', 'True', 'False', 'Indeterminate', 'Both True and False', 'B', 'An implication P → Q is False only when the antecedent P is True and the consequent Q is False.');
  insertQuestion.run('q-m1-2', qMath1, 'For sets A = {1, 2, 3} and B = {2, 3, 4}, what is the intersection A ∩ B?', '{1, 2, 3, 4}', '{2, 3}', '{1, 4}', 'The empty set ∅', 'B', 'Intersection consists of common elements shared by both sets: {2, 3}.');
  insertQuestion.run('q-m1-3', qMath1, 'The contrapositive of the conditional statement "If x = 2, then x² = 4" is:', 'If x² = 4, then x = 2', 'If x² ≠ 4, then x ≠ 2', 'If x ≠ 2, then x² ≠ 4', 'If x = -2, then x² = 4', 'B', 'The contrapositive of P → Q is ¬Q → ¬P.');
  insertQuestion.run('q-m1-4', qMath1, 'If set S has 4 elements, how many subsets does its power set P(S) contain?', '8', '16', '12', '4', 'B', 'The power set of a set with n elements has 2^n subsets. 2^4 = 16.');
  insertQuestion.run('q-m1-5', qMath1, 'Which logical connective represents "P exclusive-or Q"?', 'True when both P and Q have identical truth values', 'True when exactly one of P or Q is True', 'True only when both P and Q are True', 'Always False', 'B', 'XOR is true if and only if one operand is true and the other is false.');

  // Math Quiz 2
  insertQuestion.run('q-m2-1', qMath2, 'What is the natural domain of the function f(x) = 1 / (x - 3)?', 'All real numbers', 'All real numbers except x = 3', 'x > 3 only', 'x ≥ 0', 'B', 'Division by zero is undefined, so x cannot equal 3.');
  insertQuestion.run('q-m2-2', qMath2, 'A function f: A → B is one-to-one (injective) if:', 'Every element of B is mapped to by at least one element in A.', 'Different elements in A always map to different elements in B.', 'The range equals the codomain.', 'The graph is a straight line.', 'B', 'Injective functions never map distinct inputs to the same output.');
  insertQuestion.run('q-m2-3', qMath2, 'If f(x) = 2x + 1 and g(x) = x², what is the composite value (f ∘ g)(3)?', '19', '49', '37', '18', 'A', 'g(3) = 3² = 9. Then f(9) = 2(9) + 1 = 19.');
  insertQuestion.run('q-m2-4', qMath2, 'The inverse of the linear function f(x) = 3x - 6 is:', 'f⁻¹(x) = (x + 6) / 3', 'f⁻¹(x) = 3x + 6', 'f⁻¹(x) = (x - 6) / 3', 'f⁻¹(x) = -3x + 6', 'A', 'Solve y = 3x - 6 for x: y + 6 = 3x => x = (y + 6)/3.');
  insertQuestion.run('q-m2-5', qMath2, 'A function f(x) is classified as an even function if it satisfies:', 'f(-x) = -f(x)', 'f(-x) = f(x)', 'f(x + 1) = f(x)', 'f(1/x) = f(x)', 'B', 'Even functions are symmetric with respect to the y-axis, satisfying f(-x) = f(x).');

  // Psychology Quiz 1
  insertQuestion.run('q-p1-1', qPsych1, 'Wilhelm Wundt is historically recognized as the father of modern psychology primarily because he:', 'Introduced psychoanalytic theory to medical universities.', 'Established the first formal psychological research laboratory in Leipzig (1879).', 'Published the earliest textbook on behavioral therapy.', 'Invented the first standardized intelligence test.', 'B', 'Wundt founded experimental psychology in Leipzig, Germany in 1879.');
  insertQuestion.run('q-p1-2', qPsych1, 'In an experimental psychological study, the variable manipulated by the researcher is the:', 'Dependent variable', 'Independent variable', 'Confounding variable', 'Control variable', 'B', 'The independent variable is the predictor manipulated systematically by the experimenter.');
  insertQuestion.run('q-p1-3', qPsych1, 'Which perspective emphasizes unconscious conflicts and childhood psychosexual stages?', 'Humanistic perspective', 'Psychodynamic perspective', 'Cognitive perspective', 'Biological perspective', 'B', 'Freud\'s psychodynamic perspective focuses on unconscious drives and childhood development.');
  insertQuestion.run('q-p1-4', qPsych1, 'John B. Watson and B.F. Skinner were pioneering figures in which major school of thought?', 'Gestalt psychology', 'Behaviorism', 'Humanism', 'Cognitive psychology', 'B', 'Behaviorism focused on observable behavior and environmental reinforcement.');
  insertQuestion.run('q-p1-5', qPsych1, 'What is the primary function of a double-blind procedure in psychological experiments?', 'To guarantee participants learn the hypothesis.', 'To eliminate both participant expectations and experimenter bias.', 'To decrease the sample size needed.', 'To prove correlation is equal to causation.', 'B', 'Double-blind trials keep both researchers and participants unaware of group assignments.');

  // Psychology Quiz 2
  insertQuestion.run('q-p2-1', qPsych2, 'The minimum stimulus energy needed to detect a stimulus 50 percent of the time is the:', 'Difference threshold', 'Absolute threshold', 'Sensory adaptation level', 'Weber fraction', 'B', 'The absolute threshold is the boundary of sensory detection.');
  insertQuestion.run('q-p2-2', qPsych2, 'The process by which sensory receptors convert physical stimulus energy into neural impulses is:', 'Transduction', 'Perception', 'Habituation', 'Accommodation', 'A', 'Transduction converts environmental energy (light, sound) into neural signals.');
  insertQuestion.run('q-p2-3', qPsych2, 'Diminished sensitivity as a consequence of constant, unchanging stimulation is termed:', 'Sensory adaptation', 'Selective attention', 'Signal detection', 'Perceptual set', 'A', 'Sensory adaptation occurs when receptors stop firing rapidly under constant stimulus.');
  insertQuestion.run('q-p2-4', qPsych2, 'Gestalt psychologists emphasized that in human visual perception:', 'The whole is greater than the sum of its parts.', 'Sensory components are processed independently.', 'Color is more significant than shape.', 'Depth perception is completely learned.', 'A', 'Gestalt theory highlights holistic organization of perceptual fields.');
  insertQuestion.run('q-p2-5', qPsych2, 'Which photoreceptors in the human retina are responsible for color vision and visual acuity?', 'Rods', 'Cones', 'Bipolar cells', 'Ganglion cells', 'B', 'Cones are concentrated in the fovea and process fine detail and color in bright light.');

  // English Quiz 1
  insertQuestion.run('q-e1-1', qEng1, 'Reading rapidly over a text to get the general gist or main idea without focusing on specific details is called:', 'Scanning', 'Skimming', 'Critical evaluation', 'Intensive reading', 'B', 'Skimming involves glancing quickly through headings, topic sentences, and summaries to identify the core message.');
  insertQuestion.run('q-e1-2', qEng1, 'In academic writing, what is the role of a topic sentence in a paragraph?', 'It cites external secondary literature.', 'It states and unifies the central controlling idea of the paragraph.', 'It provides the final transitional conclusion.', 'It provides counterarguments to confuse the reader.', 'B', 'A topic sentence announces the main idea and scope of the paragraph.');
  insertQuestion.run('q-e1-3', qEng1, '"Although the research was exhaustive, the committee found several discrepancies." The word "discrepancies" most nearly means:', 'Agreements and harmonies', 'Inconsistencies or differences', 'Exaggerated compliments', 'Financial expenditures', 'B', 'Discrepancies refers to variances or lack of agreement between conflicting records.');
  insertQuestion.run('q-e1-4', qEng1, 'When a reader deduces unstated ideas based on facts and evidence provided in a passage, they are making:', 'A literal paraphrase', 'An inference', 'A punctuation error', 'A summary quotation', 'B', 'An inference is a logical deduction drawn from contextual evidence.');
  insertQuestion.run('q-e1-5', qEng1, 'What transitional word or phrase signals contrast in academic prose?', 'Furthermore', 'Consequently', 'On the contrary', 'In addition', 'C', '"On the contrary" and "However" signal contrast between distinct arguments.');

  // English Quiz 2
  insertQuestion.run('q-e2-1', qEng2, 'A sentence error where two independent clauses are joined with only a comma and no coordinating conjunction is a:', 'Sentence fragment', 'Comma splice', 'Dangling modifier', 'Fused run-on', 'B', 'A comma splice incorrectly connects independent clauses without a coordinating conjunction.');
  insertQuestion.run('q-e2-2', qEng2, 'Identify the sentence error: "Walking into the library, the books looked fascinating."', 'Dangling modifier', 'Parallelism error', 'Subject-verb disagreement', 'Tautology', 'A', 'The introductory participial phrase "Walking into the library" modifies the books instead of the person walking.');
  insertQuestion.run('q-e2-3', qEng2, 'Which sentence demonstrates correct grammatical parallelism?', 'She likes hiking, to swim, and bicycling.', 'She likes hiking, swimming, and bicycling.', 'She likes to hike, swimming, and also bikes.', 'She likes hiking, swims, and bicycle rides.', 'B', 'Parallel structures require coordinating elements to share the same grammatical form (gerunds: hiking, swimming, bicycling).');
  insertQuestion.run('q-e2-4', qEng2, 'In an academic argumentative essay, where is the thesis statement typically positioned?', 'At the very end of the introductory paragraph.', 'In the first sentence of body paragraph two.', 'Solely in the works cited bibliography.', 'In the appendices.', 'A', 'The thesis statement usually caps the introductory paragraph to guide the essay.');
  insertQuestion.run('q-e2-5', qEng2, 'Which of the following is a complete, grammatically correct sentence?', 'Because the examination was postponed until Friday.', 'The university freshman completed all practice questions before midnight.', 'Having reviewed the lecture slides all evening.', 'While studying in the quiet reading hall.', 'B', 'Option B contains a complete subject, finite verb, and expresses a complete thought.');

  // Global Studies Quiz 1
  insertQuestion.run('q-g1-1', qGlob1, 'Which historical treaty in 1648 laid the foundation for the modern international state system and territorial sovereignty?', 'Treaty of Versailles', 'Peace of Westphalia', 'Congress of Vienna', 'Treaty of Utrecht', 'B', 'The Peace of Westphalia (1648) established the doctrine of state sovereignty and non-interference.');
  insertQuestion.run('q-g1-2', qGlob1, 'Which major theoretical school of international relations views world politics as an anarchic struggle for state survival and military power?', 'Liberalism', 'Realism', 'Constructivism', 'Marxism', 'B', 'Realism views states as unitary actors operating in an anarchic world where power and security dominate.');
  insertQuestion.run('q-g1-3', qGlob1, 'What is the principal deliberative organ of the United Nations where all 193 member states have equal voting representation?', 'The UN Security Council', 'The UN General Assembly', 'The International Court of Justice', 'The Economic and Social Council', 'B', 'The General Assembly provides one vote per member state regardless of population or wealth.');
  insertQuestion.run('q-g1-4', qGlob1, 'How many permanent members (P5) with veto power sit on the United Nations Security Council?', '3', '5', '10', '15', 'B', 'The P5 permanent members are the US, UK, France, Russia, and China.');
  insertQuestion.run('q-g1-5', qGlob1, 'An international non-governmental organization (INGO) is distinguished by being:', 'Formed and funded directly by sovereign military alliances.', 'Independent of government control and driven by humanitarian or civic objectives.', 'A profit-seeking multinational banking corporation.', 'A territorial regional state government.', 'B', 'INGOs like Amnesty International or the Red Cross operate independently of state governments.');

  // Global Studies Quiz 2
  insertQuestion.run('q-g2-1', qGlob2, 'Economic globalization is primarily characterized by:', 'Restricting border movements and closing all ports.', 'The increasing integration of national economies through cross-border trade, capital flows, and technology.', 'The complete dissolution of sovereign national identities.', 'The universal adoption of a single planetary language.', 'B', 'Economic globalization connects global markets through trade deregulation and capital mobility.');
  insertQuestion.run('q-g2-2', qGlob2, 'Which Bretton Woods institution was created to provide financial loans to developing countries for reconstruction and development projects?', 'World Trade Organization (WTO)', 'World Bank', 'International Criminal Court (ICC)', 'OPEC', 'B', 'The World Bank was established to finance reconstruction and long-term economic development.');
  insertQuestion.run('q-g2-3', qGlob2, 'The headquarters of the African Union (AU) is located in which African capital?', 'Nairobi, Kenya', 'Addis Ababa, Ethiopia', 'Cairo, Egypt', 'Johannesburg, South Africa', 'B', 'Addis Ababa has been the diplomatic capital and headquarters of the AU since its inception.');
  insertQuestion.run('q-g2-4', qGlob2, 'The concept of "soft power", popularized by Joseph Nye, refers to a state\'s ability to achieve objectives through:', 'Coercion, military invasions, and blockades.', 'Cultural appeal, political values, and diplomatic legitimacy.', 'Economic sanctions and embargoes exclusively.', 'Nuclear weapons deterrence.', 'B', 'Soft power relies on attraction, cultural diplomacy, and persuasion rather than military force.');
  insertQuestion.run('q-g2-5', qGlob2, 'Which international environmental treaty was adopted in 2015 to limit global temperature increases well below 2°C?', 'Kyoto Protocol', 'Paris Climate Agreement', 'Montreal Protocol', 'Rio Declaration', 'B', 'The 2015 Paris Agreement is the binding multilateral framework on climate mitigation.');

  // Entrepreneurship Quiz 1
  insertQuestion.run('q-en1-1', qEnt1, 'An entrepreneur is best defined as an individual who:', 'Avoids any form of career financial risk.', 'Identifies opportunities, takes calculated risks, and organizes resources to create value.', 'Only works in governmental civil service departments.', 'Inherits established monopolies without innovation.', 'B', 'Entrepreneurs create new ventures by innovating and managing calculated risks.');
  insertQuestion.run('q-en1-2', qEnt1, 'Joseph Schumpeter coined which famous phrase to describe how entrepreneurial innovation continually revolutionizes economic structures?', 'The Invisible Hand', 'Creative Destruction', 'Comparative Advantage', 'Supply and Demand Equilibrium', 'B', 'Creative destruction explains how new business models and innovations replace outdated industries.');
  insertQuestion.run('q-en1-3', qEnt1, 'What is the primary difference between a small business manager and an innovative growth-oriented entrepreneur?', 'Small business managers focus on steady stability; innovative entrepreneurs focus on high growth and scaling.', 'Small business managers always employ more than 10,000 workers.', 'Innovative entrepreneurs never register formal trademarks.', 'There is no distinction.', 'A', 'Entrepreneurs prioritize rapid scalability and innovative market disruption.');
  insertQuestion.run('q-en1-4', qEnt1, 'In the design thinking methodology, the first essential stage is:', 'Prototyping', 'Empathize (Understanding user needs)', 'Testing', 'Funding acquisition', 'B', 'Design thinking begins with empathizing with end-users to discover authentic pain points.');
  insertQuestion.run('q-en1-5', qEnt1, 'A Minimum Viable Product (MVP) is created to:', 'Launch a flawless, completely finished product after five years of secret development.', 'Test core business hypotheses with real customers using minimum resources.', 'Satisfy all possible customer feature requests simultaneously.', 'Liquidate company assets.', 'B', 'An MVP allows entrepreneurs to gather validated customer learning with minimal investment.');

  // Entrepreneurship Quiz 2
  insertQuestion.run('q-en2-1', qEnt2, 'In Alexander Osterwalder\'s Business Model Canvas, what does the "Value Proposition" describe?', 'The total tax rate owed to the government.', 'The unique bundle of products and services that creates value for a specific customer segment.', 'The names of the external equity investors.', 'The physical location of the factory warehouse.', 'B', 'The value proposition answers why customers choose your solution over alternatives.');
  insertQuestion.run('q-en2-2', qEnt2, 'What does the Break-Even Point (BEP) signify for a new business enterprise?', 'The point where total revenue equals total costs (zero profit and zero loss).', 'The highest net profit achievable in year one.', 'The point of bankruptcy declaration.', 'The point when venture capital is guaranteed.', 'A', 'At break-even, total revenues match fixed and variable expenses exactly.');
  insertQuestion.run('q-en2-3', qEnt2, 'Financing a new venture exclusively through personal savings, initial sales revenue, and careful frugality without external investors is called:', 'Venture capital financing', 'Bootstrapping', 'Initial Public Offering (IPO)', 'Mezzanine debt', 'B', 'Bootstrapping builds a business from internal cash flow and personal resources.');
  insertQuestion.run('q-en2-4', qEnt2, 'A SWOT analysis helps an entrepreneur evaluate an idea by examining:', 'Strengths, Weaknesses, Opportunities, and Threats.', 'Sales, Wages, Operations, and Taxes.', 'Suppliers, Warehouses, Owners, and Tenants.', 'Standards, Warranties, Orders, and Trademarks.', 'A', 'SWOT analyzes internal strengths/weaknesses and external opportunities/threats.');
  insertQuestion.run('q-en2-5', qEnt2, 'Conducting a market feasibility study before full product launch is vital because it:', 'Guarantees that a startup will never face market competitors.', 'Verifies whether sufficient customer demand exists at a profitable price point.', 'Replaces the need for accounting and bookkeeping.', 'Enables the founder to bypass government registration requirements.', 'B', 'Market feasibility verifies real willingness to pay and viable customer market size.');

  // 6. Seed Sample Attempt for Student
  const insertAttempt = db.prepare(`
    INSERT INTO quiz_attempts (id, user_id, quiz_id, started_at, completed_at, score, percentage, xp_earned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAttempt.run('att-01', studentId, qLogic1, new Date(Date.now() - 3600000).toISOString(), new Date().toISOString(), 4, 80.0, 40);

  console.log('Database successfully seeded with ALL freshman courses, chapters, quizzes, and questions!');
  db.close();
}

seed();
