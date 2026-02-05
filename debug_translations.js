const { compileClues } = require('./dist/parser_rules.js');

const dummyBoard = {
  cells: [
    "alice", "bobby", "chuck", "diane", "ethan", "flora", "gabe", "helen",
    "isaac", "joyce", "kyle", "laura", "petra", "quinn", "tina", "uma",
    "vicky", "wanda", "xavi", "zach"
  ].map((name, i) => ({
    id: i,
    name,
    profession: "",
    status: "UNKNOWN",
    pos: String.fromCharCode(65 + (i % 4)) + (Math.floor(i / 4) + 1)
  })),
  clues: []
};

const testClues = [
  "The only innocent in row 4 is Wanda's neighbor",
  "Floyd is one of Gabe's 3 innocent neighbors",
  "Isaac is one of 2 innocents below Ethan",
];

testClues.forEach((clue) => {
  try {
    const result = compileClues([clue], dummyBoard);
    console.log(`\nClue: ${clue}`);
    console.log(`Constraints:`);
    result.forEach((c, i) => {
      console.log(`  [${i}] ${JSON.stringify(c, null, 2)}`);
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
});
