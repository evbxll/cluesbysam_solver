import { BoardSnapshot } from "./types";
import { compileClues as compileDslClues } from "./parser_dsl";
import type { CType } from "./parser_dsl";
export type { CType } from "./parser_dsl";

type Template = {
  pattern: string;
  dsl: string;
};

const templates: Template[] = [
  // ============================================================================
  // COMPLEX DIRECTIONAL PATTERNS (checked first - most specific)
  // ============================================================================
  {
    pattern: "the only {role} {dir} {name} is {dir2} {name2}",
    dsl: "eq(1, {dir}({name})@{role}) + eq(1, ({dir}({name}) & {dir2}({name2}))@{role})",
  },

  // ============================================================================
  // BASIC PATTERNS: Name in group
  // ============================================================================
  {
    pattern: "{name} is one of {k} {role} in {rowcol} {rowcolval}",
    dsl: "eq({k}, area({rowcol}({rowcolval}))@{role}) + in_group({name}, area({rowcol}({rowcolval}))@{role})",
  },

  // ============================================================================
  // EXACT COUNT IN AREA
  // ============================================================================
  {
    pattern: "exactly {k} {role} in {rowcol} {rowcolval}",
    dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})",
  },
  {
    pattern: "there are {k} {role} on the edges",
    dsl: "eq({k}, area(edges)@{role})",
  },
  {
    pattern: "there are exactly {k} {role} in {rowcol} {rowcolval}",
    dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})",
  },
  {
    pattern: "there are exactly {k} {role} {dir} {name}",
    dsl: "eq({k}, {dir}({name})@{role})",
  },
  {
    pattern: "there is only one {role} in {rowcol} {rowcolval}",
    dsl: "eq(1, area({rowcol}({rowcolval}))@{role})",
  },
  {
    pattern: "there is only one {role} {dir} {name}",
    dsl: "eq(1, {dir}({name})@{role})",
  },
  {
    pattern: "each row has at least {k} {role}",
    dsl: "gte({k}, area(row(1))@{role}) + gte({k}, area(row(2))@{role}) + gte({k}, area(row(3))@{role}) + gte({k}, area(row(4))@{role}) + gte({k}, area(row(5))@{role})",
  },
  {
    pattern: "each column has at least {k} {role}",
    dsl: "gte({k}, area(col(A))@{role}) + gte({k}, area(col(B))@{role}) + gte({k}, area(col(C))@{role}) + gte({k}, area(col(D))@{role})",
  },

  // ============================================================================
  // NEIGHBOR COUNT
  // ============================================================================
  {
    pattern: "{name} has exactly {k} {role} neighbors",
    dsl: "eq({k}, neighbor({name})@{role})",
  },
  {
    pattern: "there's {parity} number of {role} neighboring {name}",
    dsl: "parity({parity}, neighbor({name})@{role})",
  },
  {
    pattern: "{name} has {parity} number of {role} neighbors",
    dsl: "parity({parity}, neighbor({name})@{role})",
  },

  // ============================================================================
  // NEIGHBORS IN AREA
  // ============================================================================
  {
    pattern: "exactly {k} of the {total} {role} neighboring {name} are in {rowcol} {rowcolval}",
    dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },

  // ============================================================================
  // AREA NEIGHBORS TARGET
  // ============================================================================
  {
    pattern: "exactly {k} {role} in {rowcol} {rowcolval} is neighboring {name}",
    dsl: "eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },
  {
    pattern: "the only {role} in {rowcol} {rowcolval} is {name}'s neighbor",
    dsl: "eq(1, area({rowcol}({rowcolval})@{role})) + in_group(area({rowcol}({rowcolval})@{role}), neighbor({name})@{role})",
  },

  // ============================================================================
  // PARITY IN AREA
  // ============================================================================
  {
    pattern: "{parity} number of {role} in {rowcol} {rowcolval}",
    dsl: "parity({parity}, area({rowcol}({rowcolval}))@{role})",
  },
  {
    pattern: "there's an {parity} number of {role} in {rowcol} {rowcolval}",
    dsl: "parity({parity}, area({rowcol}({rowcolval}))@{role})",
  },
  {
    pattern: "an {parity} number of {role} in {rowcol} {rowcolval} are {name}'s neighbors",
    dsl: "parity({parity}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },
  {
    pattern: "there's an {parity} number of {role} {dir} {name}",
    dsl: "parity({parity}, {dir}({name})@{role})",
  },
  {
    pattern: "an {parity} number of {role} {dir} {name}",
    dsl: "parity({parity}, {dir}({name})@{role})",
  },

  // ============================================================================
  // PARITY NEIGHBORS
  // ============================================================================
  {
    pattern: "there's an {parity} number of {role} neighboring {name}",
    dsl: "parity({parity}, neighbor({name})@{role})",
  },
  {
    pattern: "an {parity} number of {role} neighboring {name}",
    dsl: "parity({parity}, neighbor({name})@{role})",
  },
  {
    pattern: "{parity} number of {role} neighboring {name}",
    dsl: "parity({parity}, neighbor({name})@{role})",
  },

  // ============================================================================
  // PARITY IN DIRECTION & NEIGHBORS
  // ============================================================================
  {
    pattern: "an {parity} number of {role} {dir} {name} neighbor {name2}",
    dsl: "parity({parity}, ({dir}({name}) & neighbor({name2}))@{role})",
  },
  {
    pattern: "{parity} number of {role} {dir} {name} neighbor {name2}",
    dsl: "parity({parity}, ({dir}({name}) & neighbor({name2}))@{role})",
  },
  {
    pattern: "an {parity} number of {role} on the edges neighbor {name}",
    dsl: "parity({parity}, (area(edges) & neighbor({name}))@{role})",
  },

  // ============================================================================
  // NEIGHBORS IN DIRECTION
  // ============================================================================
  {
    pattern: "only {k} of the {total} {role} neighboring {name} {be} {dir} {name2}",
    dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, ({dir}({name2}) & neighbor({name}))@{role})",
  },
  {
    pattern: "only one of the {k} {role} neighboring {name} {be} {dir} {name2}",
    dsl: "eq({k}, neighbor({name})@{role}) + eq(1, ({dir}({name2}) & neighbor({name}))@{role})",
  },

  // ============================================================================
  // CONNECTED IN AREA (DIRECTIONAL)
  // ============================================================================
  {
    pattern: "both {role} {dir} {name} are connected",
    dsl: "eq(2, {dir}({name})@{role}) + connected({dir}({name})@{role})",
  },
  {
    pattern: "all {role} {dir} {name} are connected",
    dsl: "connected({dir}({name})@{role})",
  },
  {
    pattern: "all {role} in {rowcol} {rowcolval} are connected",
    dsl: "connected(area({rowcol}({rowcolval}))@{role})",
  },

  // ============================================================================
  // TOTAL COUNT
  // ============================================================================
  {
    pattern: "there are {k} {role} in total",
    dsl: "eq({k}, area(all)@{role})",
  },

  // ============================================================================
  // ROW/COLUMN PROPERTY CONSTRAINTS (e.g., "Only one row has exactly 3 criminals")
  // ============================================================================
  {
    pattern: "only {num} row has exactly {k} {role}",
    dsl: "unique_row_count_eq({num}, {k}, area(all)@{role})",
  },
  {
    pattern: "only {num} column has exactly {k} {role}",
    dsl: "SKIP", // Column version not yet needed
  },
  {
    pattern: "{rowcol} {rowcolval} is the only {rowcol2} with exactly {k} {role}",
    dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})",
  },

  // ============================================================================
  // NEIGHBORS IN COMMON
  // ============================================================================
  {
    pattern: "{name} is one of {name2}'s {k} {role} neighbors",
    dsl: "eq({k}, neighbor({name2})@{role}) + in_group({name}, neighbor({name2})@{role})",
  },
  {
    pattern: "{name} is one of {k} {role} {dir} {name2}",
    dsl: "eq({k}, {dir}({name2})@{role}) + in_group({name}, {dir}({name2})@{role})",
  },
  {
    pattern: "{name} and {name2} have {k} {role} neighbors in common",
    dsl: "eq({k}, (neighbor({name}) & neighbor({name2}))@{role})",
  },
  {
    pattern: "{name} and {name2} have no {role} neighbors in common",
    dsl: "eq(0, (neighbor({name}) & neighbor({name2}))@{role})",
  },

  // ============================================================================
  // EXACT COUNT WITH DIRECTIONAL NAME
  // ============================================================================
  {
    pattern: "{name} is one of {k} {role} {dir} {name2}",
    dsl: "eq({k}, {dir}({name2})@{role}) + in_group({name}, {dir}({name2})@{role})",
  },
  {
    pattern: "there are exactly {k} {role} {dir} {name}",
    dsl: "eq({k}, {dir}({name})@{role})",
  },
  {
    pattern: "there are exactly {k} {role} in between {name} and {name2}",
    dsl: "eq({k}, between({name}, {name2})@{role})",
  },

  // ============================================================================
  // "BETWEEN" PATTERNS
  // ============================================================================
  {
    pattern: "the only {role} in between {name} and {name2} is {name}'s neighbor",
    dsl: "eq(1, between({name}, {name2})@{role}) + in_group(between({name}, {name2})@{role}, neighbor({name})@{role})",
  },
  {
    pattern: "the only {role} in between {name} and {name2} is {name2}'s neighbor",
    dsl: "eq(1, between({name}, {name2})@{role}) + in_group(between({name}, {name2})@{role}, neighbor({name2})@{role})",
  },
  {
    pattern: "there's an {parity} number of {role} in between {name} and {name2}",
    dsl: "parity({parity}, between({name}, {name2})@{role})",
  },
  {
    pattern: "an {parity} number of {role} in between {name} and {name2}",
    dsl: "parity({parity}, between({name}, {name2})@{role})",
  },

  // ============================================================================
  // EXACTLY K OF TOTAL ON EDGES
  // ============================================================================
  {
    pattern: "exactly {k} of {name}'s {total} {role} neighbors also neighbor {name2}",
    dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & neighbor({name2}))@{role})",
  },
  {
    pattern: "exactly {k} of the {total} {role} on the edges are {name}'s neighbors",
    dsl: "eq({total}, area(edges)@{role}) + eq({k}, (area(edges) & neighbor({name}))@{role})",
  },
  {
    pattern: "{k} of {name}'s neighbors on the edges are {role}",
    dsl: "eq({k}, (neighbor({name}) & area(edges))@{role})",
  },

  // ============================================================================
  // "THERE ARE NO" PATTERNS
  // ============================================================================
  {
    pattern: "there are no {role} in {rowcol} {rowcolval} who neighbor {name}",
    dsl: "eq(0, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },

  // ============================================================================
  // NEIGHBOR PATTERNS WITH "ONLY X OF Y"
  // ============================================================================
  {
    pattern: "only {k} of the {total} {role} neighboring {name} is {name2}'s neighbor",
    dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & neighbor({name2}))@{role})",
  },
  {
    pattern: "only {k} of the {total} {role} in {rowcol} {rowcolval} are {name}'s neighbors",
    dsl: "eq({total}, area({rowcol}({rowcolval}))@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },
  {
    pattern: "only {k} of the {total} {role} in {rowcol} {rowcolval} is {name}'s neighbor",
    dsl: "eq({total}, area({rowcol}({rowcolval}))@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})",
  },
  {
    pattern: "only {k} of the {total} {role} neighboring {name} {be} in {rowcol} {rowcolval}",
    dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & area({rowcol}({rowcolval})))@{role})",
  },

  // ============================================================================
  // PROFESSION PATTERNS
  // ============================================================================
  {
    pattern: "{k} {profession}s have an {role} directly to the right of them",
    dsl: "SKIP", // Requires profession-based constraint system
  },
  {
    pattern: "exactly {k} of us {total} {profession}s has an {role} directly to the right of them",
    dsl: "SKIP", // Requires profession-based constraint system
  },
  {
    pattern: "there are as many {role} {profession}s as there are {role} {profession2}s",
    dsl: "SKIP", // Requires profession-based constraint system
  },

  // ============================================================================
  // COMPARISON CONSTRAINTS
  // ============================================================================
  {
    pattern: "there are more {role} in {rowcol} {rowcolval} than {rowcol2} {rowcolval2}",
    dsl: "compare(area({rowcol}({rowcolval}))@{role}, >, area({rowcol2}({rowcolval2}))@{role})",
  },
  {
    pattern: "there's an equal number of {role} in {rowcol} {rowcolval} and {rowcol2} {rowcolval2}",
    dsl: "compare(area({rowcol}({rowcolval}))@{role}, ==, area({rowcol2}({rowcolval2}))@{role})",
  },
  {
    pattern: "there's an equal number of {role} in {rowcol}s {rowcolval} and {rowcolval2}",
    dsl: "compare(area({rowcol}({rowcolval}))@{role}, ==, area({rowcol}({rowcolval2}))@{role})",
  },
];

