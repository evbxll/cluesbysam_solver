import { CellSnapshot } from "./types";

export const COLS = 4; // A-D
export const ROWS = 5; // 1-5
export const N_CELLS = COLS * ROWS; // 20
export const FULL_MASK = (1 << N_CELLS) - 1;

export function posToIndex(pos: string): number {
  // expect like 'A1'..'D5'
  const col = pos[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  const row = parseInt(pos.slice(1), 10) - 1;
  return row * COLS + col;
}

export function indexToPos(i: number): string {
  const row = Math.floor(i / COLS);
  const col = i % COLS;
  return String.fromCharCode("A".charCodeAt(0) + col) + String(row + 1);
}

export function buildMasks() {
  const rowMask: number[] = Array(ROWS).fill(0);
  const colMask: number[] = Array(COLS).fill(0);
  const edgeMask = 0; // computed below
  const cornerMask = 0; // computed below
  const nbrMask: number[] = Array(N_CELLS).fill(0);
  const orthoNbrMask: number[] = Array(N_CELLS).fill(0);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      rowMask[r] |= 1 << idx;
      colMask[c] |= 1 << idx;
    }
  }

  // dynamic create neighbor masks including diagonals
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      let nm = 0;
      let onm = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
            const j = rr * COLS + cc;
            nm |= 1 << j;
            if (Math.abs(dr) + Math.abs(dc) === 1) onm |= 1 << j;
          }
        }
      }
      nbrMask[idx] = nm;
      orthoNbrMask[idx] = onm;
    }
  }

  const _edgeMask = (() => {
    let m = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) m |= 1 << (r * COLS + c);
    }
    return m;
  })();

  const _cornerMask = (() => {
    return (1 << (0 * COLS + 0)) | (1 << (0 * COLS + (COLS - 1))) | (1 << ((ROWS - 1) * COLS + 0)) | (1 << ((ROWS - 1) * COLS + (COLS - 1)));
  })();

  return {
    rowMask,
    colMask,
    nbrMask,
    orthoNbrMask,
    edgeMask: _edgeMask,
    cornerMask: _cornerMask,
  };
}

export function buildDefaultBoard(): CellSnapshot[] {
  // create 20 placeholders in A1..D5 order row-major
  const cells: CellSnapshot[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = r * COLS + c;
      cells.push({ id, name: `P${id + 1}`, profession: '', pos: indexToPos(id), status: "UNKNOWN" });
    }
  }
  return cells;
}
