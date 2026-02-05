"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileClues = void 0;
const board_1 = require("./board");
const masks = (0, board_1.buildMasks)();
function compileClues(clues, board) {
    const out = [];
    const rowMask = masks.rowMask;
    const colMask = masks.colMask;
    function nameToIndex(name) {
        const t = name.toLowerCase();
        for (const c of board.cells)
            if (c.name && c.name.toLowerCase() === t)
                return c.id;
        return null;
    }
    // Helper: extract role (criminal/innocent) and determine wantCrim
    function extractRole(roleStr) {
        return !roleStr.toLowerCase().startsWith("innoc");
    }
    // Rule: "exactly K ROLE in ROW/COLUMN"
    // Examples: "exactly 3 criminals in row 1", "exactly 2 innocents in column B"
    function parseExactCountInArea(s) {
        const out = [];
        const m = s.match(/exactly\s+(\d+)\s+(innocents?|criminals?)\s+in\s+(?:row\s+(\d+)|column\s+([A-D]))/i);
        if (m) {
            const k = parseInt(m[1], 10);
            const wantCrim = extractRole(m[2]);
            if (m[3]) {
                const row = parseInt(m[3], 10) - 1;
                out.push({ kind: "COUNT_EQ", mask: rowMask[row], wantCrim, k });
            }
            else if (m[4]) {
                const col = m[4].toUpperCase().charCodeAt(0) - 65;
                out.push({ kind: "COUNT_EQ", mask: colMask[col], wantCrim, k });
            }
        }
        return out;
    }
    // Rule: "X is 1 of K ROLE in ROW/COLUMN"
    // Example: "Tina is one of 3 criminals in row 4"
    function parseNameInGroup(s) {
        const out = [];
        const m = s.match(/(\w+)\s+is\s+(?:one|1)\s+of\s+(\d+)\s+(innocents?|criminals?)\s+in\s+(?:row\s+(\d+)|column\s+([A-D]))/i);
        if (m) {
            const nameIdx = nameToIndex(m[1]);
            const k = parseInt(m[2], 10);
            const wantCrim = extractRole(m[3]);
            if (nameIdx !== null) {
                if (m[4]) {
                    const row = parseInt(m[4], 10) - 1;
                    out.push({ kind: "COUNT_EQ", mask: rowMask[row], wantCrim, k });
                    out.push({ kind: "NAME_STATUS_IN_GROUP", nameIdx, mask: rowMask[row], wantCrim, k });
                }
                else if (m[5]) {
                    const col = m[5].toUpperCase().charCodeAt(0) - 65;
                    out.push({ kind: "COUNT_EQ", mask: colMask[col], wantCrim, k });
                    out.push({ kind: "NAME_STATUS_IN_GROUP", nameIdx, mask: colMask[col], wantCrim, k });
                }
            }
        }
        return out;
    }
    // Rule: "exactly K of the TOTAL ROLE neighboring NAME are in ROW"
    // Example: "Exactly 2 of the 4 innocents neighboring Gary are in row 1"
    function parseNeighborCountInArea(s) {
        const out = [];
        const m = s.match(/exactly\s+(\d+)\s+of\s+the\s+(\d+)\s+(innocents?|criminals?)\s+(?:neighboring|neighbors of)\s+(\w+)\s+are\s+in\s+(?:row\s+(\d+)|column\s+([A-D]))/i);
        if (m) {
            const k = parseInt(m[1], 10);
            const total = parseInt(m[2], 10);
            const wantCrim = extractRole(m[3]);
            const nameIdx = nameToIndex(m[4]);
            if (nameIdx !== null) {
                const nbrs = masks.nbrMask[nameIdx];
                out.push({ kind: "COUNT_EQ", mask: nbrs, wantCrim, k: total });
                if (m[5]) {
                    const row = parseInt(m[5], 10) - 1;
                    out.push({ kind: "NEIGHBOR_COUNT", centerIdx: nameIdx, mask: nbrs, wantCrim, k, qualifier: "IN_ROW", qualifierMask: rowMask[row] });
                }
                else if (m[6]) {
                    const col = m[6].toUpperCase().charCodeAt(0) - 65;
                    out.push({ kind: "NEIGHBOR_COUNT", centerIdx: nameIdx, mask: nbrs, wantCrim, k, qualifier: "IN_ROW", qualifierMask: colMask[col] });
                }
            }
        }
        return out;
    }
    // Rule: "exactly K ROLE in ROW/COLUMN is/are neighboring NAME"
    // Example: "Exactly 1 innocent in row 4 is neighboring Xavi"
    function parseAreaNeighboringName(s) {
        const out = [];
        const m = s.match(/exactly\s+(\d+)\s+(innocents?|criminals?)\s+in\s+(?:row\s+(\d+)|column\s+([A-D]))\s+is\s+(?:neighboring|neighbors of)\s+(\w+)/i);
        if (m) {
            const k = parseInt(m[1], 10);
            const wantCrim = extractRole(m[2]);
            const nameIdx = nameToIndex(m[5]);
            if (nameIdx !== null) {
                let areaMask = 0;
                if (m[3]) {
                    const row = parseInt(m[3], 10) - 1;
                    areaMask = rowMask[row];
                }
                else if (m[4]) {
                    const col = m[4].toUpperCase().charCodeAt(0) - 65;
                    areaMask = colMask[col];
                }
                const intersection = areaMask & masks.nbrMask[nameIdx];
                out.push({ kind: "COUNT_EQ", mask: intersection, wantCrim, k });
            }
        }
        return out;
    }
    // Rule: "NAME has exactly K ROLE neighbors"
    // Example: "Xavi has exactly 3 innocent neighbors"
    function parseNameHasNeighbors(s) {
        const out = [];
        const m = s.match(/(\w+)\s+has\s+exactly\s+(\d+)\s+(innocents?|criminals?)\s+neighbors?/i);
        if (m) {
            const nameIdx = nameToIndex(m[1]);
            const k = parseInt(m[2], 10);
            const wantCrim = extractRole(m[3]);
            if (nameIdx !== null)
                out.push({ kind: "COUNT_EQ", mask: masks.nbrMask[nameIdx], wantCrim, k });
        }
        return out;
    }
    // Rule: "PARITY number of ROLE in AREA"
    // Examples: "odd number of criminals in row 1", "even number of innocents in column C"
    function parseParityInArea(s) {
        const out = [];
        const m = s.match(/(odd|even)\s+number\s+of\s+(innocents?|criminals?)\s+(?:in\s+)?(?:row\s+(\d+)|column\s+([A-D])|on\s+the\s+edges|the\s+edges)/i);
        if (m) {
            const odd = m[1].toLowerCase() === "odd";
            const wantCrim = extractRole(m[2]);
            let areaMask = 0;
            if (m[3]) {
                const row = parseInt(m[3], 10) - 1;
                areaMask = rowMask[row];
            }
            else if (m[4]) {
                const col = m[4].toUpperCase().charCodeAt(0) - 65;
                areaMask = colMask[col];
            }
            else if (/edges/i.test(s)) {
                areaMask = masks.edgeMask;
            }
            if (areaMask > 0)
                out.push({ kind: "PARITY", mask: areaMask, wantCrim, odd });
        }
        return out;
    }
    // Rule: "PARITY number of ROLE neighboring NAME"
    // Example: "odd number of innocents neighboring Gary"
    function parseParityNeighboring(s) {
        const out = [];
        const m = s.match(/(odd|even)\s+number\s+of\s+(innocents?|criminals?)\s+(?:neighbors of|neighboring)\s+(\w+)/i);
        if (m) {
            const odd = m[1].toLowerCase() === "odd";
            const wantCrim = extractRole(m[2]);
            const nameIdx = nameToIndex(m[3]);
            if (nameIdx !== null)
                out.push({ kind: "PARITY", mask: masks.nbrMask[nameIdx], wantCrim, odd });
        }
        return out;
    }
    // Rule: "PARITY number of ROLE DIR NAME neighbor NAME2"
    // Example: "An odd number of innocents above Zara neighbor Gary"
    function parseParityDirNeighbor(s) {
        const out = [];
        const m = s.match(/(odd|even)\s+number\s+of\s+(innocents?|criminals?)\s+(above|below|left|right)\s+(\w+)\s+(?:neighbors?|neighboring)\s+(\w+)/i);
        if (m) {
            const odd = m[1].toLowerCase() === "odd";
            const wantCrim = extractRole(m[2]);
            const dir = m[3].toLowerCase();
            const refIdx = nameToIndex(m[4]);
            const centerIdx = nameToIndex(m[5]);
            if (refIdx !== null && centerIdx !== null && board.cells[refIdx].pos) {
                const pos = board.cells[refIdx].pos;
                const col = pos[0];
                const row = parseInt(pos.slice(1), 10);
                let dirMask = 0;
                for (const c of board.cells) {
                    if (!c.pos)
                        continue;
                    if (c.pos[0] === col) {
                        const r = parseInt(c.pos.slice(1), 10);
                        if ((dir === "above" && r < row) || (dir === "below" && r > row))
                            dirMask |= 1 << c.id;
                    }
                }
                const intersection = dirMask & masks.nbrMask[centerIdx];
                out.push({ kind: "PARITY", mask: intersection, wantCrim, odd });
            }
        }
        return out;
    }
    // Rule: "BOTH ROLE DIR NAME are CONNECTED"
    // Example: "Both criminals above Xavi are connected"
    function parseConnected(s) {
        const out = [];
        const m = s.match(/(both|exactly\s+2)\s+(innocents?|criminals?)\s+(above|below|left|right|in column [A-D]|in row \d+)\s+(\w+)\s+are\s+connected/i);
        if (m) {
            const wantCrim = extractRole(m[2]);
            const dir = m[3].toLowerCase();
            const nameIdx = nameToIndex(m[4]);
            if (nameIdx !== null && board.cells[nameIdx].pos) {
                const pos = board.cells[nameIdx].pos;
                let groupMask = 0;
                if (dir === "above" || dir === "below" || dir === "left" || dir === "right") {
                    const col = pos[0];
                    const row = parseInt(pos.slice(1), 10);
                    for (const c of board.cells) {
                        if (!c.pos)
                            continue;
                        if (c.pos[0] === col) {
                            const r = parseInt(c.pos.slice(1), 10);
                            if ((dir === "above" && r < row) || (dir === "below" && r > row))
                                groupMask |= 1 << c.id;
                        }
                    }
                }
                else if (/column\s+([A-D])/i.test(dir)) {
                    const m2 = dir.match(/column\s+([A-D])/i);
                    if (m2) {
                        const col = m2[1].toUpperCase().charCodeAt(0) - 65;
                        groupMask = colMask[col];
                    }
                }
                else if (/row\s+(\d+)/i.test(dir)) {
                    const m2 = dir.match(/row\s+(\d+)/i);
                    if (m2) {
                        const row = parseInt(m2[1], 10) - 1;
                        groupMask = rowMask[row];
                    }
                }
                if (groupMask > 0) {
                    out.push({ kind: "COUNT_EQ", mask: groupMask, wantCrim, k: 2 });
                    out.push({ kind: "CONN_ALL", mask: groupMask, wantCrim });
                }
            }
        }
        return out;
    }
    // Rule: "X and Y have no ROLE neighbors in common"
    // Example: "Jon and Mary have no criminal neighbors in common"
    function parseNoCommonNeighbors(s) {
        const out = [];
        const m = s.match(/(\w+)\s+and\s+(\w+)\s+have\s+no\s+(innocents?|criminals?)\s+neighbors\s+in\s+common/i);
        if (m) {
            const idxA = nameToIndex(m[1]);
            const idxB = nameToIndex(m[2]);
            const wantCrim = extractRole(m[3]);
            if (idxA !== null && idxB !== null)
                out.push({ kind: "INTERSECTION_EMPTY", maskA: masks.nbrMask[idxA], maskB: masks.nbrMask[idxB], wantCrim });
        }
        return out;
    }
    // Rule: "only the ROLE to the DIR of NAME1 is DIR NAME2"
    // Example: "The only innocent to the left of Xena is below Barb"
    function parseOnlyToDir(s) {
        const out = [];
        const m = s.match(/(?:only\s+the|the\s+only)\s+(innocents?|criminals?)\s+to\s+the\s+(left|right)\s+of\s+(\w+)\s+is\s+(above|below)\s+(\w+)/i);
        if (m) {
            const wantCrim = extractRole(m[1]);
            const dir1 = m[2].toLowerCase();
            const nameIdx1 = nameToIndex(m[3]);
            const dir2 = m[4].toLowerCase();
            const nameIdx2 = nameToIndex(m[5]);
            if (nameIdx1 !== null && nameIdx2 !== null && board.cells[nameIdx1].pos && board.cells[nameIdx2].pos) {
                const pos1 = board.cells[nameIdx1].pos;
                const row1 = parseInt(pos1.slice(1), 10);
                const col1Idx = pos1[0].toUpperCase().charCodeAt(0) - 65;
                let leftMask = 0;
                for (const c of board.cells) {
                    if (!c.pos)
                        continue;
                    const r = parseInt(c.pos.slice(1), 10);
                    const cIdx = c.pos[0].toUpperCase().charCodeAt(0) - 65;
                    if (r === row1 && cIdx < col1Idx)
                        leftMask |= 1 << c.id;
                }
                const pos2 = board.cells[nameIdx2].pos;
                const col2 = pos2[0];
                const row2 = parseInt(pos2.slice(1), 10);
                const col2Idx = col2.toUpperCase().charCodeAt(0) - 65;
                let refMask = 0;
                for (const c of board.cells) {
                    if (!c.pos)
                        continue;
                    const r = parseInt(c.pos.slice(1), 10);
                    const cIdx = c.pos[0].toUpperCase().charCodeAt(0) - 65;
                    if (cIdx === col2Idx && ((dir2 === "above" && r < row2) || (dir2 === "below" && r > row2)))
                        refMask |= 1 << c.id;
                }
                out.push({ kind: "COUNT_EQ", mask: leftMask, wantCrim, k: 1 });
                out.push({ kind: "COUNT_EQ", mask: leftMask & refMask, wantCrim, k: 1 });
            }
        }
        return out;
    }
    // Rule: "there are more ROLE in AREA1 than AREA2"
    // Example: "There are more criminals in row 1 than row 5"
    function parseComparison(s) {
        const out = [];
        const m = s.match(/(?:there\s+are\s+)?more\s+(innocents?|criminals?)\s+in\s+(row\s+\d+|column\s+[A-D])\s+than\s+(row\s+\d+|column\s+[A-D])/i);
        if (m) {
            const wantCrim = extractRole(m[1]);
            const area1Str = m[2].toLowerCase();
            const area2Str = m[3].toLowerCase();
            let leftMask = 0, rightMask = 0;
            const m1 = area1Str.match(/row\s+(\d+)/);
            const m2 = area1Str.match(/column\s+([A-D])/i);
            if (m1)
                leftMask = rowMask[parseInt(m1[1], 10) - 1];
            else if (m2)
                leftMask = colMask[m2[1].toUpperCase().charCodeAt(0) - 65];
            const m3 = area2Str.match(/row\s+(\d+)/);
            const m4 = area2Str.match(/column\s+([A-D])/i);
            if (m3)
                rightMask = rowMask[parseInt(m3[1], 10) - 1];
            else if (m4)
                rightMask = colMask[m4[1].toUpperCase().charCodeAt(0) - 65];
            if (leftMask > 0 && rightMask > 0)
                out.push({ kind: "COMPARE", leftMask, rightMask, wantCrim, op: ">" });
        }
        return out;
    }
    // Rule: "there are K ROLE in total"
    // Example: "There are 3 criminals in total"
    function parseTotalCount(s) {
        const out = [];
        const m = s.match(/there\s+are\s+(\d+)\s+(innocents?|criminals?)\s+in\s+total/i);
        if (m) {
            const k = parseInt(m[1], 10);
            const wantCrim = extractRole(m[2]);
            out.push({ kind: "COUNT_EQ", mask: board_1.FULL_MASK, wantCrim, k });
        }
        return out;
    }
    // Apply all rules and collect results
    const rules = [
        parseNameInGroup,
        parseAreaNeighboringName,
        parseNeighborCountInArea,
        parseExactCountInArea,
        parseNameHasNeighbors,
        parseParityInArea,
        parseParityNeighboring,
        parseParityDirNeighbor,
        parseConnected,
        parseNoCommonNeighbors,
        parseOnlyToDir,
        parseComparison,
        parseTotalCount,
    ];
    for (const clue of clues) {
        let matched = false;
        for (const rule of rules) {
            const results = rule(clue);
            if (results.length > 0) {
                out.push(...results);
                matched = true;
                break; // stop after first matching rule
            }
        }
    }
    return out;
}
exports.compileClues = compileClues;
