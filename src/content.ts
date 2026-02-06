import { buildDefaultBoard } from "./board";
import { solve, compileClues, getClueTranslation, compileDsl } from "./solver";
import { BoardSnapshot, CellId, ClueWithSpeaker } from "./types";

function isDebugEnabled(): boolean {
  try {
    return window.localStorage.getItem("cluesbysam_debug") === "1";
  } catch {
    return false;
  }
}
function debugLog(...args: unknown[]) {
  if (isDebugEnabled()) console.debug(...args);
}
function infoLog(...args: unknown[]) {
  if (isDebugEnabled()) console.info(...args);
}

// Content script DOM integration and MutationObserver.
// Heuristics-based extractor: finds a grid of person cards, extracts name, profession, pos and status.

type CardEl = Element & { __cellId?: number };

function textOf(el: Element | null): string {
  if (!el) return "";
  return (el.textContent || "").trim().replace(/\u00A0/g, " ");
}

function findClueStrings(): Array<string | { text: string; speaker?: string }> {
  debugLog("CluesBySam Solver: searching for clue strings...");
  // Prefer explicit hint elements found on card-backs
  const hints: Array<{ text: string; speaker?: string }> = [];
  const cards = findCardElements();
  
  // Extract hints from card-backs, tracking which card they belong to
  cards.forEach((card, idx) => {
    // Look for hints in multiple places within the card
    const cardHints = card.querySelectorAll('.card-back .hint, .card .hint, .hint');
    cardHints.forEach(h => {
      const t = textOf(h as Element);
      if (t && t.length > 3) {
        // Try to find the card's name
        const nameEl = card.querySelector('.name h3.name, .name h3, h3');
        const speaker = nameEl ? textOf(nameEl) : undefined;
        const hintObj = { text: t, speaker };
        // Avoid duplicates
        if (!hints.some(existing => existing.text === t)) {
          hints.push(hintObj);
          debugLog(`CluesBySam Solver: found hint "${t.substring(0, 50)}..." from ${speaker || 'unknown'}`);
        }
      }
    });
  });
  debugLog(`CluesBySam Solver: found ${hints.length} hints on card-backs`);
  if (hints.length > 0) return hints;

  // fallback: look for a generic clues container or text nodes containing clue keywords
  const selectors = [".clues", ".clue-list", ".clues-list", ".clue", "[data-clue]", ".hint-list"];
  for (const s of selectors) {
    const container = document.querySelector(s);
    if (container) {
      const items = Array.from(container.querySelectorAll("li, .clue-item, p, div"));
      const texts = items.map((it) => textOf(it)).filter((t) => t.length > 3);
      if (texts.length > 0) {
        debugLog(`CluesBySam Solver: found ${texts.length} clues in container ${s}`);
        return texts;
      }
    }
  }

  const nodes = Array.from(document.querySelectorAll("p, div, li")) as Element[];
  const clues: string[] = [];
  for (const n of nodes) {
    const t = textOf(n);
    if (/innocent|criminal|connected|neighbors?|row|column|only one|exactly|odd number/i.test(t) && t.length < 240 && t.length > 8) {
      if (!clues.includes(t)) {
        clues.push(t);
      }
    }
  }
  debugLog(`CluesBySam Solver: fallback found ${clues.length} candidate clue nodes`);
  const result = clues.slice(0, 50) as Array<string | { text: string; speaker?: string }>;
  if (result.length === 0) {
    debugLog('CluesBySam Solver: WARNING - No clues found at all! Page may not be loaded.');
  }
  return result;
}

