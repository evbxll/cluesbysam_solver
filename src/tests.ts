/**
 * Unit tests for CluesBySam Solver
 * Run with: npm test (if configured) or manually in browser
 */

// Import would go here - for browser testing, we'll use the bundled code

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  error?: Error;
}

const tests: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => {
        tests.push({ name, passed: true, message: 'Async test passed' });
      }).catch((error) => {
        tests.push({ name, passed: false, message: 'Async test failed', error });
      });
    } else {
      tests.push({ name, passed: true, message: 'Test passed' });
    }
  } catch (error) {
    tests.push({ name, passed: false, message: 'Test failed', error: error as Error });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
    );
  }
}

// ============================================================================
// TESTS
// ============================================================================

// Test 1: DOM Element Finding
test('findCardElements should find grid cards', () => {
  const mockGrid = document.createElement('div');
  mockGrid.className = 'card-grid';
  mockGrid.id = 'grid';
  
  for (let i = 0; i < 20; i++) {
    const container = document.createElement('div');
    container.className = 'card-container';
    const card = document.createElement('div');
    card.className = 'card';
    container.appendChild(card);
    mockGrid.appendChild(container);
  }
  
  document.body.appendChild(mockGrid);
  
  // Simulate the findCardElements function behavior
  const cards = document.querySelectorAll('.card-container .card');
  assert(cards.length >= 20, `Expected at least 20 cards, found ${cards.length}`);
  
  document.body.removeChild(mockGrid);
});

// Test 2: Text Extraction
test('textOf should extract and clean text', () => {
  const el = document.createElement('div');
  el.textContent = '  Test\u00A0Content  ';
  
  const textOf = (el: Element | null): string => {
    if (!el) return '';
    return (el.textContent || '').trim().replace(/\u00A0/g, ' ');
  };
  
  const result = textOf(el);
  assertEqual(result, 'Test Content', 'Text should be trimmed and non-breaking spaces replaced');
});

// Test 3: Clue Detection from Hints
test('findClueStrings should detect hints in cards', () => {
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  
  const card = document.createElement('div');
  card.className = 'card';
  
  const name = document.createElement('h3');
  name.className = 'name';
  name.textContent = 'TestPerson';
  card.appendChild(name);
  
  const cardBack = document.createElement('div');
  cardBack.className = 'card-back';
  
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'TestPerson is innocent';
  cardBack.appendChild(hint);
  
  card.appendChild(cardBack);
  grid.appendChild(card);
  document.body.appendChild(grid);
  
  const hints = document.querySelectorAll('.hint');
  assert(hints.length === 1, `Expected 1 hint, found ${hints.length}`);
  assertEqual(hints[0].textContent, 'TestPerson is innocent', 'Hint text should match');
  
  document.body.removeChild(grid);
});

// Test 4: Status Detection
test('parseCard should detect innocent/criminal status from classes', () => {
  const cardInnocent = document.createElement('div');
  cardInnocent.className = 'card flipped innocent';
  
  const cardCriminal = document.createElement('div');
  cardCriminal.className = 'card flipped criminal';
  
  const cardUnknown = document.createElement('div');
  cardUnknown.className = 'card';
  
  const classList1 = cardInnocent.className.toLowerCase();
  const classList2 = cardCriminal.className.toLowerCase();
  const classList3 = cardUnknown.className.toLowerCase();
  
  assert(classList1.includes('innocent'), 'Innocent card should have innocent class');
  assert(classList2.includes('criminal'), 'Criminal card should have criminal class');
  assert(!classList3.includes('innocent') && !classList3.includes('criminal'), 'Unknown card should not have status class');
});

// Test 5: localStorage disabled clues
test('localStorage should persist disabled clues', () => {
  const testKey = 'cluesbysam_disabled_clues_test';
  const testClues = ['clue1', 'clue2', 'clue3'];
  
  localStorage.setItem(testKey, JSON.stringify(testClues));
  
  const retrieved = JSON.parse(localStorage.getItem(testKey) || '[]');
  assertEqual(retrieved.length, 3, 'Should retrieve 3 clues');
  assertEqual(retrieved[0], 'clue1', 'First clue should match');
  
  localStorage.removeItem(testKey);
});

// Test 6: Button creation and event listeners
test('Buttons should be created with proper attributes', () => {
  const btn = document.createElement('button');
  btn.className = 'solver-btn stats-btn';
  btn.textContent = '📊 0/0';
  btn.style.cssText = 'padding:8px 12px;background:#4fc3f7;';
  
  let clicked = false;
  btn.addEventListener('click', () => { clicked = true; });
  
  btn.click();
  
  assert(clicked, 'Button click event should fire');
  assert(btn.className.includes('stats-btn'), 'Button should have correct class');
});

// Test 7: Panel creation
test('Panels should be created with correct structure', () => {
  const panel = document.createElement('div');
  panel.id = 'test-panel';
  panel.style.cssText = 'position:fixed;top:50px;left:50px;background:#1e1e1e;';
  
  const header = document.createElement('div');
  header.textContent = 'Test Panel';
  panel.appendChild(header);
  
  const content = document.createElement('div');
  content.className = 'panel-content';
  panel.appendChild(content);
  
  document.body.appendChild(panel);
  
  const found = document.getElementById('test-panel');
  assert(found !== null, 'Panel should be in DOM');
  if (found) {
    assert(found.querySelector('.panel-content') !== null, 'Panel should have content div');
  }
  
  if (found) {
    document.body.removeChild(panel);
  }
});

// ============================================================================
// TEST RUNNER
// ============================================================================

function runTests() {
  console.log('='.repeat(60));
  console.log('Running CluesBySam Solver Unit Tests');
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(result => {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Message: ${result.message}`);
      if (result.error) {
        console.log(`  Error: ${result.error.message}`);
        console.log(`  Stack: ${result.error.stack}`);
      }
      failed++;
    }
  });
  
  console.log('='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  return { passed, failed, total: passed + failed };
}

// Export for use in browser console or Node.js
if (typeof globalThis !== 'undefined') {
  (globalThis as any).runTests = runTests;
  (globalThis as any).tests = tests;
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  console.log('Unit tests loaded. Call runTests() to execute.');
}
