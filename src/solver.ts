import { BoardSnapshot, Suggestion } from "./types";
import { buildMasks, FULL_MASK, N_CELLS } from "./board";
import { compileClues, CType } from "./parser_rules";

const masks = buildMasks();

// fast popcount cache for values we see
const popcountCache = new Map<number, number>();
function bitCount(x: number) {
  const v = x >>> 0;
  const cached = popcountCache.get(v);
  if (cached !== undefined) return cached;
  let y = v;
  y = y - ((y >>> 1) & 0x55555555);
  y = (y & 0x33333333) + ((y >>> 2) & 0x33333333);
  const res = (((y + (y >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  popcountCache.set(v, res);
  return res;
}

// connectivity check on orthogonal graph
function isConnected(mask: number) {
  const first = mask & -mask; // lowest bit
  if (first === 0) return false;
  const start = Math.floor(Math.log2(first));
  let visited = 0;
  const stack = [start];
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (((visited >> u) & 1) === 1) continue;
    visited |= 1 << u;
    const nbrs = masks.orthoNbrMask[u] & mask;
    // push neighbor indices
    let m = nbrs;
    while (m) {
      const lb = m & -m;
      const j = Math.floor(Math.log2(lb));
      if (((visited >> j) & 1) === 0) stack.push(j);
      m &= m - 1;
    }
  }
  return visited === mask;
}

function evalConstraint(cons: CType, C: number): boolean {
  switch (cons.kind) {
    case "COUNT_EQ": {
      const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
      return bitCount(bits) === cons.k;
    }
    case "COUNT_GTE": {
      const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
      return bitCount(bits) >= cons.k;
    }
    case "COUNT_LTE": {
      const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
      return bitCount(bits) <= cons.k;
    }
    case "PARITY": {
      const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
      return (bitCount(bits) % 2 === (cons.odd ? 1 : 0));
    }
    case "COMPARE": {
      const left = cons.wantCrim ? bitCount(C & cons.leftMask) : bitCount((~C & FULL_MASK) & cons.leftMask);
      const right = cons.wantCrim ? bitCount(C & cons.rightMask) : bitCount((~C & FULL_MASK) & cons.rightMask);
      if (cons.op === ">") return left > right;
      if (cons.op === "<") return left < right;
      return left === right;
    }
    case "UNIQUE_COUNT_EQ": {
      let hits = 0;
      for (const gm of cons.groupMasks) {
        const bits = cons.wantCrim ? (C & gm) : (~C & FULL_MASK & gm);
        if (bitCount(bits) === cons.k) hits++;
        if (hits > 1) return false; // early exit
      }
      return hits === 1;
    }
    case "NEIGHBOR_COUNT": {
      if (cons.qualifier === "IN_ROW" && cons.qualifierMask) {
        const bits = cons.wantCrim ? (C & cons.mask & cons.qualifierMask) : (~C & FULL_MASK & cons.mask & cons.qualifierMask);
        return bitCount(bits) === cons.k;
      }
      return false;
    }
    case "CONN_ALL": {
      // require at least one and that the set of wanted-type cells within mask is connected
      const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
      if (bits === 0) return false; // per tutorial, "All ..." means at least one exists
      return isConnected(bits);
    }
    case "NAME_STATUS_IN_GROUP": {
      // Ensure the named cell has the wanted status and (optionally) the group meets count k
      const has = ((C >> cons.nameIdx) & 1) === 1;
      if (cons.wantCrim && !has) return false;
      if (!cons.wantCrim && has) return false;
      if (cons.k !== undefined) {
        const bits = cons.wantCrim ? (C & cons.mask) : (~C & FULL_MASK & cons.mask);
        return bitCount(bits) === cons.k;
      }
      return true;
    }
    case "INTERSECTION_EMPTY": {
      const aBits = cons.wantCrim ? (C & cons.maskA) : (~C & FULL_MASK & cons.maskA);
      const bBits = cons.wantCrim ? (C & cons.maskB) : (~C & FULL_MASK & cons.maskB);
      return (aBits & bBits) === 0;
    }
    case "UNIQUE_ROW_COUNT_EQ": {
      let hits = 0;
      for (const rowMask of cons.rowMasks) {
        const bits = cons.wantCrim ? (C & rowMask) : (~C & FULL_MASK & rowMask);
        if (bitCount(bits) === cons.countPerRow) hits++;
        if (hits > cons.numRows) return false; // early exit if too many
      }
      return hits === cons.numRows;
    }
  }
  return false;
}

export function solve(board: BoardSnapshot): Suggestion {
  // helper: enumerate solutions for a board snapshot (treating current board.status as fixed)
  function enumerateSolutions(b: BoardSnapshot): number[] {
    let knownCrimMask = 0;
    let knownInnoMask = 0;
    for (const cell of b.cells) {
      if (cell.status === "CRIMINAL") knownCrimMask |= 1 << cell.id;
      if (cell.status === "INNOCENT") knownInnoMask |= 1 << cell.id;
    }
    const knownMask = knownCrimMask | knownInnoMask;
    const unknownMask = (~knownMask) & FULL_MASK;

    const constraints = compileClues(b.clues, b);

    const unknownIndices: number[] = [];
    for (let i = 0; i < N_CELLS; i++) if (((unknownMask >> i) & 1) === 1) unknownIndices.push(i);
    const k = unknownIndices.length;
    const solutions: number[] = [];

    const maxIter = 1 << k;
    for (let mask = 0; mask < maxIter; mask++) {
      let C = knownCrimMask;
      for (let j = 0; j < k; j++) if (((mask >> j) & 1) === 1) C |= 1 << unknownIndices[j];
      if ((C & knownInnoMask) !== 0) continue;
      let ok = true;
      for (const cons of constraints) {
        if (!evalConstraint(cons, C)) { ok = false; break; }
      }
      if (ok) solutions.push(C);
    }
    return solutions;
  }

  const baseSolutions = enumerateSolutions(board);
  if (baseSolutions.length === 0) throw new Error('No solutions found for given clues and statuses');

  const res: Suggestion = { forced: [], numSolutions: baseSolutions.length };

  // Only show forced cells that are currently UNKNOWN (unflipped)
  const knownMaskNow = board.cells.reduce((m, c) => m | ((c.status === 'CRIMINAL' || c.status === 'INNOCENT') ? (1 << c.id) : 0), 0);
  for (let idx = 0; idx < N_CELLS; idx++) {
    const isKnown = ((knownMaskNow >> idx) & 1) === 1;
    // Skip known cells - only process unknown cells
    if (isKnown) continue;

    // Check if all baseSolutions agree on this unknown cell
    let all1 = true;
    let all0 = true;
    for (const C of baseSolutions) {
      const b = (C >> idx) & 1;
      if (b === 1) all0 = false; else all1 = false;
    }
    if (all1) res.forced.push({ id: idx, status: "CRIMINAL", reason: `Always criminal in ${baseSolutions.length} solutions` });
    if (all0) res.forced.push({ id: idx, status: "INNOCENT", reason: `Always innocent in ${baseSolutions.length} solutions` });
  }

  if (res.forced.length > 0) {
    res.forced.sort((a, b) => {
      const degA = bitCount(masks.nbrMask[a.id]);
      const degB = bitCount(masks.nbrMask[b.id]);
      return degB - degA;
    });
  }

  return res;
}

export { compileClues };
export default { solve, compileClues };