function findCardElements(): Element[] {
  // Use the site's card-grid structure (matches exp_html.html)
  debugLog('CluesBySam Solver: locating card elements (.card-grid #grid .card-container .card)');
  const grid = document.querySelector('.card-grid') || document.getElementById('grid');
  if (grid) {
    const cards = Array.from(grid.querySelectorAll('.card-container .card'));
    debugLog(`CluesBySam Solver: found ${cards.length} cards in grid`);
    if (cards.length >= 10) return cards;
  }
  // fallback: global search for card elements
  const fallback = Array.from(document.querySelectorAll('.card, .person-card, .grid-item, li'));
  debugLog(`CluesBySam Solver: fallback found ${fallback.length} card-like elements`);
  return Array.from(document.querySelectorAll('.card, .person-card, .grid-item, li'));
}

function parseCard(el: Element, idx: number) {
  // The real site uses structure like in exp_html.html
  const coordEl = el.querySelector('.coord');
  const pos = coordEl ? textOf(coordEl) : undefined;
  const nameEl = el.querySelector('.name h3.name, .name h3');
  const name = nameEl ? textOf(nameEl) : `P${idx+1}`;
  const profEl = el.querySelector('.profession, .job, .role');
  const profession = profEl ? textOf(profEl) : undefined;

  // status: card may have classes like 'flipped innocent' or 'flipped criminal'
  const classList = (el.getAttribute('class') || '').toLowerCase();
  let status: 'UNKNOWN' | 'INNOCENT' | 'CRIMINAL' = 'UNKNOWN';
  if (classList.includes('innocent')) status = 'INNOCENT';
  if (classList.includes('criminal')) status = 'CRIMINAL';
  // some pages include card-back element indicating status
  const back = el.querySelector('.card-back');
  if (back) {
    const backCls = (back.getAttribute('class') || '').toLowerCase();
    if (backCls.includes('innocent')) status = 'INNOCENT';
    if (backCls.includes('criminal')) status = 'CRIMINAL';
  }

  return { id: idx, name, profession, status, pos };
}

function buildBoardSnapshotFromDOM(): BoardSnapshot {
  const cardEls = findCardElements();
  const parsed: any[] = [];
  // assume DOM order corresponds to board order; assign ids 0..19
  for (let i = 0; i < Math.min(cardEls.length, 20); i++) {
    const el = cardEls[i];
    parsed.push(parseCard(el, i));
  }
  // pad to 20 items using default board
  if (parsed.length < 20) {
    const fallback = buildDefaultBoard();
    for (let i = 0; i < 20; i++) {
      if (!parsed[i]) parsed[i] = fallback[i];
    }
  }

  // ensure statuses are valid strings
  const cells = parsed.map((p, i) => ({ id: i, name: p.name || `P${i+1}`, profession: p.profession || '', status: p.status || "UNKNOWN", pos: p.pos || undefined })) as any[];
  const clues = findClueStrings();
  return { cells, clues } as BoardSnapshot;
}

// UI overlay helpers
const OVERLAY_ID = "cluesbysam-solver-overlay";
const RULES_PANEL_ID = "cluesbysam-rules-panel";

// Load disabled rules and custom rules from localStorage
function getDisabledRules(): Set<string> {
  const stored = localStorage.getItem('cluesbysam_disabled_rules');
  return stored ? new Set(JSON.parse(stored)) : new Set();
}

function saveDisabledRules(disabled: Set<string>) {
  localStorage.setItem('cluesbysam_disabled_rules', JSON.stringify([...disabled]));
}

// Session-only custom DSL rules (not persisted to localStorage)
let sessionCustomRules: Array<{ dsl: string }> = [];

// ============================================================================
// UI COMPONENTS - Clean React-like component pattern
// ============================================================================

interface UIState {
  snapshot: BoardSnapshot;
  disabledClues: Set<string>;
  suggestion: any;
}

