"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDefaultBoard = exports.buildMasks = exports.indexToPos = exports.posToIndex = exports.FULL_MASK = exports.N_CELLS = exports.ROWS = exports.COLS = void 0;
exports.COLS = 4; // A-D
exports.ROWS = 5; // 1-5
exports.N_CELLS = exports.COLS * exports.ROWS; // 20
exports.FULL_MASK = (1 << exports.N_CELLS) - 1;
function posToIndex(pos) {
    // expect like 'A1'..'D5'
    const col = pos[0].toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
    const row = parseInt(pos.slice(1), 10) - 1;
    return row * exports.COLS + col;
}
exports.posToIndex = posToIndex;
function indexToPos(i) {
    const row = Math.floor(i / exports.COLS);
    const col = i % exports.COLS;
    return String.fromCharCode("A".charCodeAt(0) + col) + String(row + 1);
}
exports.indexToPos = indexToPos;
function buildMasks() {
    const rowMask = Array(exports.ROWS).fill(0);
    const colMask = Array(exports.COLS).fill(0);
    const edgeMask = 0; // computed below
    const cornerMask = 0; // computed below
    const nbrMask = Array(exports.N_CELLS).fill(0);
    const orthoNbrMask = Array(exports.N_CELLS).fill(0);
    for (let r = 0; r < exports.ROWS; r++) {
        for (let c = 0; c < exports.COLS; c++) {
            const idx = r * exports.COLS + c;
            rowMask[r] |= 1 << idx;
            colMask[c] |= 1 << idx;
        }
    }
    // dynamic create neighbor masks including diagonals
    for (let r = 0; r < exports.ROWS; r++) {
        for (let c = 0; c < exports.COLS; c++) {
            const idx = r * exports.COLS + c;
            let nm = 0;
            let onm = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0)
                        continue;
                    const rr = r + dr;
                    const cc = c + dc;
                    if (rr >= 0 && rr < exports.ROWS && cc >= 0 && cc < exports.COLS) {
                        const j = rr * exports.COLS + cc;
                        nm |= 1 << j;
                        if (Math.abs(dr) + Math.abs(dc) === 1)
                            onm |= 1 << j;
                    }
                }
            }
            nbrMask[idx] = nm;
            orthoNbrMask[idx] = onm;
        }
    }
    const _edgeMask = (() => {
        let m = 0;
        for (let r = 0; r < exports.ROWS; r++)
            for (let c = 0; c < exports.COLS; c++) {
                if (r === 0 || r === exports.ROWS - 1 || c === 0 || c === exports.COLS - 1)
                    m |= 1 << (r * exports.COLS + c);
            }
        return m;
    })();
    const _cornerMask = (() => {
        return (1 << (0 * exports.COLS + 0)) | (1 << (0 * exports.COLS + (exports.COLS - 1))) | (1 << ((exports.ROWS - 1) * exports.COLS + 0)) | (1 << ((exports.ROWS - 1) * exports.COLS + (exports.COLS - 1)));
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
exports.buildMasks = buildMasks;
function buildDefaultBoard() {
    // create 20 placeholders in A1..D5 order row-major
    const cells = [];
    for (let r = 0; r < exports.ROWS; r++) {
        for (let c = 0; c < exports.COLS; c++) {
            const id = r * exports.COLS + c;
            cells.push({ id, name: `P${id + 1}`, profession: '', pos: indexToPos(id), status: "UNKNOWN" });
        }
    }
    return cells;
}
exports.buildDefaultBoard = buildDefaultBoard;
