import { buildDefaultBoard } from "./board";
import { solve, compileClues } from "./solver";
import { BoardSnapshot, CellId } from "./types";

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

function findClueStrings(): string[] {
  debugLog("CluesBySam Solver: searching for clue strings...");
  // Prefer explicit hint elements found on card-backs
  const hints: string[] = [];
  const backHints = document.querySelectorAll('.card-back .hint, .card .hint');
  backHints.forEach(h => {
    const t = textOf(h as Element);
    if (t) hints.push(t);
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
      if (texts.length > 0) return texts;
    }
  }

  const nodes = Array.from(document.querySelectorAll("p, div, li")) as Element[];
  const clues: string[] = [];
  for (const n of nodes) {
    const t = textOf(n);
    if (/innocent|criminal|connected|neighbors?|row|column|only one|exactly|odd number/i.test(t) && t.length < 240 && t.length > 8) clues.push(t);
  }
  debugLog(`CluesBySam Solver: fallback found ${clues.length} candidate clue nodes`);
  return clues.slice(0, 50);
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

function getCustomRules(): Array<{ clue: string; dsl: string; enabled: boolean }> {
  const stored = localStorage.getItem('cluesbysam_custom_rules');
  return stored ? JSON.parse(stored) : [];
}

function saveCustomRules(rules: Array<{ clue: string; dsl: string; enabled: boolean }>) {
  localStorage.setItem('cluesbysam_custom_rules', JSON.stringify(rules));
}

function ensureOverlay(): HTMLDivElement {
  let ov = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!ov) {
    ov = document.createElement("div");
    ov.id = OVERLAY_ID;
    ov.style.position = "fixed";
    ov.style.right = "12px";
    ov.style.bottom = "12px";
    ov.style.zIndex = "999999";
    ov.style.background = "rgba(0,0,0,0.7)";
    ov.style.color = "white";
    ov.style.padding = "8px 10px";
    ov.style.borderRadius = "8px";
    ov.style.minWidth = "220px";
    ov.style.minHeight = "40px";
    ov.style.border = "2px solid rgba(255,255,255,0.08)";
    ov.style.pointerEvents = "auto";
    ov.style.fontFamily = "sans-serif";
    ov.style.fontSize = "13px";
    document.body.appendChild(ov);
    
    // Add "Rules" button
    const rulesBtn = document.createElement("button");
    rulesBtn.textContent = "⚙ Rules";
    rulesBtn.style.cssText = "margin-top:8px;padding:4px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;font-size:12px;";
    rulesBtn.onclick = () => toggleRulesPanel();
    ov.appendChild(rulesBtn);
    
    debugLog('CluesBySam Solver: overlay created');
  }
  return ov;
}

function toggleRulesPanel() {
  let panel = document.getElementById(RULES_PANEL_ID) as HTMLDivElement | null;
  if (panel) {
    panel.remove();
    return;
  }
  
  panel = document.createElement("div");
  panel.id = RULES_PANEL_ID;
  panel.style.cssText = `
    position: fixed;
    top: 50px;
    right: 20px;
    z-index: 1000000;
    background: #1e1e1e;
    color: #e0e0e0;
    padding: 20px;
    border-radius: 8px;
    width: 600px;
    height: 700px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    font-family: monospace;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    resize: both;
    overflow: hidden;
  `;
  
  // Header with title and close button
  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-shrink:0;";
  
  const title = document.createElement("h3");
  title.textContent = "⚙ Clue Rules Manager";
  title.style.cssText = "margin:0;color:#4fc3f7;font-size:16px;";
  header.appendChild(title);
  
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:#c00;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;";
  closeBtn.onclick = () => panel?.remove();
  header.appendChild(closeBtn);
  
  panel.appendChild(header);
  
  // Scrollable content area
  const content = document.createElement("div");
  content.style.cssText = "flex:1;overflow-y:auto;overflow-x:hidden;";
  
  // Show current clues with translations
  const snapshot = buildBoardSnapshotFromDOM();
  renderClueTranslations(content, snapshot);
  
  // Add custom rule form
  renderCustomRuleForm(content);
  
  panel.appendChild(content);
  document.body.appendChild(panel);
}