// Get current application state
function getUIState(): UIState {
  try {
    const snapshot = buildBoardSnapshotFromDOM();
    debugLog(`CluesBySam Solver: snapshot has ${snapshot.cells.length} cells, ${snapshot.clues.length} clues`);
    
    const disabledClues = new Set<string>();
    try {
      const stored = localStorage.getItem('cluesbysam_disabled_clues');
      if (stored) JSON.parse(stored).forEach((c: string) => disabledClues.add(c));
    } catch {}
    
    const activeClues = snapshot.clues.filter(c => {
      const clueText = typeof c === 'string' ? c : c.text;
      return !disabledClues.has(clueText);
    });
    const allClues = [...activeClues, ...sessionCustomRules.map(r => r.dsl)];
    const activeSnapshot = { ...snapshot, clues: allClues };
    
    debugLog(`CluesBySam Solver: running solver with ${allClues.length} active clues...`);
    const suggestion = solve(activeSnapshot as any);
    debugLog(`CluesBySam Solver: solver found ${suggestion.numSolutions} solutions, ${suggestion.forced.length} forced cells`);
    
    return { snapshot, disabledClues, suggestion };
  } catch (error) {
    console.error('CluesBySam Solver: ERROR in getUIState:', error);
    // Return safe default state
    return {
      snapshot: { cells: [], clues: [] } as any,
      disabledClues: new Set(),
      suggestion: { numSolutions: 0, forced: [], solutions: [] }
    };
  }
}

// Main UI Manager - single source of truth for all UI
class SolverUI {
  private overlay: HTMLElement | null = null;
  private statsPanel: HTMLElement | null = null;
  private rulesPanel: HTMLElement | null = null;
  
  constructor() {}
  
  // Update all UI components
  update() {
    try {
      debugLog('CluesBySam Solver: update() called');
      const state = getUIState();
      this.updateOverlay(state);
      this.updateStatsPanel(state);
      this.updateRulesPanel(state);
      this.highlightCells(state);
      debugLog('CluesBySam Solver: update() completed successfully');
    } catch (error) {
      console.error('CluesBySam Solver: ERROR in update():', error);
    }
  }
  
  private updateOverlay(state: UIState) {
    if (!this.overlay) {
      this.overlay = document.createElement('div');
      this.overlay.id = OVERLAY_ID;
      Object.assign(this.overlay.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: '999999',
        display: 'flex',
        gap: '8px'
      });
      document.body.appendChild(this.overlay);
      debugLog('CluesBySam Solver: created overlay');
    }
    
    // Create or update buttons
    let statsBtn = this.overlay.querySelector('.stats-btn') as HTMLButtonElement;
    let rulesBtn = this.overlay.querySelector('.rules-btn') as HTMLButtonElement;
    
    if (!statsBtn) {
      statsBtn = document.createElement('button');
      statsBtn.className = 'solver-btn stats-btn';
      statsBtn.style.cssText = 'padding:8px 12px;background:#4fc3f7;color:#000;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);';
      statsBtn.addEventListener('click', () => this.toggleStatsPanel());
      statsBtn.addEventListener('mouseenter', (e) => (e.target as HTMLElement).style.opacity = '0.9');
      statsBtn.addEventListener('mouseleave', (e) => (e.target as HTMLElement).style.opacity = '1');
      this.overlay.appendChild(statsBtn);
      debugLog('CluesBySam Solver: created stats button');
    }
    
    if (!rulesBtn) {
      rulesBtn = document.createElement('button');
      rulesBtn.className = 'solver-btn rules-btn';
      rulesBtn.style.cssText = 'padding:8px 12px;background:#ffd43b;color:#000;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);';
      rulesBtn.addEventListener('click', () => this.toggleRulesPanel());
      rulesBtn.addEventListener('mouseenter', (e) => (e.target as HTMLElement).style.opacity = '0.9');
      rulesBtn.addEventListener('mouseleave', (e) => (e.target as HTMLElement).style.opacity = '1');
      this.overlay.appendChild(rulesBtn);
      debugLog('CluesBySam Solver: created rules button');
    }
    