const tokenRegex: Record<string, string> = {
  k: "(\\d+)",
  total: "(\\d+)",
  num: "(\\d+|one|two|three|four|five)",
  rowcol: "(row|column|col)",
  rowcolval: "(\\d+|[A-E])",
  rowcol2: "(row|column|col)",
  rowcolval2: "(\\d+|[A-E])",
  role: "(innocents?|criminals?)",
  dir: "(above|below|left|right)",
  dir2: "(above|below|left|right)",
  parity: "(odd|even)",
  name: "(\\w+)",
  name2: "(\\w+)",
  be: "(is|are)",
  profession: "(\\w+)",
  profession2: "(\\w+)",
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}

function buildMatcher(pattern: string): { regex: RegExp; tokens: string[] } {
  const tokens: string[] = [];
  let out = "";
  let last = 0;
  const re = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pattern))) {
    out += escapeRegex(pattern.slice(last, m.index));
    const token = m[1];
    tokens.push(token);
    out += tokenRegex[token] || "(\\w+)";
    last = m.index + m[0].length;
  }
  out += escapeRegex(pattern.slice(last));
  out = out.replace(/\s+/g, "\\s+");
  return { regex: new RegExp("^" + out + "$", "i"), tokens };
}

function normalizeClue(s: string): string {
  let out = s.trim().replace(/\s+/g, " ");
  out = out.replace(/[.?!]$/g, "");
  return out;
}

