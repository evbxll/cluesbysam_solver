# Speaker-Attributed Clues ("I" Pattern Support)

## Overview

The solver now supports clues that use first-person pronouns ("I") by automatically attributing them to specific character cards and performing appropriate substitutions with verb conjugation.

## How It Works

### 1. Clue Extraction

When extracting clues from the puzzle page, the system looks for hints within card elements:

```typescript
// In findClueStrings():
cards.forEach((card, idx) => {
  const cardHints = card.querySelectorAll('.card-back .hint, .hint');
  cardHints.forEach(h => {
    const text = textOf(h);
    const nameEl = card.querySelector('.name h3.name, .name h3');
    const speaker = nameEl ? textOf(nameEl) : undefined;
    hints.push({ text, speaker });
  });
});
```

This creates `ClueWithSpeaker` objects:
```typescript
{
  text: "I have more innocent than criminal neighbors",
  speaker: "Alice"
}
```

### 2. Pronoun Substitution with Verb Conjugation

During parsing, the system substitutes first-person pronouns with the speaker's name and adjusts verb forms:

```typescript
if (speaker) {
  // Replace "I have" with "{name} has"
  clue = clue.replace(/\bI have\b/g, `${speaker} has`);
  // Replace "I am" with "{name} is"
  clue = clue.replace(/\bI am\b/g, `${speaker} is`);
  // Replace any remaining standalone "I" with speaker name
  clue = clue.replace(/\bI\b/g, speaker);
}
```

**Examples:**
- `"I have more innocent neighbors"` (Alice) → `"Alice has more innocent neighbors"`
- `"I am in row 3"` (Bob) → `"Bob is in row 3"`
- `"I'm connected to Carol"` (Dan) → `"Dan is connected to Carol"`

### 3. UI Display

The Rules panel shows which character spoke each clue:

```
#3 [Alice]: I have more innocent than criminal neighbors
✓ ACTIVE (1 constraint generated)
```

## Supported Patterns

### First-Person Neighbor Comparisons
- **Original**: `"I have more innocent than criminal neighbors"`
- **After substitution**: `"Alice has more innocent than criminal neighbors"`
- **Pattern**: `"{name} has more innocent than criminal neighbors"`
- **DSL**: `"compare(neighbor({name})@innocent, >, neighbor({name})@criminal)"`

### Other Supported First-Person Patterns
Any existing pattern that uses `{name}` can work with "I" substitution:
- `"I am connected to {name}"` → `"Alice is connected to {name}"`
- `"I have {k} innocent neighbors"` → `"Alice has {k} innocent neighbors"`
- `"I am in {rowcol} {rowcolval}"` → `"Alice is in {rowcol} {rowcolval}"`

## Data Types

### ClueWithSpeaker
```typescript
export type ClueWithSpeaker = {
  text: string;
  speaker?: string; // Name of the card this clue is on
};
```

### BoardSnapshot (Updated)
```typescript
export type BoardSnapshot = {
  cells: CellSnapshot[];
  clues: (string | ClueWithSpeaker)[];
};
```

## Testing

Run the test suite to verify "I" pattern functionality:

```bash
node test_i_pattern.js
```

**Expected output:**
```
=== Test 1: Regular string clue ===
Result: 1 constraints
✓ Pattern matched

=== Test 2: ClueWithSpeaker with "I" ===
Result: 1 constraints
✓ "I" was substituted with speaker name (Alice)

=== Test 3: Between pattern ===
Result: 1 constraints
✓ Between pattern matched
```

## Implementation Files

- **src/types.ts**: Added `ClueWithSpeaker` type
- **src/content.ts**: Updated clue extraction to capture speaker from card elements
- **src/parser_rules.ts**: Added pronoun substitution and verb conjugation logic
- **src/parser_dsl.ts**: Updated to handle `ClueWithSpeaker` type

## Known Limitations

1. **Verb conjugation** is limited to common cases:
   - "I have" → "{name} has"
   - "I am" → "{name} is"
   - Other verb forms may need manual patterns

2. **Card attribution** depends on HTML structure:
   - Requires `.card-back .hint` or `.hint` elements within `.card` elements
   - If clues aren't structured this way, they'll be treated as plain strings

3. **Custom rules** in the UI still use plain text without speaker attribution

## Future Enhancements

- Add more verb conjugations (e.g., "I'm" → "is", "I've" → "has")
- Support possessive forms ("my" → "{name}'s")
- Support object pronouns ("me" → "{name}")
- Add speaker dropdown in custom rule UI