    // Update button text content only
    statsBtn.textContent = `📊 ${state.suggestion.numSolutions}/${state.suggestion.forced.length}`;
    rulesBtn.textContent = '⚙️ Rules';
  }
  
  private toggleStatsPanel() {
    debugLog('CluesBySam Solver: toggleStatsPanel called');
    if (this.statsPanel) {
      this.statsPanel.remove();
      this.statsPanel = null;
      debugLog('CluesBySam Solver: stats panel closed');
    } else {
      this.createStatsPanel();
      // Update only the stats panel content after creation
      const state = getUIState();
      this.updateStatsPanel(state);
      debugLog('CluesBySam Solver: stats panel opened');
    }
  }
  
  private createStatsPanel() {
    this.statsPanel = document.createElement('div');
    this.statsPanel.id = 'solver-stats-panel';
    Object.assign(this.statsPanel.style, {
      position: 'fixed',
      bottom: '60px',
      right: '12px',
      zIndex: '1000000',
      background: '#1e1e1e',
      color: '#e0e0e0',
      padding: '16px',
      borderRadius: '8px',
      width: '400px',
      maxHeight: '600px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px'
    });
    
    const header = this.createPanelHeader('📊 Stats', () => this.toggleStatsPanel());
    this.statsPanel.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'stats-content';
    content.style.cssText = 'margin-top:12px;max-height:500px;overflow-y:auto;';
    this.statsPanel.appendChild(content);
    
    document.body.appendChild(this.statsPanel);
    this.makeDraggable(this.statsPanel, header);
  }
  
  private updateStatsPanel(state: UIState) {
    if (!this.statsPanel) return;
    
    const content = this.statsPanel.querySelector('.stats-content');
    if (!content) {
      console.warn('CluesBySam Solver: stats panel exists but content element not found');
      return;
    }
    
    content.innerHTML = `
      <div style="margin-bottom:16px;padding:12px;background:#2a2a2a;border-radius:6px;border-left:3px solid #4fc3f7;">
        <div style="font-weight:bold;color:#4fc3f7;margin-bottom:8px;">Solver Results</div>
        <div style="color:#aaa;line-height:1.8;">
          <div>Solutions: <span style="color:#51cf66;font-weight:bold;">${state.suggestion.numSolutions}</span></div>
          <div>Forced: <span style="color:#ffd43b;font-weight:bold;">${state.suggestion.forced.length}</span></div>
        </div>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#2a2a2a;border-radius:6px;border-left:3px solid #ffd43b;">
        <div style="font-weight:bold;color:#ffd43b;margin-bottom:8px;">Clues (${state.snapshot.clues.length})</div>
        <div style="color:#aaa;font-size:11px;max-height:120px;overflow-y:auto;line-height:1.6;">
          ${state.snapshot.clues.length ? state.snapshot.clues.map((c, i) => `${i+1}. ${typeof c === 'string' ? c : c.text}`).join('<br>') : '(no clues)'}
        </div>
      </div>
      <div style="padding:12px;background:#2a2a2a;border-radius:6px;border-left:3px solid #51cf66;">
        <div style="font-weight:bold;color:#51cf66;margin-bottom:8px;">Cell Status</div>
        <div style="color:#aaa;font-size:11px;max-height:120px;overflow-y:auto;font-family:monospace;line-height:1.6;">
          ${state.snapshot.cells.map(c => `${c.pos || '?'} ${c.name}: ${c.status}`).join('<br>')}
        </div>
      </div>
    `;
  }
  
  private toggleRulesPanel() {
    debugLog('CluesBySam Solver: toggleRulesPanel called');
    if (this.rulesPanel) {
      this.rulesPanel.remove();
      this.rulesPanel = null;
      debugLog('CluesBySam Solver: rules panel closed');
    } else {
      this.createRulesPanel();
      // Update only the rules panel content after creation
      const state = getUIState();
      this.updateRulesPanel(state);
      debugLog('CluesBySam Solver: rules panel opened');
    }
  }
  
  private createRulesPanel() {
    this.rulesPanel = document.createElement('div');
    this.rulesPanel.id = 'solver-rules-panel';
    
    // Load saved position
    let pos = { top: 50, left: window.innerWidth - 650 };
    try {
      const saved = localStorage.getItem('solver_rules_position');
      if (saved) pos = JSON.parse(saved);
    } catch {}
    
    Object.assign(this.rulesPanel.style, {
      position: 'fixed',
      top: pos.top + 'px',
      left: pos.left + 'px',
      zIndex: '1000000',
      background: '#1e1e1e',
      color: '#e0e0e0',
      padding: '16px',
      borderRadius: '8px',
      width: '600px',
      height: '700px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      resize: 'both',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    });
    
    const header = this.createPanelHeader('⚙️ Rules Manager', () => this.toggleRulesPanel());
    this.rulesPanel.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'rules-content';
    content.style.cssText = 'margin-top:12px;flex:1;overflow-y:auto;pointer-events:auto;';
    this.rulesPanel.appendChild(content);
    
    document.body.appendChild(this.rulesPanel);
    
    // Debug: Log all clicks in the panel
    this.rulesPanel.addEventListener('click', (e) => {
      debugLog(`CluesBySam Solver: Click in rules panel - target: ${(e.target as HTMLElement).tagName}, className: ${(e.target as HTMLElement).className}`);
    }, true); // Use capture phase
    
    this.makeDraggable(this.rulesPanel, header, () => {
      try {
        localStorage.setItem('solver_rules_position', JSON.stringify({
          top: this.rulesPanel!.offsetTop,
          left: this.rulesPanel!.offsetLeft
        }));
      } catch {}
    });
  }
  
  private updateRulesPanel(state: UIState) {
    if (!this.rulesPanel) return;
    
    const content = this.rulesPanel.querySelector('.rules-content');
    if (!content) {
      console.warn('CluesBySam Solver: rules panel exists but content element not found');
      return;
    }
    
    content.innerHTML = '';
    this.renderCluesList(content as HTMLElement, state);
    this.renderCustomRulesForm(content as HTMLElement, state);
  }
  
  private renderCluesList(container: HTMLElement, state: UIState) {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';
    
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:bold;color:#4fc3f7;margin-bottom:12px;font-size:14px;';
    heading.textContent = `📋 Clues (${state.snapshot.clues.length})`;
    section.appendChild(heading);
    
    if (state.snapshot.clues.length === 0) {
      section.innerHTML += '<div style="color:#888;font-style:italic;padding:8px;">No clues found</div>';
      container.appendChild(section);
      return;
    }
    
    state.snapshot.clues.forEach((clueInput, idx) => {
      const clue = typeof clueInput === 'string' ? clueInput : clueInput.text;
      const speaker = typeof clueInput === 'string' ? undefined : clueInput.speaker;
      const isDisabled = state.disabledClues.has(clue);
      
      const clueDiv = document.createElement('div');
      clueDiv.style.cssText = `margin-bottom:12px;padding:10px;background:${isDisabled ? '#1a1a1a' : '#2a2a2a'};border-radius:6px;border-left:3px solid ${isDisabled ? '#555' : '#4fc3f7'};`;
      
      const clueHeader = document.createElement('div');
      clueHeader.style.cssText = 'display:flex;align-items:center;gap:8px;';
      
      const toggle = document.createElement('button');
      toggle.textContent = isDisabled ? '☐' : '☑';
      toggle.style.cssText = `width:24px;height:24px;padding:0;background:${isDisabled ? '#555' : '#51cf66'};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;pointer-events:auto;`;
      toggle.setAttribute('type', 'button');
      toggle.setAttribute('aria-label', `Toggle clue ${idx + 1}`);
      
      // Use addEventListener instead of onclick for better reliability
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
          debugLog(`CluesBySam Solver: CLICK EVENT on toggle button for clue #${idx + 1}`);
          
          // Reload current disabled clues from localStorage
          const stored = localStorage.getItem('cluesbysam_disabled_clues');
          const disabledSet = new Set<string>(stored ? JSON.parse(stored) : []);
          
          const wasDisabled = disabledSet.has(clue);
          debugLog(`CluesBySam Solver: toggle clicked for "${clue.substring(0, 30)}...", currently disabled: ${wasDisabled}`);
          
          if (disabledSet.has(clue)) {
            disabledSet.delete(clue);
            debugLog(`CluesBySam Solver: ENABLED clue "${clue.substring(0, 30)}..."`);
          } else {
            disabledSet.add(clue);
            debugLog(`CluesBySam Solver: DISABLED clue "${clue.substring(0, 30)}..."`);
          }
          
          const disabledArray = [...disabledSet];
          localStorage.setItem('cluesbysam_disabled_clues', JSON.stringify(disabledArray));
          debugLog(`CluesBySam Solver: saved to localStorage: ${disabledArray.length} disabled clue(s)`);
          
          this.update();
          debugLog(`CluesBySam Solver: update() called after toggle`);
        } catch (error) {
          console.error('CluesBySam Solver: error toggling clue:', error);
        }
      });
      
      clueHeader.appendChild(toggle);
      
      const clueLabel = document.createElement('div');
      clueLabel.style.cssText = `flex:1;color:${isDisabled ? '#888' : '#fff'};font-weight:${isDisabled ? 'normal' : 'bold'};`;
      clueLabel.textContent = speaker ? `#${idx+1} [${speaker}]: ${clue}` : `#${idx+1}: ${clue}`;
      clueHeader.appendChild(clueLabel);
      
      clueDiv.appendChild(clueHeader);
      
      // Show translation status with expandable constraints
      try {
        const translation = getClueTranslation(clueInput, state.snapshot);
        if (translation.constraints.length > 0) {
          const constraintSection = document.createElement('div');
          constraintSection.style.cssText = 'margin-top:6px;margin-left:32px;';
          constraintSection.setAttribute('data-solver-ui', 'true'); // Mark as our UI
          
          // Create expandable header
          const header = document.createElement('div');
          header.style.cssText = 'font-size:11px;color:#51cf66;cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px;';
          header.setAttribute('data-solver-ui', 'true'); // Mark as our UI
          
          const arrow = document.createElement('span');
          arrow.textContent = '▶';
          arrow.style.cssText = 'font-size:9px;transition:transform 0.2s;display:inline-block;';
          header.appendChild(arrow);
          
          const text = document.createElement('span');
          text.textContent = `✓ ${translation.constraints.length} constraint${translation.constraints.length > 1 ? 's' : ''}`;
          header.appendChild(text);
          
          // Create details container (hidden by default) and pre-populate it
          const details = document.createElement('div');
          details.style.cssText = 'display:none;margin-top:4px;padding:6px;background:#1a1a1a;border-radius:3px;font-family:monospace;font-size:10px;color:#90ee90;max-height:150px;overflow-y:auto;';
          
          // Pre-populate details content
          if (translation.dsl) {
            const dslDiv = document.createElement('div');
            dslDiv.style.cssText = 'margin-bottom:4px;color:#4fc3f7;';
            dslDiv.textContent = `DSL: ${translation.dsl}`;
            details.appendChild(dslDiv);
          }
          
          translation.constraints.forEach((c, i) => {
            const constraintDiv = document.createElement('div');
            constraintDiv.style.cssText = 'margin:2px 0;padding:2px;';
            constraintDiv.textContent = `${i + 1}. ${JSON.stringify(c)}`;
            details.appendChild(constraintDiv);
          });
          
          // Toggle visibility only (no DOM manipulation)
          let isExpanded = false;
          let clickTimeout: number | null = null;
          header.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Debounce clicks to prevent double-triggering
            if (clickTimeout !== null) {
              return;
            }
            
            // Temporarily disconnect observer to prevent interference
            const wasObserving = observer !== null;
            if (wasObserving && observer) {
              observer.disconnect();
            }
            
            isExpanded = !isExpanded;
            arrow.style.transform = isExpanded ? 'rotate(90deg)' : '';
            details.style.display = isExpanded ? 'block' : 'none';
            
            // Set debounce timeout
            clickTimeout = window.setTimeout(() => {
              clickTimeout = null;
            }, 300);
            
            // Re-attach observer after a short delay
            if (wasObserving) {
              setTimeout(() => {
                if (observer) {
                  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
                }
              }, 50);
            }
          };
          
          constraintSection.appendChild(header);
          constraintSection.appendChild(details);
          clueDiv.appendChild(constraintSection);
        }
      } catch {}
      
      section.appendChild(clueDiv);
    });
    
    container.appendChild(section);
  }
  
  private renderCustomRulesForm(container: HTMLElement, state: UIState) {
    const section = document.createElement('div');
    section.style.cssText = 'border-top:2px solid #333;padding-top:16px;';
    
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:bold;color:#ffd43b;margin-bottom:12px;font-size:14px;';
    heading.textContent = '➕ Custom Rules';
    section.appendChild(heading);
    
    const form = document.createElement('div');
    form.style.cssText = 'margin-bottom:16px;padding:12px;background:#2a2a2a;border-radius:6px;';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'custom-rule-input';
    input.name = 'custom-rule';
    input.autocomplete = 'off';
    input.placeholder = 'e.g., eq(3, neighbor(alice)@innocent)';
    input.style.cssText = 'width:100%;padding:8px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;font-family:monospace;font-size:12px;margin-bottom:8px;box-sizing:border-box;';
    form.appendChild(input);
    
    const addBtn = document.createElement('button');
    addBtn.textContent = '➕ Add Rule';
    addBtn.style.cssText = 'padding:8px 16px;background:#4fc3f7;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;';
    addBtn.onclick = () => {
      const dsl = input.value.trim();
      if (!dsl) {
        alert('⚠️ Please enter a DSL expression');
        return;
      }
      
      // Validate that the rule compiles properly
      try {
        compileDsl(dsl, state.snapshot);
        // Rule compiles successfully - add it as enabled (not in disabled list)
        sessionCustomRules.push({ dsl });
        input.value = '';
        debugLog(`CluesBySam Solver: Added custom rule (enabled): "${dsl}"`);
        this.update();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        alert(`❌ Invalid DSL rule:\n\n${errorMsg}\n\nPlease fix the syntax and try again.`);
        debugLog(`CluesBySam Solver: Failed to add custom rule: ${errorMsg}`);
      }
    };
    form.appendChild(addBtn);
    
    section.appendChild(form);
    
    // List existing rules
    if (sessionCustomRules.length > 0) {
      const rulesList = document.createElement('div');
      rulesList.style.cssText = 'margin-top:12px;';
      
      const rulesHeading = document.createElement('div');
      rulesHeading.style.cssText = 'font-size:12px;color:#aaa;margin-bottom:8px;';
      rulesHeading.textContent = `Session Rules (${sessionCustomRules.length})`;
      rulesList.appendChild(rulesHeading);
      
      sessionCustomRules.forEach((rule, idx) => {
        const ruleDiv = document.createElement('div');
        ruleDiv.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:#2a2a2a;border-radius:4px;';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✕';
        deleteBtn.style.cssText = 'width:20px;height:20px;padding:0;background:#c92a2a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;';
        deleteBtn.onclick = () => {
          sessionCustomRules.splice(idx, 1);
          this.update();
        };
        ruleDiv.appendChild(deleteBtn);
        
        const ruleText = document.createElement('div');
        ruleText.style.cssText = 'flex:1;color:#90ee90;font-family:monospace;font-size:11px;';
        ruleText.textContent = rule.dsl;
        ruleDiv.appendChild(ruleText);
        
        rulesList.appendChild(ruleDiv);
      });
      
      section.appendChild(rulesList);
    }
    
    container.appendChild(section);
  }
  
  private createPanelHeader(title: string, onClose: () => void): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;padding:4px;margin:-4px -4px 0 -4px;';
    
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight:bold;color:#4fc3f7;font-size:15px;';
    titleEl.textContent = title;
    header.appendChild(titleEl);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'width:24px;height:24px;padding:0;background:#c92a2a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';
    closeBtn.onclick = onClose;
    header.appendChild(closeBtn);
    
    return header;
  }
  
  private makeDraggable(panel: HTMLElement, handle: HTMLElement, onDragEnd?: () => void) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    handle.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      isDragging = true;
      offsetX = e.clientX - panel.offsetLeft;
      offsetY = e.clientY - panel.offsetTop;
      handle.style.background = 'rgba(255,255,255,0.05)';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - offsetX) + 'px';
      panel.style.top = (e.clientY - offsetY) + 'px';
      panel.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.style.background = '';
        if (onDragEnd) onDragEnd();
      }
    });
  }
  
  private highlightCells(state: UIState) {
    const cardEls = findCardElements();
    
    // Clear all highlights
    for (let i = 0; i < cardEls.length && i < 20; i++) {
      const el = cardEls[i] as HTMLElement;
      if (el) {
        el.style.outline = '';
        el.style.boxShadow = '';
      }
    }
    
    // Highlight forced cells
    for (const f of state.suggestion.forced) {
      const el = cardEls[f.id] as HTMLElement;
      if (el) {
        if (f.status === 'CRIMINAL') {
          el.style.outline = '3px solid rgba(220,50,50,0.9)';
          el.style.boxShadow = '0 0 8px rgba(220,50,50,0.35)';
        } else {
          el.style.outline = '3px solid rgba(50,180,90,0.9)';
          el.style.boxShadow = '0 0 8px rgba(50,180,90,0.35)';
        }
      }
    }
  }
}

