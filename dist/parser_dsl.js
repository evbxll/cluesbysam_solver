"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileClues = void 0;
const board_1 = require("./board");
const masks = (0, board_1.buildMasks)();
function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const c = input[i];
        // Skip whitespace
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        // Parentheses
        if (c === "(") {
            tokens.push({ type: "LPAREN", value: "(" });
            i++;
            continue;
        }
        if (c === ")") {
            tokens.push({ type: "RPAREN", value: ")" });
            i++;
            continue;
        }
        // Operators: +, &, |, @, ~, ,
        if (/[+&|@~,]/.test(c)) {
            tokens.push({ type: "OP", value: c });
            i++;
            continue;
        }
        // Numbers
        if (/\d/.test(c)) {
            let num = "";
            while (i < input.length && /\d/.test(input[i])) {
                num += input[i];
                i++;
            }
            tokens.push({ type: "NUMBER", value: num });
            continue;
        }
        // Identifiers (letters, digits, underscores)
        if (/[a-zA-Z_]/.test(c)) {
            let ident = "";
            while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
                ident += input[i];
                i++;
            }
            tokens.push({ type: "IDENT", value: ident });
            continue;
        }
        throw new Error(`Unexpected character: ${c}`);
    }
    tokens.push({ type: "EOF", value: "" });
    return tokens;
}
class DSLParser {
    constructor(tokens, board) {
        this.tokens = tokens;
        this.pos = 0;
        this.board = board;
    }
    peek() {
        return this.tokens[this.pos];
    }
    consume() {
        return this.tokens[this.pos++];
    }
    expect(value) {
        const tok = this.peek();
        if (tok.value !== value) {
            throw new Error(`Expected '${value}', got '${tok.value}'`);
        }
        return this.consume();
    }
    nameToIndex(name) {
        const t = name.toLowerCase();
        for (const c of this.board.cells) {
            if (c.name && c.name.toLowerCase() === t)
                return c.id;
        }
        return null;
    }
    // Parse primitives: area(row 1), neighbor(Gary), above(Uma), etc., or (expr)
    parsePrimitive() {
        const tok = this.peek();
        // Handle parenthesized expressions: (expr)
        if (tok.type === "LPAREN") {
            this.consume(); // consume (
            // Parse everything up to the matching closing paren
            const expr = this.parseUnion();
            this.expect(")"); // consume )
            return expr;
        }
        if (tok.type !== "IDENT") {
            throw new Error(`Expected identifier, got ${tok.type}`);
        }
        const func = tok.value.toLowerCase();
        this.consume();
        this.expect("(");
        switch (func) {
            case "area": {
                const arg = this.consume();
                if (arg.type === "IDENT") {
                    const kind = arg.value.toLowerCase();
                    if (kind === "row") {
                        this.expect("(");
                        const rowNum = parseInt(this.consume().value, 10);
                        this.expect(")");
                        const row = rowNum - 1;
                        return { type: "primitive", mask: masks.rowMask[row], role: null };
                    }
                    if (kind === "col" || kind === "column") {
                        this.expect("(");
                        const colChar = this.consume().value;
                        this.expect(")");
                        const col = colChar.toUpperCase().charCodeAt(0) - 65;
                        return { type: "primitive", mask: masks.colMask[col], role: null };
                    }
                    if (kind === "all") {
                        return { type: "primitive", mask: board_1.FULL_MASK, role: null };
                    }
                    if (kind === "edges") {
                        // Edges are cells in row 1, row 5, column A, or column D
                        const edgeMask = masks.rowMask[0] | masks.rowMask[4] | masks.colMask[0] | masks.colMask[3];
                        return { type: "primitive", mask: edgeMask, role: null };
                    }
                }
                throw new Error(`Unknown area: ${arg.value}`);
            }
            case "neighbor": {
                const nameToken = this.consume();
                this.expect(")");
                const idx = this.nameToIndex(nameToken.value);
                if (idx === null)
                    throw new Error(`Unknown name: ${nameToken.value}`);
                return { type: "primitive", mask: masks.nbrMask[idx], role: null };
            }
            case "above": {
                const nameToken = this.consume();
                this.expect(")");
                const idx = this.nameToIndex(nameToken.value);
                if (idx === null)
                    throw new Error(`Unknown name: ${nameToken.value}`);
                const cell = this.board.cells[idx];
                if (!cell.pos)
                    throw new Error(`No position for ${nameToken.value}`);
                const col = cell.pos[0];
                const row = parseInt(cell.pos.slice(1), 10);
                let mask = 0;
                for (const c of this.board.cells) {
                    if (!c.pos)
                        continue;
                    if (c.pos[0] === col) {
                        const r = parseInt(c.pos.slice(1), 10);
                        if (r < row)
                            mask |= 1 << c.id;
                    }
                }
                return { type: "primitive", mask, role: null };
            }
            case "below": {
                const nameToken = this.consume();
                this.expect(")");
                const idx = this.nameToIndex(nameToken.value);
                if (idx === null)
                    throw new Error(`Unknown name: ${nameToken.value}`);
                const cell = this.board.cells[idx];
                if (!cell.pos)
                    throw new Error(`No position for ${nameToken.value}`);
                const col = cell.pos[0];
                const row = parseInt(cell.pos.slice(1), 10);
                let mask = 0;
                for (const c of this.board.cells) {
                    if (!c.pos)
                        continue;
                    if (c.pos[0] === col) {
                        const r = parseInt(c.pos.slice(1), 10);
                        if (r > row)
                            mask |= 1 << c.id;
                    }
                }
                return { type: "primitive", mask, role: null };
            }
            case "left": {
                const nameToken = this.consume();
                this.expect(")");
                const idx = this.nameToIndex(nameToken.value);
                if (idx === null)
                    throw new Error(`Unknown name: ${nameToken.value}`);
                const cell = this.board.cells[idx];
                if (!cell.pos)
                    throw new Error(`No position for ${nameToken.value}`);
                const row = parseInt(cell.pos.slice(1), 10);
                const col = cell.pos[0].charCodeAt(0) - 65;
                let mask = 0;
                for (const c of this.board.cells) {
                    if (!c.pos)
                        continue;
                    const r = parseInt(c.pos.slice(1), 10);
                    const cCol = c.pos[0].charCodeAt(0) - 65;
                    if (r === row && cCol < col)
                        mask |= 1 << c.id;
                }
                return { type: "primitive", mask, role: null };
            }
            case "right": {
                const nameToken = this.consume();
                this.expect(")");
                const idx = this.nameToIndex(nameToken.value);
                if (idx === null)
                    throw new Error(`Unknown name: ${nameToken.value}`);
                const cell = this.board.cells[idx];
                if (!cell.pos)
                    throw new Error(`No position for ${nameToken.value}`);
                const row = parseInt(cell.pos.slice(1), 10);
                const col = cell.pos[0].charCodeAt(0) - 65;
                let mask = 0;
                for (const c of this.board.cells) {
                    if (!c.pos)
                        continue;
                    const r = parseInt(c.pos.slice(1), 10);
                    const cCol = c.pos[0].charCodeAt(0) - 65;
                    if (r === row && cCol > col)
                        mask |= 1 << c.id;
                }
                return { type: "primitive", mask, role: null };
            }
            case "between": {
                // between(name1, name2) - cells geometrically between two named cells
                const name1Token = this.consume();
                this.expect(",");
                const name2Token = this.consume();
                this.expect(")");
                const idx1 = this.nameToIndex(name1Token.value);
                const idx2 = this.nameToIndex(name2Token.value);
                if (idx1 === null)
                    throw new Error(`Unknown name: ${name1Token.value}`);
                if (idx2 === null)
                    throw new Error(`Unknown name: ${name2Token.value}`);
                const cell1 = this.board.cells[idx1];
                const cell2 = this.board.cells[idx2];
                if (!cell1.pos || !cell2.pos)
                    throw new Error(`No position for cells`);
                const col1 = cell1.pos[0].charCodeAt(0) - 65;
                const row1 = parseInt(cell1.pos.slice(1), 10);
                const col2 = cell2.pos[0].charCodeAt(0) - 65;
                const row2 = parseInt(cell2.pos.slice(1), 10);
                let mask = 0;
                // Check if they're in the same row or column
                if (row1 === row2) {
                    // Same row - cells between them horizontally
                    const minCol = Math.min(col1, col2);
                    const maxCol = Math.max(col1, col2);
                    for (const c of this.board.cells) {
                        if (!c.pos)
                            continue;
                        const r = parseInt(c.pos.slice(1), 10);
                        const col = c.pos[0].charCodeAt(0) - 65;
                        if (r === row1 && col > minCol && col < maxCol) {
                            mask |= 1 << c.id;
                        }
                    }
                }
                else if (col1 === col2) {
                    // Same column - cells between them vertically
                    const minRow = Math.min(row1, row2);
                    const maxRow = Math.max(row1, row2);
                    for (const c of this.board.cells) {
                        if (!c.pos)
                            continue;
                        const col = c.pos[0].charCodeAt(0) - 65;
                        const r = parseInt(c.pos.slice(1), 10);
                        if (col === col1 && r > minRow && r < maxRow) {
                            mask |= 1 << c.id;
                        }
                    }
                }
                // If not in same row/column, no cells are "between" them (returns empty mask)
                return { type: "primitive", mask, role: null };
            }
            default:
                throw new Error(`Unknown primitive function: ${func}`);
        }
    }
    // Parse postfix @ operator: expr@criminal or expr@innocent
    // NOTE: We now extract @ filters at the compileDSL level before parsing,
    // so this is mainly for backwards compatibility
    parseFiltered() {
        let expr = this.parsePrimitive();
        while (this.peek().value === "@") {
            this.consume();
            const roleToken = this.consume();
            // Ignore the role here - it's extracted at the top level
            expr = expr; // just return the underlying expression
        }
        return expr;
    }
    // Parse intersection & operator
    parseIntersection() {
        let left = this.parseFiltered();
        while (this.peek().value === "&") {
            this.consume();
            const right = this.parseFiltered();
            left = { type: "intersection", left, right };
        }
        return left;
    }
    // Parse union | operator
    parseUnion() {
        let left = this.parseIntersection();
        while (this.peek().value === "|") {
            this.consume();
            const right = this.parseIntersection();
            left = { type: "union", left, right };
        }
        return left;
    }
    // Evaluate a set expression to a concrete mask and role
    evalSetExpr(expr) {
        switch (expr.type) {
            case "primitive":
                return { mask: expr.mask, role: expr.role || null };
            case "filtered": {
                const inner = this.evalSetExpr(expr.left);
                return { mask: inner.mask, role: expr.role || null };
            }
            case "intersection": {
                const left = this.evalSetExpr(expr.left);
                const right = this.evalSetExpr(expr.right);
                return {
                    mask: left.mask & right.mask,
                    role: (expr.role ?? (left.role || right.role)) || null
                };
            }
            case "union": {
                const left = this.evalSetExpr(expr.left);
                const right = this.evalSetExpr(expr.right);
                return {
                    mask: left.mask | right.mask,
                    role: (expr.role ?? (left.role || right.role)) || null
                };
            }
            default:
                throw new Error(`Unknown set expression type: ${expr.type}`);
        }
    }
    // Parse entire DSL expression
    parseExpression() {
        return this.parseUnion();
    }
}
// ============================================================================
// DSL COMPILER
// ============================================================================
function compileDSL(dslInput, board) {
    const lines = dslInput.split("+").map(s => s.trim()).filter(s => s);
    const out = [];
    for (const line of lines) {
        // Parse constraint function: eq(k, expr), parity(odd, expr), etc.
        const constraintMatch = line.match(/^(\w+)\s*\((.*)\)$/);
        if (!constraintMatch) {
            // Skip unparseable lines silently
            continue;
        }
        const [, funcName, argsStr] = constraintMatch;
        const func = funcName.toLowerCase();
        // Split arguments carefully (respecting nested parens)
        const args = [];
        let depth = 0;
        let current = "";
        for (const c of argsStr) {
            if (c === "(")
                depth++;
            if (c === ")")
                depth--;
            if (c === "," && depth === 0) {
                args.push(current.trim());
                current = "";
            }
            else {
                current += c;
            }
        }
        if (current.trim())
            args.push(current.trim());
        if (func === "eq") {
            const k = parseInt(args[0], 10);
            const exprStr = args[1];
            // Extract role filter from the outermost level
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "innocent" ? false : true;
            out.push({ kind: "COUNT_EQ", mask, wantCrim, k });
        }
        else if (func === "gte") {
            const k = parseInt(args[0], 10);
            const exprStr = args[1];
            // Extract role filter from the outermost level
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "innocent" ? false : true;
            out.push({ kind: "COUNT_GTE", mask, wantCrim, k });
        }
        else if (func === "parity") {
            const parity = args[0].toLowerCase();
            const odd = parity === "odd";
            const exprStr = args[1];
            // Extract role filter
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "innocent" ? false : true;
            out.push({ kind: "PARITY", mask, wantCrim, odd });
        }
        else if (func === "connected") {
            const exprStr = args[0];
            // Extract role filter
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "innocent" ? false : true;
            out.push({ kind: "CONN_ALL", mask, wantCrim });
        }
        else if (func === "in_group") {
            const nameStr = args[0];
            const exprStr = args[1];
            const nameIdx = (() => {
                const t = nameStr.toLowerCase();
                for (const c of board.cells) {
                    if (c.name && c.name.toLowerCase() === t)
                        return c.id;
                }
                return null;
            })();
            if (nameIdx === null) {
                continue;
            }
            // Extract role filter
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "criminal";
            out.push({ kind: "NAME_STATUS_IN_GROUP", nameIdx, mask, wantCrim });
        }
        else if (func === "unique_row_count_eq") {
            const numRows = parseInt(args[0], 10);
            const countPerRow = parseInt(args[1], 10);
            const exprStr = args[2];
            // Extract role filter
            let expr = exprStr;
            let role = null;
            const roleMatch = exprStr.match(/@(innocent|criminal)\s*$/i);
            if (roleMatch) {
                role = roleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                expr = exprStr.slice(0, roleMatch.index).trim();
            }
            const tokens = tokenize(expr);
            const parser = new DSLParser(tokens, board);
            const parsedExpr = parser.parseExpression();
            const { mask } = parser.evalSetExpr(parsedExpr);
            const wantCrim = role === "innocent" ? false : true;
            // Generate masks for each row
            const rowMasks = masks.rowMask.map(rowMask => rowMask & mask);
            out.push({ kind: "UNIQUE_ROW_COUNT_EQ", rowMasks, wantCrim, numRows, countPerRow });
        }
        else if (func === "compare") {
            const leftExprStr = args[0];
            const op = args[1].trim();
            const rightExprStr = args[2];
            // Extract role filter from left expression
            let leftExpr = leftExprStr;
            let leftRole = null;
            const leftRoleMatch = leftExprStr.match(/@(innocent|criminal)\s*$/i);
            if (leftRoleMatch) {
                leftRole = leftRoleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                leftExpr = leftExprStr.slice(0, leftRoleMatch.index).trim();
            }
            // Extract role filter from right expression
            let rightExpr = rightExprStr;
            let rightRole = null;
            const rightRoleMatch = rightExprStr.match(/@(innocent|criminal)\s*$/i);
            if (rightRoleMatch) {
                rightRole = rightRoleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
                rightExpr = rightExprStr.slice(0, rightRoleMatch.index).trim();
            }
            // Both sides should have the same role filter
            const role = leftRole || rightRole;
            const wantCrim = role === "innocent" ? false : true;
            const leftTokens = tokenize(leftExpr);
            const leftParser = new DSLParser(leftTokens, board);
            const leftParsedExpr = leftParser.parseExpression();
            const { mask: leftMask } = leftParser.evalSetExpr(leftParsedExpr);
            const rightTokens = tokenize(rightExpr);
            const rightParser = new DSLParser(rightTokens, board);
            const rightParsedExpr = rightParser.parseExpression();
            const { mask: rightMask } = rightParser.evalSetExpr(rightParsedExpr);
            out.push({ kind: "COMPARE", leftMask, rightMask, wantCrim, op });
        }
    }
    return out;
}
function compileClues(clues, board) {
    // Try DSL parser first
    const out = [];
    for (const clue of clues) {
        try {
            const constraints = compileDSL(clue, board);
            if (constraints.length > 0) {
                out.push(...constraints);
            }
        }
        catch (e) {
            // Skip clues that fail to parse
        }
    }
    return out;
}
exports.compileClues = compileClues;
