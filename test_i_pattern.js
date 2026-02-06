const { compileClues } = require('./dist/parser_rules.js');
const { buildDefaultBoard } = require('./dist/board.js');

// Create board with test names
const cells = buildDefaultBoard();
cells[0].name = 'Alice';
cells[1].name = 'Bob';
cells[2].name = 'Donald';
cells[3].name = 'Zoe';

const board = { cells, clues: [] };

// Test 1: String clue (no speaker)
console.log('\n=== Test 1: Regular string clue ===');
const result1 = compileClues(['Alice has more innocent than criminal neighbors'], board);
console.log('Result:', result1.length, 'constraints');
if (result1.length > 0) {
  console.log('✓ Pattern matched');
} else {
  console.log('✗ Pattern did not match');
}

// Test 2: ClueWithSpeaker where speaker is Alice
console.log('\n=== Test 2: ClueWithSpeaker with "I" ===');
const clueWithSpeaker = {
  text: 'I have more innocent than criminal neighbors',
  speaker: 'Alice'
};
console.log('Original clue:', clueWithSpeaker.text);
console.log('Speaker:', clueWithSpeaker.speaker);
console.log('Note: "I have" should become "Alice has" (verb conjugation needed)');
const result2 = compileClues([clueWithSpeaker], board);
console.log('Result:', result2.length, 'constraints');
if (result2.length > 0) {
  console.log('✓ "I" was substituted with speaker name (Alice)');
  console.log('Constraint:', result2[0]);
} else {
  console.log('✗ Pattern did not match after I substitution');
  // Try with correct grammar
  console.log('\nTesting with correct grammar (Alice has):');
  const directTest = compileClues(['Alice has more innocent than criminal neighbors'], board);
  console.log('Direct test result:', directTest.length, 'constraints');
  if (directTest.length > 0) {
    console.log('✓ Grammar-corrected version works!');
  }
}

// Test 3: Between pattern
console.log('\n=== Test 3: Between pattern ===');
const result3 = compileClues(['There are exactly 2 innocents between Donald and Zoe'], board);
console.log('Result:', result3.length, 'constraints');
if (result3.length > 0) {
  console.log('✓ Between pattern matched');
} else {
  console.log('✗ Between pattern did not match');
}