// Global UI instance
const solverUI = new SolverUI();

let lastSnapshotJson = "";
let observer: MutationObserver | null = null;
let prevClues: Array<string | ClueWithSpeaker> = [];
let prevStatuses: Record<string,string> = {};

// Main update function
function updateEverything() {
  solverUI.update();
}

let updateTimeout: number | null = null;

function runSolveAndUpdateUI() {
  updateEverything();
}

function attachObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    // Ignore mutations in our own UI elements
    const relevantMutation = mutations.some(m => {
      const target = m.target as HTMLElement;
      // Ignore if mutation is in our UI (check data attribute or parent elements)
      if (target.hasAttribute?.('data-solver-ui') ||
          target.closest?.('[data-solver-ui]') ||
          target.id === OVERLAY_ID || 
          target.id === 'solver-stats-panel' || 
          target.id === 'solver-rules-panel' ||
          target.closest('#' + OVERLAY_ID) ||
          target.closest('#solver-stats-panel') ||
          target.closest('#solver-rules-panel')) {
        return false;
      }
      return true;
    });
    
    if (!relevantMutation) {
      debugLog('CluesBySam Solver: Ignored mutation in own UI');
      return;
    }
    
    // Debounce updates to prevent rapid fire
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    updateTimeout = window.setTimeout(() => {
      debugLog('CluesBySam Solver: MutationObserver triggered update');
      runSolveAndUpdateUI();
      updateTimeout = null;
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
}

function init() {
  try {
    debugLog("CluesBySam Solver content script started (DOM integration)");
    updateEverything();
    attachObserver();
    // Add keyboard shortcut to toggle overlay visibility: Ctrl+Shift+Y
    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyY') {
        const ov = document.getElementById(OVERLAY_ID) as HTMLElement | null;
        if (!ov) return;
        ov.style.display = (ov.style.display === 'none') ? 'block' : 'none';
        debugLog('CluesBySam Solver: toggled overlay visibility ->', ov.style.display);
      }
    });
    debugLog("CluesBySam Solver initialization complete");
  } catch (error) {
    console.error('CluesBySam Solver: FATAL ERROR during initialization:', error);
  }
}

// Run on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