function renderClueTranslations(container: HTMLElement, snapshot: BoardSnapshot) {
  const section = document.createElement("div");
  section.style.marginBottom = "24px";
  
  const heading = document.createElement("h4");
  heading.textContent = "📋 Puzzle Clues";
  heading.style.cssText = "margin:0 0 4px 0;color:#4fc3f7;font-size:14px;";
  section.appendChild(heading);
  
  const desc = document.createElement("p");
  desc.textContent = "Click checkbox to enable/disable clues. Disabled clues are grayed out and excluded from solver.";
  desc.style.cssText = "margin:0 0 12px 0;color:#999;font-size:11px;";
  section.appendChild(desc);
  
  if (snapshot.clues.length === 0) {
    const noClues = document.createElement("div");
    noClues.textContent = "No clues found on this page";
    noClues.style.cssText = "color:#888;font-style:italic;padding:8px;";
    section.appendChild(noClues);
    container.appendChild(section);
    return;
  }
  
  // Load disabled clues from localStorage
  let disabledClues: Set<string>;
  try {
    const stored = localStorage.getItem('cluesbysam_disabled_clues');
    disabledClues = stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    disabledClues = new Set();
  }
  
  snapshot.clues.forEach((clue, idx) => {
    const isDisabled = disabledClues.has(clue);
    const clueDiv = document.createElement("div");
    clueDiv.style.cssText = `margin-bottom:14px;padding:10px;background:${isDisabled ? '#1a1a1a' : '#2a2a2a'};border-radius:4px;border-left:4px solid ${isDisabled ? '#555' : '#4fc3f7'};transition:all 0.2s;`;
    
    const headerRow = document.createElement("div");
    headerRow.style.cssText = "display:flex;align-items:center;margin-bottom:6px;";
    
    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = isDisabled ? "☐ OFF" : "☑ ON";
    toggleBtn.style.cssText = `padding:4px 8px;margin-right:10px;background:${isDisabled ? '#666' : '#51cf66'};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;`;
    toggleBtn.title = isDisabled ? "Click to enable this clue" : "Click to disable this clue";
    toggleBtn.onclick = () => {
      if (isDisabled) {
        disabledClues.delete(clue);
      } else {
        disabledClues.add(clue);
      }
      localStorage.setItem('cluesbysam_disabled_clues', JSON.stringify([...disabledClues]));
      toggleRulesPanel();
      toggleRulesPanel();
    };
    headerRow.appendChild(toggleBtn);
    
    const clueText = document.createElement("span");
    clueText.textContent = `#${idx + 1}: ${clue}`;
    clueText.style.cssText = `font-weight:bold;color:${isDisabled ? '#888' : '#fff'};flex:1;`;
    headerRow.appendChild(clueText);
    
    clueDiv.appendChild(headerRow);
    
    try {
      const constraints = compileClues([clue], snapshot);
      const statusDiv = document.createElement("div");
      statusDiv.style.cssText = "margin-left:76px;margin-top:4px;";
      
      if (constraints.length === 0) {
        statusDiv.innerHTML = `<span style="color:#ff6b6b;font-weight:bold;">❌ NOT TRANSLATED</span> <span style="color:#999;font-size:10px;">(no matching pattern found)</span>`;
      } else {
        statusDiv.innerHTML = `<span style="color:#51cf66;font-weight:bold;">✓ ACTIVE</span> <span style="color:#aaa;font-size:10px;">(${constraints.length} constraint${constraints.length > 1 ? 's' : ''} generated)</span>`;
        
        const detailsDiv = document.createElement("div");
        detailsDiv.style.cssText = "margin-top:6px;padding:8px;background:#1a1a1a;border-radius:3px;font-size:10px;color:#aaa;font-family:monospace;white-space:pre-wrap;word-break:break-all;border:1px solid #333;";
        
        // Pretty-print constraints in human-readable format
        const constraintsSummary = constraints.map((c: any, i: number) => {
          const lines: string[] = [`Constraint ${i + 1}: ${c.kind}`];
          Object.entries(c).forEach(([key, value]: [string, any]) => {
            if (key !== 'kind') {
              if (typeof value === 'number') {
                lines.push(`  ${key}: ${value}`);
              } else if (key === 'op') {
                lines.push(`  ${key}: "${value}"`);
              } else {
                lines.push(`  ${key}: ${value}`);
              }
            }
          });
          return lines.join('\n');
        }).join('\n\n');
        
        detailsDiv.textContent = constraintsSummary;
        statusDiv.appendChild(detailsDiv);
      }
      
      clueDiv.appendChild(statusDiv);
    } catch (e) {
      const errorDiv = document.createElement("div");
      errorDiv.innerHTML = `<span style="color:#ff6b6b;font-weight:bold;">❌ ERROR:</span> <span style="color:#ff8888;">${e}</span>`;
      errorDiv.style.cssText = "margin-top:6px;margin-left:76px;font-size:11px;";
      clueDiv.appendChild(errorDiv);
    }
    
    section.appendChild(clueDiv);
  });
  
  container.appendChild(section);
}

