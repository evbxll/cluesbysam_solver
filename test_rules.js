const { compileClues } = require('./dist/parser_rules.js');

// Board with names and positions
const testBoard = {
  cells: Array(20).fill(null).map((_, i) => ({
    id: i,
    name: ['alice', 'bobby', 'chuck', 'diane', 'ethan', 'flora', 'gabe', 'helen', 'isaac', 'joyce', 'kyle', 'laura', 'petra', 'quinn', 'tina', 'uma', 'vicky', 'wanda', 'xavi', 'zach'][i],
    pos: String.fromCharCode(65 + (i % 4)) + (Math.floor(i / 4) + 1)
  }))
};

const testCases = [
  "The only criminal in between Vicky and Zach is Vicky's neighbor",
  "The only criminal below Helen is above Xavi",
  "The only innocent in row 4 is Wanda's neighbor",
  "Floyd is one of Gabe's 3 innocent neighbors",
  "Isaac is one of 2 innocents below Ethan"
];

console.log('Testing rule translations to DSL:\n');
testCases.forEach((clue, i) => {
  const constraints = compileClues([clue], testBoard);
  const translates = constraints.length > 0;
  const status = translates ? '✓' : '✗';
  console.log(`${status} [${i + 1}] ${clue}`);
  if (translates) {
    console.log(`   Generated ${constraints.length} constraint(s)`);
  } else {
    console.log('   ✗ NOT TRANSLATED');
  }
});
