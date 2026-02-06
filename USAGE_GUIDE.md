# CluesBySam Solver - Quick Start Guide

## Installation

### 1. Build the Extension
```bash
npm install
npm run build:all
```

### 2. Load in Chrome
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the `cluesbysamsolver` folder
6. The extension is now installed!

## Usage

### Basic Usage
1. Navigate to any CluesBySam puzzle on `cluesbysam.com`
2. Look for two buttons in the bottom-right corner:
   - 📊 **Stats Button** - Shows solver stats (solutions/forced cells)
   - ⚙️ **Rules Button** - Opens Rules Manager

### Stats Panel
Click the 📊 button to open:
- **Solver Results**: Number of solutions and forced cells
- **Clues List**: All detected clues
- **Cell Status**: Current state of all 20 cells

### Rules Manager Panel
Click the ⚙️ button to open:
- **Clue Management**:
  - Toggle clues on/off with ☑/☐ buttons
  - Disabled clues won't affect the solver
  - See which clues successfully parsed (✓ green checkmark)
- **Custom Rules**:
  - Add custom DSL rules
  - Example: `eq(3, neighbor(alice)@innocent)`
  - Rules are session-only (not saved to disk)

### Features
- ✅ **Auto-solving**: Solver runs automatically when page loads
- ✅ **Live updates**: Updates when you flip cards
- ✅ **Draggable panels**: Drag panels by their headers
- ✅ **Position memory**: Panels remember where you moved them
- ✅ **Cell highlighting**: Forced cells highlighted on the board
  - Green outline = forced innocent
  - Red outline = forced criminal
- ✅ **Keyboard shortcut**: `Ctrl+Shift+Y` toggles overlay visibility

## Debugging

### Enable Debug Mode
Run in browser console:
```javascript
localStorage.setItem('cluesbysam_debug', '1');
```

Then reload the page. You'll see detailed debug logs in the console.

### Disable Debug Mode
```javascript
localStorage.removeItem('cluesbysam_debug');
```

## Testing

### Test with Sample Page
```bash
# Start local server
python -m http.server 8081

# Open in browser
http://localhost:8081/test_comprehensive.html
```

This loads a test puzzle with:
- 20 person cards
- Multiple clues
- Interactive test runner
- Console output viewer

### Manual Testing
1. Click the Stats button - should open panel
2. Click the Rules button - should open panel
3. Toggle a clue off/on - stats should update
4. Drag panels around - positions should persist on reload
5. Add a custom rule - solver should re-run

## Troubleshooting

### "No clues found"
- Check if the page has `.hint` elements
- Verify debug mode is on to see detection logs
- The page might not be a CluesBySam puzzle page

### "Buttons don't appear"
- Check browser console for errors
- Verify extension is loaded in `chrome://extensions/`
- Try reloading the page

### "Panels don't open"
- Check console for JavaScript errors
- Verify the build completed successfully
- Try rebuilding: `npm run build:all`

### "Solver shows 0 solutions"
- This is normal if the puzzle has no valid solutions yet
- Try flipping some cards to add constraints
- Check if clues are being detected (Rules Manager)

## Advanced Usage

### Custom DSL Rules
The solver supports a Domain-Specific Language (DSL) for custom rules:

Examples:
```
eq(3, neighbor(alice)@innocent)     # Alice has exactly 3 innocent neighbors
gt(2, neighbor(bob)@criminal)       # Bob has more than 2 criminal neighbors
eq(1, same_row(charlie)@innocent)   # Charlie's row has exactly 1 innocent person
all(column(diana), @innocent)       # Everyone in Diana's column is innocent
```

Operators:
- `eq(n, ...)` - exactly n matches
- `gt(n, ...)` - greater than n matches
- `lt(n, ...)` - less than n matches
- `gte(n, ...)` - greater than or equal to n
- `lte(n, ...)` - less than or equal to n

Filters:
- `neighbor(name)` - adjacent cells (up/down/left/right)
- `same_row(name)` - cells in same row
- `same_column(name)` - cells in same column
- `@innocent` - filter for innocent status
- `@criminal` - filter for criminal status

## Performance

The solver uses a constraint satisfaction approach:
- ⚡ Fast: Usually solves in <100ms
- 🧠 Smart: Only recomputes when board state changes
- 🎯 Efficient: MutationObserver auto-detects changes

## Persistence

What's saved:
- ✅ Disabled clues (localStorage)
- ✅ Panel positions (localStorage)

What's not saved:
- ❌ Custom DSL rules (session only)
- ❌ Panel open/closed state

## Keyboard Shortcuts

- `Ctrl+Shift+Y` - Toggle overlay visibility (hide/show buttons)

## Browser Compatibility

Tested on:
- ✅ Chrome 90+
- ✅ Edge 90+
- ⚠️ Firefox (not tested, may need manifest v2 version)
- ❌ Safari (not supported)

## Development

### Project Structure
```
cluesbysamsolver/
├── src/
│   ├── content.ts          # Main extension logic
│   ├── solver.ts           # Constraint solver
│   ├── parser_rules.ts     # DSL parser
│   ├── board.ts            # Board utilities
│   └── types.ts            # TypeScript types
├── dist/
│   └── content.js          # Bundled output
├── manifest.json           # Chrome extension manifest
├── package.json            # npm config
└── tsconfig.json           # TypeScript config
```

### Build Commands
```bash
npm run build       # TypeScript compilation only
npm run bundle      # esbuild bundling only
npm run build:all   # Both compilation and bundling
```

### Code Style
- TypeScript strict mode
- ES2020 target
- Class-based architecture
- Functional components pattern

## Support

For bugs or feature requests:
1. Enable debug mode
2. Reproduce the issue
3. Copy console logs
4. Report with steps to reproduce

## License

MIT License - See LICENSE file for details