function normalizeVars(vars: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...vars };
  
  // Convert word numbers to digits
  const wordToNum: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
  if (out.num && wordToNum[out.num.toLowerCase()]) {
    out.num = wordToNum[out.num.toLowerCase()];
  }
  
  if (out.role) {
    out.role = out.role.toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
  }
  if (out.parity) out.parity = out.parity.toLowerCase();
  if (out.dir) out.dir = out.dir.toLowerCase();
  if (out.dir2) out.dir2 = out.dir2.toLowerCase();
  if (out.name) out.name = out.name.toLowerCase();
  if (out.name2) out.name2 = out.name2.toLowerCase();
  if (out.rowcol) {
    const rc = out.rowcol.toLowerCase();
    out.rowcol = rc === "column" || rc === "col" ? "col" : "row";
  }
  if (out.rowcolval && out.rowcol === "col") {
    out.rowcolval = out.rowcolval.toUpperCase();
  }
  if (out.rowcol2) {
    const rc = out.rowcol2.toLowerCase();
    out.rowcol2 = rc === "column" || rc === "col" ? "col" : "row";
  }
  if (out.rowcolval2 && out.rowcol2 === "col") {
    out.rowcolval2 = out.rowcolval2.toUpperCase();
  }
  if (out.be) out.be = out.be.toLowerCase();
  return out;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
}

