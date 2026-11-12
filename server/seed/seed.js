require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Category = require('../models/Category');
const Question = require('../models/Question');
const Room = require('../models/Room');
const Match = require('../models/Match');

const CATEGORIES = [
  { name: 'Science', description: 'Physics, chemistry, biology and the natural world', icon: '🔬' },
  { name: 'Technology', description: 'Computers, the internet and modern tech', icon: '💻' },
  { name: 'Programming', description: 'Languages, algorithms and software concepts', icon: '⌨️' },
  { name: 'Mathematics', description: 'Arithmetic, algebra and beyond', icon: '📐' },
  { name: 'History', description: 'Events, empires and civilizations', icon: '🏛️' },
  { name: 'General Knowledge', description: 'Geography, sports and the world around us', icon: '🌍' },
];

// [category, difficulty, text, options[4], correctIndex, explanation]
const QUESTIONS = [
  // Science
  ['Science', 'easy', 'What planet is known as the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1, 'Mars looks red because of iron oxide (rust) on its surface.'],
  ['Science', 'easy', 'What is H2O commonly known as?', ['Hydrogen peroxide', 'Salt', 'Water', 'Oxygen'], 2, 'H2O is the chemical formula for water.'],
  ['Science', 'medium', 'What is the chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 2, 'Au comes from the Latin word for gold, "aurum".'],
  ['Science', 'medium', 'Which gas do plants absorb from the atmosphere for photosynthesis?', ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], 2, 'Plants take in carbon dioxide and release oxygen.'],
  ['Science', 'hard', 'Which particle is known as the "God particle"?', ['Photon', 'Higgs boson', 'Gluon', 'Neutrino'], 1, 'The Higgs boson gives other particles their mass; it was confirmed in 2012.'],
  ['Science', 'hard', 'What is the approximate speed of light in a vacuum?', ['150,000 km/s', '300,000 km/s', '30,000 km/s', '3,000,000 km/s'], 1, 'Light travels at about 299,792 km/s, roughly 300,000 km/s.'],
  // Technology
  ['Technology', 'easy', 'What does "CPU" stand for?', ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Control Processing Unit'], 0, 'The CPU is the primary component that executes instructions.'],
  ['Technology', 'easy', 'Which company created the iPhone?', ['Samsung', 'Apple', 'Nokia', 'Google'], 1, 'Apple released the first iPhone in 2007.'],
  ['Technology', 'medium', 'What does "HTTP" stand for?', ['HyperText Transfer Protocol', 'High Transfer Text Protocol', 'HyperText Transmission Program', 'Home Tool Transfer Protocol'], 0, 'HTTP is the foundation of data communication on the web.'],
  ['Technology', 'medium', 'Which of these is an input device?', ['Monitor', 'Printer', 'Keyboard', 'Speaker'], 2, 'A keyboard sends input into the computer; the others are output devices.'],
  ['Technology', 'hard', 'In which year did Tim Berners-Lee first propose the World Wide Web?', ['1985', '1989', '1993', '1991'], 1, 'He submitted the proposal at CERN in March 1989.'],
  ['Technology', 'hard', 'Which data structure follows the LIFO (Last In, First Out) principle?', ['Queue', 'Stack', 'Linked list', 'Tree'], 1, 'A stack pushes and pops from the same end — last in, first out.'],
  // Programming
  ['Programming', 'easy', 'Which language is primarily known as the language of the web?', ['Python', 'JavaScript', 'C++', 'Rust'], 1, 'JavaScript runs natively in every major web browser.'],
  ['Programming', 'easy', 'What does "HTML" stand for?', ['HyperText Markup Language', 'HighText Machine Language', 'Hyperlink and Text Markup Language', 'Home Tool Markup Language'], 0, 'HTML structures content on web pages.'],
  ['Programming', 'medium', 'In JavaScript, which keyword declares a block-scoped variable that can be reassigned?', ['var', 'let', 'const', 'def'], 1, '"let" is block-scoped and reassignable; "const" cannot be reassigned.'],
  ['Programming', 'medium', 'What does "SQL" stand for?', ['Structured Query Language', 'Simple Query Logic', 'Standard Question Language', 'Sequential Query List'], 0, 'SQL is used to query relational databases.'],
  ['Programming', 'hard', 'Which of the following is NOT a JavaScript primitive type?', ['string', 'number', 'boolean', 'array'], 3, 'Arrays are objects in JavaScript, not primitives.'],
  ['Programming', 'hard', 'What is the time complexity of binary search on a sorted array?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1, 'Binary search halves the search space each step: O(log n).'],
  // Mathematics
  ['Mathematics', 'easy', 'What is 12 × 8?', ['84', '96', '108', '72'], 1, '12 × 8 = 96.'],
  ['Mathematics', 'easy', 'What is the square root of 144?', ['10', '11', '12', '14'], 2, '12 × 12 = 144.'],
  ['Mathematics', 'medium', 'What is 15% of 200?', ['20', '25', '30', '35'], 2, '0.15 × 200 = 30.'],
  ['Mathematics', 'medium', 'If x + 7 = 15, what is x?', ['6', '7', '8', '9'], 2, 'x = 15 − 7 = 8.'],
  ['Mathematics', 'hard', 'What is the value of π (pi) to two decimal places?', ['3.12', '3.14', '3.16', '3.18'], 1, 'π ≈ 3.14159…, so 3.14 to two decimals.'],
  ['Mathematics', 'hard', 'What is the derivative of x² with respect to x?', ['x', '2x', 'x³/3', '2'], 1, 'By the power rule, d/dx(x²) = 2x.'],
  // History
  ['History', 'easy', 'In which year did World War II end?', ['1943', '1944', '1945', '1946'], 2, 'The war in Europe ended in May 1945 and in the Pacific in September 1945.'],
  ['History', 'easy', 'Who was the first President of the United States?', ['Thomas Jefferson', 'Abraham Lincoln', 'George Washington', 'John Adams'], 2, 'George Washington served from 1789 to 1797.'],
  ['History', 'medium', 'The ancient pyramids of Giza are located in which country?', ['Mexico', 'Egypt', 'Peru', 'Greece'], 1, 'The Giza plateau is near Cairo, Egypt.'],
  ['History', 'medium', 'Which empire built the Colosseum?', ['Greek', 'Roman', 'Ottoman', 'Persian'], 1, 'Construction began under Emperor Vespasian around 70 AD.'],
  ['History', 'hard', 'The Magna Carta was signed in which year?', ['1066', '1215', '1348', '1485'], 1, 'King John sealed it at Runnymede in June 1215.'],
  ['History', 'hard', 'Which civilization developed cuneiform, the first known writing system?', ['Egyptians', 'Sumerians', 'Mayans', 'Chinese'], 1, 'Sumerians in Mesopotamia developed cuneiform around 3400 BCE.'],
  // General Knowledge
  ['General Knowledge', 'easy', 'How many continents are there on Earth?', ['5', '6', '7', '8'], 2, 'Africa, Antarctica, Asia, Europe, North America, South America, and Australia.'],
  ['General Knowledge', 'easy', 'What is the largest ocean on Earth?', ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Pacific Ocean'], 3, 'The Pacific covers about one-third of Earth\'s surface.'],
  ['General Knowledge', 'medium', 'Which is traditionally cited as the longest river in the world?', ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], 1, 'The Nile (~6,650 km) is the traditional answer.'],
  ['General Knowledge', 'medium', 'How many players from one football (soccer) team are on the pitch at a time?', ['9', '10', '11', '12'], 2, '11 players per side, including the goalkeeper.'],
  ['General Knowledge', 'hard', 'What is the capital city of Australia?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 2, 'Canberra was purpose-built as the capital in 1913.'],
  ['General Knowledge', 'hard', 'Which element has the atomic number 1?', ['Helium', 'Hydrogen', 'Lithium', 'Oxygen'], 1, 'Hydrogen is the lightest and most abundant element.'],
];

async function seed() {
  await connectDB();

  // Wipe (demo data only)
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Question.deleteMany({}),
    Room.deleteMany({}),
    Match.deleteMany({}),
  ]);

  const categories = await Category.insertMany(CATEGORIES);
  const catByName = Object.fromEntries(categories.map((c) => [c.name, c._id]));

  const questions = QUESTIONS.map(([cat, difficulty, text, options, correctIndex, explanation]) => ({
    category: catByName[cat],
    difficulty,
    text,
    options,
    correctIndex,
    explanation,
  }));
  await Question.insertMany(questions);

  const mkUser = async (username, email, password, role = 'player') => {
    const u = new User({ username, email, role });
    u.password = password;
    await u.save();
    return u;
  };

  await mkUser('admin', 'admin@quizarena.local', 'Admin123!', 'admin');
  await mkUser('player1', 'player1@quizarena.local', 'Player123!');
  await mkUser('player2', 'player2@quizarena.local', 'Player123!');

  console.log('Seeded:');
  console.log(`  Categories: ${categories.length}`);
  console.log(`  Questions:  ${questions.length}`);
  console.log('  Users:      3');
  console.log('');
  console.log('Credentials:');
  console.log('  admin    admin@quizarena.local    / Admin123!');
  console.log('  player1  player1@quizarena.local  / Player123!');
  console.log('  player2  player2@quizarena.local  / Player123!');
}

seed()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
