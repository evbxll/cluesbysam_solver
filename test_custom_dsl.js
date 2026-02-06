const { getClueTranslation } = require('./dist/parser_rules.js');
const { buildDefaultBoard } = require('./dist/board.js');

const cells = buildDefaultBoard();
cells[10].name = 'Zoe';
cells[11].name = 'Gabe';

const board = { cells, clues: [] };

const dsl = "eq(2, (above(zoe)@criminal & neighbor(gabe)@criminal))";
console.log('Testing DSL:', dsl);

const translation = getClueTranslation(dsl, board);
console.log('Result:', translation.constraints.length, 'constraints');
if (translation.constraints.length > 0) {
  console.log('Success!');
  console.log(translation.constraints[0]);
} else {
  console.log('Failed - no constraints generated');
}
