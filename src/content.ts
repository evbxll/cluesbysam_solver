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
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000000;
    background: #1e1e1e;
    color: #e0e0e0;
    padding: 20px;
    border-radius: 8px;
    max-width: 800px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    font-family: monospace;
    font-size: 12px;
  `;
  
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "float:right;background:#c00;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;";
  closeBtn.onclick = () => panel?.remove();
  panel.appendChild(closeBtn);
  
  const title = document.createElement("h3");
  title.textContent = "Clue Translation & Rules";
  title.style.cssText = "margin:0 0 16px 0;color:#fff;";
  panel.appendChild(title);
  
  // Show current clues with translations
  const snapshot = buildBoardSnapshotFromDOM();
  renderClueTranslations(panel, snapshot);
  
  // Add custom rule form
  renderCustomRuleForm(panel);
  
  document.body.appendChild(panel);
}

function renderClueTranslations(container: HTMLElement, snapshot: BoardSnapshot) {
  const section = document.createElement("div");
  section.style.marginBottom = "20px";
  
  const heading = document.createElement("h4");
  heading.textContent = "Clues & Translations";
  heading.style.cssText = "margin:0 0 8px 0;color:#4fc3f7;";
  section.appendChild(heading);
  
  if (snapshot.clues.length === 0) {
    section.appendChild(document.createTextNode("No clues found"));
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
    clueDiv.style.cssText = `margin-bottom:12px;padding:8px;background:#2a2a2a;border-radius:4px;border-left:3px solid #555;opacity:${isDisabled ? '0.5' : '1'};`;
    
    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = isDisabled ? "☐" : "☑";
    toggleBtn.style.cssText = "padding:2px 6px;margin-right:8px;background:#666;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;";
    toggleBtn.title = isDisabled ? "Enable clue" : "Disable clue (grey out)";
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
    clueDiv.appendChild(toggleBtn);
    
    const clueText = document.createElement("span");
    clueText.textContent = `${idx + 1}. ${clue}`;
    clueText.style.cssText = "font-weight:bold;";
    clueDiv.appendChild(clueText);
    clueDiv.appendChild(document.createElement("br"));
    
    try {
      const constraints = compileClues([clue], snapshot);
      const dslDiv = document.createElement("div");
      dslDiv.style.cssText = "margin-top:4px;margin-left:22px;";
      
      if (constraints.length === 0) {
        dslDiv.textContent = "❌ NOT TRANSLATED (no matching pattern)";
        dslDiv.style.color = "#ff6b6b";
      } else {
        dslDiv.innerHTML = `<strong style="color:#51cf66;">✓ Constraints (${constraints.length}):</strong>`;
        
        const detailsDiv = document.createElement("div");
        detailsDiv.style.cssText = "margin-top:4px;padding:6px;background:#1a1a1a;border-radius:2px;font-size:11px;color:#aaa;font-family:monospace;white-space:pre-wrap;word-break:break-all;";
        
        // Pretty-print constraints in human-readable format
        const constraintsSummary = constraints.map((c: any, i: number) => {
          const lines: string[] = [`[${i}] ${c.kind}`];
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
        dslDiv.appendChild(detailsDiv);
      }
      
      clueDiv.appendChild(dslDiv);
    } catch (e) {
      const errorDiv = document.createElement("div");
      errorDiv.textContent = `❌ ERROR: ${e}`;
      errorDiv.style.cssText = "margin-top:4px;margin-left:22px;color:#ff6b6b;";
      clueDiv.appendChild(errorDiv);
    }
    
    section.appendChild(clueDiv);
  });
  
  container.appendChild(section);
}

function renderCustomRuleForm(container: HTMLElement) {
  const section = document.createElement("div");
  
  const heading = document.createElement("h4");
  heading.textContent = "Custom DSL Rules";
  heading.style.cssText = "margin:0 0 8px 0;color:#4fc3f7;";
  section.appendChild(heading);
  
  const desc = document.createElement("p");
  desc.textContent = "Add custom clue→DSL mappings for patterns not supported by default rules.";
  desc.style.cssText = "margin:0 0 12px 0;color:#999;font-size:11px;";
  section.appendChild(desc);
  
  const form = document.createElement("div");
  form.style.cssText = "padding:12px;background:#2a2a2a;border-radius:4px;margin-bottom:16px;";
  
  const clueInput = document.createElement("input");
  clueInput.type = "text";
  clueInput.placeholder = "Clue text (exact match)";
  clueInput.style.cssText = "width:100%;padding:6px;margin-bottom:8px;background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:4px;";
  form.appendChild(clueInput);
  
  const dslInput = document.createElement("input");
  dslInput.type = "text";
  dslInput.placeholder = "DSL expression (e.g., eq(3, neighbor(gary)@innocent))";
  dslInput.style.cssText = "width:100%;padding:6px;margin-bottom:8px;background:#1a1a1a;color:#fff;border:1px solid #444;border-radius:4px;";
  form.appendChild(dslInput);
  
  const addBtn = document.createElement("button");
  addBtn.textContent = "+ Add Rule";
  addBtn.style.cssText = "padding:6px 12px;background:#4fc3f7;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;";
  addBtn.onclick = () => {
    const clue = clueInput.value.trim();
    const dsl = dslInput.value.trim();
    if (!clue || !dsl) {
      alert("Both clue and DSL are required");
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
    listHeading.textContent = "Saved Custom Rules";
    listHeading.style.cssText = "margin:16px 0 8px 0;color:#ffd43b;";
    section.appendChild(listHeading);
    
    customRules.forEach((rule, idx) => {
      const ruleDiv = document.createElement("div");
      ruleDiv.style.cssText = `margin-bottom:8px;padding:8px;background:${rule.enabled ? '#2a2a2a' : '#1a1a1a'};border-radius:4px;opacity:${rule.enabled ? '1' : '0.5'};`;
      
      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = rule.enabled ? "✓" : "✗";
      toggleBtn.style.cssText = `padding:2px 6px;margin-right:8px;background:${rule.enabled ? '#51cf66' : '#666'};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;`;
      toggleBtn.onclick = () => {
        customRules[idx].enabled = !customRules[idx].enabled;
        saveCustomRules(customRules);
        toggleRulesPanel();
        toggleRulesPanel();
      };
      ruleDiv.appendChild(toggleBtn);
      
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑";
      deleteBtn.style.cssText = "padding:2px 6px;margin-right:8px;background:#c00;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;";
      deleteBtn.onclick = () => {
        if (confirm("Delete this custom rule?")) {
          customRules.splice(idx, 1);
          saveCustomRules(customRules);
          toggleRulesPanel();
          toggleRulesPanel();
        }
      };
      ruleDiv.appendChild(deleteBtn);
      
      const textSpan = document.createElement("span");
      textSpan.textContent = `"${rule.clue}" → ${rule.dsl}`;
      textSpan.style.cssText = "font-size:11px;";
      ruleDiv.appendChild(textSpan);
      
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
    const suggestion = solve(snapshot as any);
    debugLog("Solver suggestion:", suggestion);
    const ov = ensureOverlay();
    // Build overlay summary + details
    const lines: string[] = [];
    lines.push(`Solutions: ${suggestion.numSolutions}`);
    lines.push(`Forced: ${suggestion.forced.length}`);
    ov.innerText = lines.join('\n');
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