function renderCustomRuleForm(container: HTMLElement) {
  const section = document.createElement("div");
  section.style.cssText = "border-top:2px solid #333;padding-top:20px;margin-top:20px;";
  
  const heading = document.createElement("h4");
  heading.textContent = "➕ Add Custom Rule";
  heading.style.cssText = "margin:0 0 4px 0;color:#ffd43b;font-size:14px;";
  section.appendChild(heading);
  
  const desc = document.createElement("p");
  desc.textContent = "Create custom clue→DSL mappings for patterns not supported by built-in rules.";
  desc.style.cssText = "margin:0 0 12px 0;color:#999;font-size:11px;line-height:1.4;";
  section.appendChild(desc);
  
  const form = document.createElement("div");
  form.style.cssText = "padding:14px;background:#2a2a2a;border-radius:6px;margin-bottom:16px;border:1px solid #444;";
  
  const clueLabel = document.createElement("label");
  clueLabel.textContent = "Clue Text:";
  clueLabel.style.cssText = "display:block;margin-bottom:4px;color:#ddd;font-size:11px;font-weight:bold;";
  form.appendChild(clueLabel);
  
  const clueInput = document.createElement("input");
  clueInput.type = "text";
  clueInput.placeholder = "e.g., Gary has exactly 3 innocent neighbors";
  clueInput.style.cssText = "width:100%;padding:8px;margin-bottom:12px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;font-size:12px;box-sizing:border-box;";
  form.appendChild(clueInput);
  
  const dslLabel = document.createElement("label");
  dslLabel.textContent = "DSL Expression:";
  dslLabel.style.cssText = "display:block;margin-bottom:4px;color:#ddd;font-size:11px;font-weight:bold;";
  form.appendChild(dslLabel);
  
  const dslInput = document.createElement("input");
  dslInput.type = "text";
  dslInput.placeholder = "e.g., eq(3, neighbor(gary)@innocent)";
  dslInput.style.cssText = "width:100%;padding:8px;margin-bottom:12px;background:#1a1a1a;color:#fff;border:1px solid #555;border-radius:4px;font-family:monospace;font-size:11px;box-sizing:border-box;";
  form.appendChild(dslInput);
  
  const addBtn = document.createElement("button");
  addBtn.textContent = "➕ Add Custom Rule";
  addBtn.style.cssText = "padding:8px 16px;background:#4fc3f7;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;";
  addBtn.onmouseover = () => addBtn.style.background = "#6dd5ff";
  addBtn.onmouseout = () => addBtn.style.background = "#4fc3f7";
  addBtn.onclick = () => {
    const clue = clueInput.value.trim();
    const dsl = dslInput.value.trim();
    if (!clue || !dsl) {
      alert("⚠️ Both clue text and DSL expression are required");
      return;
    }
    const customRules = getCustomRules();
    customRules.push({ clue, dsl, enabled: true });
    saveCustomRules(customRules);
    clueInput.value = "";
    dslInput.value = "";
    // Refresh the panel
    toggleRulesPanel();
    toggleRulesPanel();
  };
  form.appendChild(addBtn);
  
  section.appendChild(form);
  
  // List existing custom rules
  const customRules = getCustomRules();
  if (customRules.length > 0) {
    const listHeading = document.createElement("h5");
    listHeading.textContent = `📝 Your Custom Rules (${customRules.length})`;
    listHeading.style.cssText = "margin:20px 0 10px 0;color:#ffd43b;font-size:13px;";
    section.appendChild(listHeading);
    
    customRules.forEach((rule, idx) => {
      const ruleDiv = document.createElement("div");
      ruleDiv.style.cssText = `margin-bottom:10px;padding:10px;background:${rule.enabled ? '#2a2a2a' : '#1a1a1a'};border-radius:4px;border:1px solid ${rule.enabled ? '#444' : '#333'};display:flex;align-items:flex-start;gap:8px;`;
      
      const btnContainer = document.createElement("div");
      btnContainer.style.cssText = "display:flex;flex-direction:column;gap:4px;";
      
      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = rule.enabled ? "ON" : "OFF";
      toggleBtn.title = rule.enabled ? "Click to disable" : "Click to enable";
      toggleBtn.style.cssText = `padding:4px 8px;background:${rule.enabled ? '#51cf66' : '#666'};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;`;
      toggleBtn.onclick = () => {
        customRules[idx].enabled = !customRules[idx].enabled;
        saveCustomRules(customRules);
        toggleRulesPanel();
        toggleRulesPanel();
      };
      btnContainer.appendChild(toggleBtn);
      
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "DEL";
      deleteBtn.title = "Delete this custom rule";
      deleteBtn.style.cssText = "padding:4px 8px;background:#c92a2a;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;";
      deleteBtn.onclick = () => {
        if (confirm(`Delete custom rule?\n\n"${rule.clue}"`)) {
          customRules.splice(idx, 1);
          saveCustomRules(customRules);
          toggleRulesPanel();
          toggleRulesPanel();
        }
      };
      btnContainer.appendChild(deleteBtn);
      
      ruleDiv.appendChild(btnContainer);
      
      const textContainer = document.createElement("div");
      textContainer.style.cssText = "flex:1;";
      
      const clueText = document.createElement("div");
      clueText.textContent = `"${rule.clue}"`;
      clueText.style.cssText = `color:${rule.enabled ? '#fff' : '#888'};font-weight:bold;font-size:11px;margin-bottom:4px;`;
      textContainer.appendChild(clueText);
      
      const dslText = document.createElement("div");
      dslText.textContent = `→ ${rule.dsl}`;
      dslText.style.cssText = `color:${rule.enabled ? '#aaa' : '#666'};font-family:monospace;font-size:10px;`;
      textContainer.appendChild(dslText);
      
      ruleDiv.appendChild(textContainer);
      
      section.appendChild(ruleDiv);
    });
  }
  
  container.appendChild(section);
}

