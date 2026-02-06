const { compileClues } = require('./dist/parser_rules.js');
const { buildDefaultBoard } = require('./dist/board.js');

// Create board with Zoe
const cells = buildDefaultBoard();
cells[10].name = 'Zoe';

const board = { cells, clues: [] };

// Test: Clue from Zoe's card saying "I have more innocent than criminal neighbors"
console.log('=== Test: Zoe says "I have more innocent than criminal neighbors" ===');
const clueWithSpeaker = {
  text: 'I have more innocent than criminal neighbors',
  speaker: 'Zoe'
};

const result = compileClues([clueWithSpeaker], board);
console.log('Result:', result.length, 'constraints');

if (result.length > 0) {
  console.log('✓ Pattern matched!');
  console.log('\nGenerated constraint:');
  console.log('  Kind:', result[0].kind);
  console.log('  Left mask (innocent neighbors):', result[0].leftMask);
  console.log('  Left wants criminals?:', result[0].leftWantCrim);
  console.log('  Right mask (criminal neighbors):', result[0].rightMask);
  console.log('  Right wants criminals?:', result[0].rightWantCrim);
  console.log('  Operator:', result[0].op);
  console.log('\nThis translates to:');
  console.log('  compare(neighbor(zoe)@innocent, >, neighbor(zoe)@criminal)');
  console.log('\nCorrect behavior:');
  console.log('  Left side counts INNOCENTS (leftWantCrim=false) in mask', result[0].leftMask);
  console.log('  Right side counts CRIMINALS (rightWantCrim=true) in mask', result[0].rightMask);
  console.log('  Then compares: innocent_count > criminal_count');
} else {
  console.log('✗ Pattern did not match');
}