export function compileClues(clues: string[], board: BoardSnapshot): CType[] {
  const out: CType[] = [];
  
  // Load disabled clues from localStorage if available (browser environment)
  let disabledClues: Set<string> = new Set();
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('cluesbysam_disabled_clues');
      if (stored) {
        disabledClues = new Set(JSON.parse(stored));
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Load custom rules from localStorage if available (browser environment)
  let customRules: Array<{ clue: string; dsl: string; enabled: boolean }> = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('cluesbysam_custom_rules');
      if (stored) {
        customRules = JSON.parse(stored);
      }
    }
  } catch (e) {
    // Ignore localStorage errors (e.g., in Node.js environment)
  }
  
  const matchers = templates.map(t => ({ ...t, ...buildMatcher(t.pattern) }));

  for (const clue of clues) {
    const normalized = normalizeClue(clue);
    
    // Skip disabled clues
    if (disabledClues.has(clue)) {
      continue;
    }
    
    let matched = false;
    
    // Try custom rules first (exact match only)
    for (const customRule of customRules) {
      if (!customRule.enabled) continue;
      if (normalizeClue(customRule.clue) === normalized) {
        try {
          const constraints = compileDslClues([customRule.dsl], board);
          if (constraints.length > 0) {
            out.push(...constraints);
            matched = true;
            break;
          }
        } catch (e) {
          console.error('Custom rule DSL error:', customRule, e);
        }
      }
    }
    
    if (matched) continue;
    for (const t of matchers) {
      const m = normalized.match(t.regex);
      if (!m) continue;
      
      // Skip templates marked with "SKIP"
      if (t.dsl === "SKIP") {
        continue;
      }
      
      const vars: Record<string, string> = {};
      t.tokens.forEach((token, i) => {
        vars[token] = m[i + 1];
      });
      const normalizedVars = normalizeVars(vars);
      const dsl = fillTemplate(t.dsl, normalizedVars);
      const constraints = compileDslClues([dsl], board);
      if (constraints.length > 0) {
        out.push(...constraints);
        matched = true;
        break;
      }
    }
  }

  return out;
}

export default { compileClues };