function highlightForcedCells(forced: Array<{ id: CellId; status: "INNOCENT" | "CRIMINAL" }>) {
  // clear previous highlights
  const cardEls = findCardElements();
  for (let i = 0; i < cardEls.length && i < 20; i++) {
    const el = cardEls[i] as HTMLElement;
    if (!el) continue;
    el.style.outline = "";
    el.style.boxShadow = "";
  }
  for (const f of forced) {
    const el = cardEls[f.id] as HTMLElement | undefined;
    if (!el) continue;
    if (f.status === "CRIMINAL") {
      el.style.outline = "3px solid rgba(220,50,50,0.9)";
      el.style.boxShadow = "0 0 8px rgba(220,50,50,0.35)";
    } else {
      el.style.outline = "3px solid rgba(50,180,90,0.9)";
      el.style.boxShadow = "0 0 8px rgba(50,180,90,0.35)";
    }
  }
}

let lastSnapshotJson = "";
let observer: MutationObserver | null = null;
let prevClues: string[] = [];
let prevStatuses: Record<string,string> = {};

function runSolveAndUpdateUI() {
  try {
    debugLog('CluesBySam Solver: runSolveAndUpdateUI called');
    const snapshot = buildBoardSnapshotFromDOM();
    debugLog('CluesBySam Solver: snapshot built', snapshot);
    const json = JSON.stringify({ cells: snapshot.cells.map(c => ({ id: c.id, status: c.status })), cluesCount: snapshot.clues.length });
    if (json === lastSnapshotJson) return; // no change
    lastSnapshotJson = json;
    // detect clue changes
    try {
      if (isDebugEnabled()) {
        for (let i = 0; i < snapshot.clues.length; i++) {
          const c = snapshot.clues[i];
          const ast = compileClues([c], snapshot);
          debugLog(`Clue[${i}]:`, c, '->', ast);
        }
      }
      // detect added/removed clues
      const added = snapshot.clues.filter(x => !prevClues.includes(x));
      const removed = prevClues.filter(x => !snapshot.clues.includes(x));
      if (added.length) infoLog('CluesBySam Solver: new clues added:', added);
      if (removed.length) infoLog('CluesBySam Solver: clues removed:', removed);
      prevClues = snapshot.clues.slice();
    } catch (e) {
      console.error('CluesBySam Solver: error compiling clues', e);
    }
    // detect status changes
    const statusChanges: string[] = [];
    for (const c of snapshot.cells) {
      const prev = prevStatuses[String(c.id)];
      if (prev !== undefined && prev !== c.status) statusChanges.push(`${c.pos || '?'} ${c.name}: ${prev} -> ${c.status}`);
      prevStatuses[String(c.id)] = c.status;
    }
    if (statusChanges.length) infoLog('CluesBySam Solver: status changes detected:', statusChanges);
    
    // Filter out disabled clues before solving
    let disabledClues: Set<string>;
    try {
      const stored = localStorage.getItem('cluesbysam_disabled_clues');
      disabledClues = stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      disabledClues = new Set();
    }
    const activeSnapshot = {
      ...snapshot,
      clues: snapshot.clues.filter(c => !disabledClues.has(c))
    };
    
    const suggestion = solve(activeSnapshot as any);
    debugLog("Solver suggestion:", suggestion);
    const ov = ensureOverlay();
    
    // Update stats section
    let statsDiv = ov.querySelector('.solver-stats') as HTMLDivElement | null;
    if (!statsDiv) {
      statsDiv = document.createElement('div');
      statsDiv.className = 'solver-stats';
      ov.insertBefore(statsDiv, ov.firstChild);
    }
    const lines: string[] = [];
    lines.push(`Solutions: ${suggestion.numSolutions}`);
    lines.push(`Forced: ${suggestion.forced.length}`);
    statsDiv.innerText = lines.join('\n');
    
    // attach expandable details
    let details = ov.querySelector('.solver-details') as HTMLDivElement | null;
    if (!details) {
      details = document.createElement('div');
      details.className = 'solver-details';
      details.style.marginTop = '8px';
      details.style.maxHeight = '240px';
      details.style.overflow = 'auto';
      details.style.fontSize = '12px';
      details.style.whiteSpace = 'pre-wrap';
      ov.appendChild(details);
    }
    const clueText = snapshot.clues.length ? snapshot.clues.join('\n') : '(no clues found)';
    // list known statuses
    const statusLines = snapshot.cells.map(c => `${c.pos || '?'} ${c.name}: ${c.status}`).join('\n');
    // compute newly discovered labels since last run
    const prev = window.localStorage.getItem('cluesbysam_prev_statuses');
    const prevMap: Record<string,string> = prev ? JSON.parse(prev) : {};
    const nowMap: Record<string,string> = {};
    const newLabels: string[] = [];
    for (const c of snapshot.cells) {
      nowMap[String(c.id)] = c.status;
      if (prevMap[String(c.id)] && prevMap[String(c.id)] !== c.status) newLabels.push(`${c.pos || '?'} ${c.name}: ${prevMap[String(c.id)]} → ${c.status}`);
    }
    window.localStorage.setItem('cluesbysam_prev_statuses', JSON.stringify(nowMap));

    details.innerText = `CLUES:\n${clueText}\n\nSTATUSES:\n${statusLines}\n\nNEW LABELS:\n${newLabels.length ? newLabels.join('\n') : '(none)'}\n`;

    highlightForcedCells(suggestion.forced as any);
  } catch (e) {
    console.error("Solver error:", e);
    if (isDebugEnabled()) {
      try {
        const snapshot = buildBoardSnapshotFromDOM();
        console.error("CluesBySam Solver: clues", snapshot.clues);
        console.error("CluesBySam Solver: statuses", snapshot.cells.map(c => ({ id: c.id, pos: c.pos, name: c.name, status: c.status })));
        console.error("CluesBySam Solver: board state summary");
        let crimCount = 0, innocCount = 0, unknownCount = 0;
        for (const c of snapshot.cells) {
          if (c.status === "CRIMINAL") crimCount++;
          else if (c.status === "INNOCENT") innocCount++;
          else unknownCount++;
        }
        console.error(`  Criminals: ${crimCount}, Innocents: ${innocCount}, Unknown: ${unknownCount}`);
        for (let i = 0; i < snapshot.clues.length; i++) {
          const c = snapshot.clues[i];
          const ast = compileClues([c], snapshot);
          console.error(`Clue[${i}] "${c}" constraints:`, JSON.stringify(ast, null, 2));
        }
      } catch (debugErr) {
        console.error("CluesBySam Solver: debug collection failed", debugErr);
      }
    }
  }
}

function attachObserver() {
  if (observer) return;
  observer = new MutationObserver((mutations) => {
    // small debounce using requestIdleCallback or timeout
    if ((window as any).requestIdleCallback) {
      (window as any).requestIdleCallback(() => runSolveAndUpdateUI());
    } else {
      setTimeout(runSolveAndUpdateUI, 120);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
}

function init() {
  debugLog("CluesBySam Solver content script started (DOM integration)");
  runSolveAndUpdateUI();
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
}

// Run on load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export {};
