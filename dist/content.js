"use strict";
(() => {
  // src/board.ts
  var COLS = 4;
  var ROWS = 5;
  var N_CELLS = COLS * ROWS;
  var FULL_MASK = (1 << N_CELLS) - 1;
  function indexToPos(i) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return String.fromCharCode("A".charCodeAt(0) + col) + String(row + 1);
  }
  function buildMasks() {
    const rowMask = Array(ROWS).fill(0);
    const colMask = Array(COLS).fill(0);
    const edgeMask = 0;
    const cornerMask = 0;
    const nbrMask = Array(N_CELLS).fill(0);
    const orthoNbrMask = Array(N_CELLS).fill(0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        rowMask[r] |= 1 << idx;
        colMask[c] |= 1 << idx;
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        let nm = 0;
        let onm = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0)
              continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) {
              const j = rr * COLS + cc;
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
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)
            m |= 1 << r * COLS + c;
        }
      return m;
    })();
    const _cornerMask = (() => {
      return 1 << 0 * COLS + 0 | 1 << 0 * COLS + (COLS - 1) | 1 << (ROWS - 1) * COLS + 0 | 1 << (ROWS - 1) * COLS + (COLS - 1);
    })();
    return {
      rowMask,
      colMask,
      nbrMask,
      orthoNbrMask,
      edgeMask: _edgeMask,
      cornerMask: _cornerMask
    };
  }
  function buildDefaultBoard() {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const id = r * COLS + c;
        cells.push({ id, name: `P${id + 1}`, profession: "", pos: indexToPos(id), status: "UNKNOWN" });
      }
    }
    return cells;
  }

  // src/parser_dsl.ts
  var masks = buildMasks();
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const c = input[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
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
      if (/[+&|@~,]/.test(c)) {
        tokens.push({ type: "OP", value: c });
        i++;
        continue;
      }
      if (/\d/.test(c)) {
        let num = "";
        while (i < input.length && /\d/.test(input[i])) {
          num += input[i];
          i++;
        }
        tokens.push({ type: "NUMBER", value: num });
        continue;
      }
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
  var DSLParser = class {
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
      if (tok.type === "LPAREN") {
        this.consume();
        const expr = this.parseUnion();
        this.expect(")");
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
              return { type: "primitive", mask: FULL_MASK, role: null };
            }
            if (kind === "edges") {
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
          if (row1 === row2) {
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
          } else if (col1 === col2) {
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
        expr = expr;
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
  };
  function compileDSL(dslInput, board) {
    const lines = dslInput.split("+").map((s) => s.trim()).filter((s) => s);
    const out = [];
    for (const line of lines) {
      const constraintMatch = line.match(/^(\w+)\s*\((.*)\)$/);
      if (!constraintMatch) {
        continue;
      }
      const [, funcName, argsStr] = constraintMatch;
      const func = funcName.toLowerCase();
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
        } else {
          current += c;
        }
      }
      if (current.trim())
        args.push(current.trim());
      if (func === "eq") {
        const k = parseInt(args[0], 10);
        const exprStr = args[1];
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
      } else if (func === "gte") {
        const k = parseInt(args[0], 10);
        const exprStr = args[1];
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
      } else if (func === "parity") {
        const parity = args[0].toLowerCase();
        const odd = parity === "odd";
        const exprStr = args[1];
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
      } else if (func === "connected") {
        const exprStr = args[0];
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
      } else if (func === "in_group") {
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
      } else if (func === "unique_row_count_eq") {
        const numRows = parseInt(args[0], 10);
        const countPerRow = parseInt(args[1], 10);
        const exprStr = args[2];
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
        const rowMasks = masks.rowMask.map((rowMask) => rowMask & mask);
        out.push({ kind: "UNIQUE_ROW_COUNT_EQ", rowMasks, wantCrim, numRows, countPerRow });
      } else if (func === "compare") {
        const leftExprStr = args[0];
        const op = args[1].trim();
        const rightExprStr = args[2];
        let leftExpr = leftExprStr;
        let leftRole = null;
        const leftRoleMatch = leftExprStr.match(/@(innocent|criminal)\s*$/i);
        if (leftRoleMatch) {
          leftRole = leftRoleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
          leftExpr = leftExprStr.slice(0, leftRoleMatch.index).trim();
        }
        let rightExpr = rightExprStr;
        let rightRole = null;
        const rightRoleMatch = rightExprStr.match(/@(innocent|criminal)\s*$/i);
        if (rightRoleMatch) {
          rightRole = rightRoleMatch[1].toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
          rightExpr = rightExprStr.slice(0, rightRoleMatch.index).trim();
        }
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
    const out = [];
    for (const clue of clues) {
      try {
        const constraints = compileDSL(clue, board);
        if (constraints.length > 0) {
          out.push(...constraints);
        }
      } catch (e) {
      }
    }
    return out;
  }

  // src/parser_rules.ts
  var templates = [
    // ============================================================================
    // COMPLEX DIRECTIONAL PATTERNS (checked first - most specific)
    // ============================================================================
    {
      pattern: "the only {role} {dir} {name} is {dir2} {name2}",
      dsl: "eq(1, {dir}({name})@{role}) + eq(1, ({dir}({name}) & {dir2}({name2}))@{role})"
    },
    // ============================================================================
    // BASIC PATTERNS: Name in group
    // ============================================================================
    {
      pattern: "{name} is one of {k} {role} in {rowcol} {rowcolval}",
      dsl: "eq({k}, area({rowcol}({rowcolval}))@{role}) + in_group({name}, area({rowcol}({rowcolval}))@{role})"
    },
    // ============================================================================
    // EXACT COUNT IN AREA
    // ============================================================================
    {
      pattern: "exactly {k} {role} in {rowcol} {rowcolval}",
      dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})"
    },
    {
      pattern: "there are {k} {role} on the edges",
      dsl: "eq({k}, area(edges)@{role})"
    },
    {
      pattern: "there are exactly {k} {role} in {rowcol} {rowcolval}",
      dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})"
    },
    {
      pattern: "there are exactly {k} {role} {dir} {name}",
      dsl: "eq({k}, {dir}({name})@{role})"
    },
    {
      pattern: "there is only one {role} in {rowcol} {rowcolval}",
      dsl: "eq(1, area({rowcol}({rowcolval}))@{role})"
    },
    {
      pattern: "there is only one {role} {dir} {name}",
      dsl: "eq(1, {dir}({name})@{role})"
    },
    {
      pattern: "each row has at least {k} {role}",
      dsl: "gte({k}, area(row(1))@{role}) + gte({k}, area(row(2))@{role}) + gte({k}, area(row(3))@{role}) + gte({k}, area(row(4))@{role}) + gte({k}, area(row(5))@{role})"
    },
    {
      pattern: "each column has at least {k} {role}",
      dsl: "gte({k}, area(col(A))@{role}) + gte({k}, area(col(B))@{role}) + gte({k}, area(col(C))@{role}) + gte({k}, area(col(D))@{role})"
    },
    // ============================================================================
    // NEIGHBOR COUNT
    // ============================================================================
    {
      pattern: "{name} has exactly {k} {role} neighbors",
      dsl: "eq({k}, neighbor({name})@{role})"
    },
    {
      pattern: "there's {parity} number of {role} neighboring {name}",
      dsl: "parity({parity}, neighbor({name})@{role})"
    },
    {
      pattern: "{name} has {parity} number of {role} neighbors",
      dsl: "parity({parity}, neighbor({name})@{role})"
    },
    // ============================================================================
    // NEIGHBORS IN AREA
    // ============================================================================
    {
      pattern: "exactly {k} of the {total} {role} neighboring {name} are in {rowcol} {rowcolval}",
      dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    // ============================================================================
    // AREA NEIGHBORS TARGET
    // ============================================================================
    {
      pattern: "exactly {k} {role} in {rowcol} {rowcolval} is neighboring {name}",
      dsl: "eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    {
      pattern: "the only {role} in {rowcol} {rowcolval} is {name}'s neighbor",
      dsl: "eq(1, area({rowcol}({rowcolval})@{role})) + in_group(area({rowcol}({rowcolval})@{role}), neighbor({name})@{role})"
    },
    // ============================================================================
    // PARITY IN AREA
    // ============================================================================
    {
      pattern: "{parity} number of {role} in {rowcol} {rowcolval}",
      dsl: "parity({parity}, area({rowcol}({rowcolval}))@{role})"
    },
    {
      pattern: "there's an {parity} number of {role} in {rowcol} {rowcolval}",
      dsl: "parity({parity}, area({rowcol}({rowcolval}))@{role})"
    },
    {
      pattern: "an {parity} number of {role} in {rowcol} {rowcolval} are {name}'s neighbors",
      dsl: "parity({parity}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    {
      pattern: "there's an {parity} number of {role} {dir} {name}",
      dsl: "parity({parity}, {dir}({name})@{role})"
    },
    {
      pattern: "an {parity} number of {role} {dir} {name}",
      dsl: "parity({parity}, {dir}({name})@{role})"
    },
    // ============================================================================
    // PARITY NEIGHBORS
    // ============================================================================
    {
      pattern: "there's an {parity} number of {role} neighboring {name}",
      dsl: "parity({parity}, neighbor({name})@{role})"
    },
    {
      pattern: "an {parity} number of {role} neighboring {name}",
      dsl: "parity({parity}, neighbor({name})@{role})"
    },
    {
      pattern: "{parity} number of {role} neighboring {name}",
      dsl: "parity({parity}, neighbor({name})@{role})"
    },
    // ============================================================================
    // PARITY IN DIRECTION & NEIGHBORS
    // ============================================================================
    {
      pattern: "an {parity} number of {role} {dir} {name} neighbor {name2}",
      dsl: "parity({parity}, ({dir}({name}) & neighbor({name2}))@{role})"
    },
    {
      pattern: "{parity} number of {role} {dir} {name} neighbor {name2}",
      dsl: "parity({parity}, ({dir}({name}) & neighbor({name2}))@{role})"
    },
    {
      pattern: "an {parity} number of {role} on the edges neighbor {name}",
      dsl: "parity({parity}, (area(edges) & neighbor({name}))@{role})"
    },
    // ============================================================================
    // NEIGHBORS IN DIRECTION
    // ============================================================================
    {
      pattern: "only {k} of the {total} {role} neighboring {name} {be} {dir} {name2}",
      dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, ({dir}({name2}) & neighbor({name}))@{role})"
    },
    {
      pattern: "only one of the {k} {role} neighboring {name} {be} {dir} {name2}",
      dsl: "eq({k}, neighbor({name})@{role}) + eq(1, ({dir}({name2}) & neighbor({name}))@{role})"
    },
    // ============================================================================
    // CONNECTED IN AREA (DIRECTIONAL)
    // ============================================================================
    {
      pattern: "both {role} {dir} {name} are connected",
      dsl: "eq(2, {dir}({name})@{role}) + connected({dir}({name})@{role})"
    },
    {
      pattern: "all {role} {dir} {name} are connected",
      dsl: "connected({dir}({name})@{role})"
    },
    {
      pattern: "all {role} in {rowcol} {rowcolval} are connected",
      dsl: "connected(area({rowcol}({rowcolval}))@{role})"
    },
    // ============================================================================
    // TOTAL COUNT
    // ============================================================================
    {
      pattern: "there are {k} {role} in total",
      dsl: "eq({k}, area(all)@{role})"
    },
    // ============================================================================
    // ROW/COLUMN PROPERTY CONSTRAINTS (e.g., "Only one row has exactly 3 criminals")
    // ============================================================================
    {
      pattern: "only {num} row has exactly {k} {role}",
      dsl: "unique_row_count_eq({num}, {k}, area(all)@{role})"
    },
    {
      pattern: "only {num} column has exactly {k} {role}",
      dsl: "SKIP"
      // Column version not yet needed
    },
    {
      pattern: "{rowcol} {rowcolval} is the only {rowcol2} with exactly {k} {role}",
      dsl: "eq({k}, area({rowcol}({rowcolval}))@{role})"
    },
    // ============================================================================
    // NEIGHBORS IN COMMON
    // ============================================================================
    {
      pattern: "{name} is one of {name2}'s {k} {role} neighbors",
      dsl: "eq({k}, neighbor({name2})@{role}) + in_group({name}, neighbor({name2})@{role})"
    },
    {
      pattern: "{name} is one of {k} {role} {dir} {name2}",
      dsl: "eq({k}, {dir}({name2})@{role}) + in_group({name}, {dir}({name2})@{role})"
    },
    {
      pattern: "{name} and {name2} have {k} {role} neighbors in common",
      dsl: "eq({k}, (neighbor({name}) & neighbor({name2}))@{role})"
    },
    {
      pattern: "{name} and {name2} have no {role} neighbors in common",
      dsl: "eq(0, (neighbor({name}) & neighbor({name2}))@{role})"
    },
    // ============================================================================
    // EXACT COUNT WITH DIRECTIONAL NAME
    // ============================================================================
    {
      pattern: "{name} is one of {k} {role} {dir} {name2}",
      dsl: "eq({k}, {dir}({name2})@{role}) + in_group({name}, {dir}({name2})@{role})"
    },
    {
      pattern: "there are exactly {k} {role} {dir} {name}",
      dsl: "eq({k}, {dir}({name})@{role})"
    },
    {
      pattern: "there are exactly {k} {role} in between {name} and {name2}",
      dsl: "eq({k}, between({name}, {name2})@{role})"
    },
    // ============================================================================
    // "BETWEEN" PATTERNS
    // ============================================================================
    {
      pattern: "the only {role} in between {name} and {name2} is {name}'s neighbor",
      dsl: "eq(1, between({name}, {name2})@{role}) + in_group(between({name}, {name2})@{role}, neighbor({name})@{role})"
    },
    {
      pattern: "the only {role} in between {name} and {name2} is {name2}'s neighbor",
      dsl: "eq(1, between({name}, {name2})@{role}) + in_group(between({name}, {name2})@{role}, neighbor({name2})@{role})"
    },
    {
      pattern: "there's an {parity} number of {role} in between {name} and {name2}",
      dsl: "parity({parity}, between({name}, {name2})@{role})"
    },
    {
      pattern: "an {parity} number of {role} in between {name} and {name2}",
      dsl: "parity({parity}, between({name}, {name2})@{role})"
    },
    // ============================================================================
    // EXACTLY K OF TOTAL ON EDGES
    // ============================================================================
    {
      pattern: "exactly {k} of {name}'s {total} {role} neighbors also neighbor {name2}",
      dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & neighbor({name2}))@{role})"
    },
    {
      pattern: "exactly {k} of the {total} {role} on the edges are {name}'s neighbors",
      dsl: "eq({total}, area(edges)@{role}) + eq({k}, (area(edges) & neighbor({name}))@{role})"
    },
    {
      pattern: "{k} of {name}'s neighbors on the edges are {role}",
      dsl: "eq({k}, (neighbor({name}) & area(edges))@{role})"
    },
    // ============================================================================
    // "THERE ARE NO" PATTERNS
    // ============================================================================
    {
      pattern: "there are no {role} in {rowcol} {rowcolval} who neighbor {name}",
      dsl: "eq(0, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    // ============================================================================
    // NEIGHBOR PATTERNS WITH "ONLY X OF Y"
    // ============================================================================
    {
      pattern: "only {k} of the {total} {role} neighboring {name} is {name2}'s neighbor",
      dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & neighbor({name2}))@{role})"
    },
    {
      pattern: "only {k} of the {total} {role} in {rowcol} {rowcolval} are {name}'s neighbors",
      dsl: "eq({total}, area({rowcol}({rowcolval}))@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    {
      pattern: "only {k} of the {total} {role} in {rowcol} {rowcolval} is {name}'s neighbor",
      dsl: "eq({total}, area({rowcol}({rowcolval}))@{role}) + eq({k}, (area({rowcol}({rowcolval})) & neighbor({name}))@{role})"
    },
    {
      pattern: "only {k} of the {total} {role} neighboring {name} {be} in {rowcol} {rowcolval}",
      dsl: "eq({total}, neighbor({name})@{role}) + eq({k}, (neighbor({name}) & area({rowcol}({rowcolval})))@{role})"
    },
    // ============================================================================
    // PROFESSION PATTERNS
    // ============================================================================
    {
      pattern: "{k} {profession}s have an {role} directly to the right of them",
      dsl: "SKIP"
      // Requires profession-based constraint system
    },
    {
      pattern: "exactly {k} of us {total} {profession}s has an {role} directly to the right of them",
      dsl: "SKIP"
      // Requires profession-based constraint system
    },
    {
      pattern: "there are as many {role} {profession}s as there are {role} {profession2}s",
      dsl: "SKIP"
      // Requires profession-based constraint system
    },
    // ============================================================================
    // COMPARISON CONSTRAINTS
    // ============================================================================
    {
      pattern: "there are more {role} in {rowcol} {rowcolval} than {rowcol2} {rowcolval2}",
      dsl: "compare(area({rowcol}({rowcolval}))@{role}, >, area({rowcol2}({rowcolval2}))@{role})"
    },
    {
      pattern: "there's an equal number of {role} in {rowcol} {rowcolval} and {rowcol2} {rowcolval2}",
      dsl: "compare(area({rowcol}({rowcolval}))@{role}, ==, area({rowcol2}({rowcolval2}))@{role})"
    },
    {
      pattern: "there's an equal number of {role} in {rowcol}s {rowcolval} and {rowcolval2}",
      dsl: "compare(area({rowcol}({rowcolval}))@{role}, ==, area({rowcol}({rowcolval2}))@{role})"
    }
  ];
  var tokenRegex = {
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
    profession2: "(\\w+)"
  };
  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
  }
  function buildMatcher(pattern) {
    const tokens = [];
    let out = "";
    let last = 0;
    const re = /\{(\w+)\}/g;
    let m;
    while (m = re.exec(pattern)) {
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
  function normalizeClue(s) {
    let out = s.trim().replace(/\s+/g, " ");
    out = out.replace(/[.?!]$/g, "");
    return out;
  }
  function normalizeVars(vars) {
    const out = { ...vars };
    const wordToNum = { one: "1", two: "2", three: "3", four: "4", five: "5" };
    if (out.num && wordToNum[out.num.toLowerCase()]) {
      out.num = wordToNum[out.num.toLowerCase()];
    }
    if (out.role) {
      out.role = out.role.toLowerCase().startsWith("innoc") ? "innocent" : "criminal";
    }
    if (out.parity)
      out.parity = out.parity.toLowerCase();
    if (out.dir)
      out.dir = out.dir.toLowerCase();
    if (out.dir2)
      out.dir2 = out.dir2.toLowerCase();
    if (out.name)
      out.name = out.name.toLowerCase();
    if (out.name2)
      out.name2 = out.name2.toLowerCase();
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
    if (out.be)
      out.be = out.be.toLowerCase();
    return out;
  }
  function fillTemplate(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? "");
  }
  function compileClues2(clues, board) {
    const out = [];
    let disabledClues = /* @__PURE__ */ new Set();
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem("cluesbysam_disabled_clues");
        if (stored) {
          disabledClues = new Set(JSON.parse(stored));
        }
      }
    } catch (e) {
    }
    let customRules = [];
    try {
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem("cluesbysam_custom_rules");
        if (stored) {
          customRules = JSON.parse(stored);
        }
      }
    } catch (e) {
    }
    const matchers = templates.map((t) => ({ ...t, ...buildMatcher(t.pattern) }));
    for (const clue of clues) {
      const normalized = normalizeClue(clue);
      if (disabledClues.has(clue)) {
        continue;
      }
      let matched = false;
      for (const customRule of customRules) {
        if (!customRule.enabled)
          continue;
        if (normalizeClue(customRule.clue) === normalized) {
          try {
            const constraints = compileClues([customRule.dsl], board);
            if (constraints.length > 0) {
              out.push(...constraints);
              matched = true;
              break;
            }
          } catch (e) {
            console.error("Custom rule DSL error:", customRule, e);
          }
        }
      }
      if (matched)
        continue;
      for (const t of matchers) {
        const m = normalized.match(t.regex);
        if (!m)
          continue;
        if (t.dsl === "SKIP") {
          continue;
        }
        const vars = {};
        t.tokens.forEach((token, i) => {
          vars[token] = m[i + 1];
        });
        const normalizedVars = normalizeVars(vars);
        const dsl = fillTemplate(t.dsl, normalizedVars);
        const constraints = compileClues([dsl], board);
        if (constraints.length > 0) {
          out.push(...constraints);
          matched = true;
          break;
        }
      }
    }
    return out;
  }

  // src/solver.ts
  var masks2 = buildMasks();
  var popcountCache = /* @__PURE__ */ new Map();
  function bitCount(x) {
    const v = x >>> 0;
    const cached = popcountCache.get(v);
    if (cached !== void 0)
      return cached;
    let y = v;
    y = y - (y >>> 1 & 1431655765);
    y = (y & 858993459) + (y >>> 2 & 858993459);
    const res = (y + (y >>> 4) & 252645135) * 16843009 >>> 24;
    popcountCache.set(v, res);
    return res;
  }
  function isConnected(mask) {
    const first = mask & -mask;
    if (first === 0)
      return false;
    const start = Math.floor(Math.log2(first));
    let visited = 0;
    const stack = [start];
    while (stack.length > 0) {
      const u = stack.pop();
      if ((visited >> u & 1) === 1)
        continue;
      visited |= 1 << u;
      const nbrs = masks2.orthoNbrMask[u] & mask;
      let m = nbrs;
      while (m) {
        const lb = m & -m;
        const j = Math.floor(Math.log2(lb));
        if ((visited >> j & 1) === 0)
          stack.push(j);
        m &= m - 1;
      }
    }
    return visited === mask;
  }
  function evalConstraint(cons, C) {
    switch (cons.kind) {
      case "COUNT_EQ": {
        const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
        return bitCount(bits) === cons.k;
      }
      case "COUNT_GTE": {
        const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
        return bitCount(bits) >= cons.k;
      }
      case "COUNT_LTE": {
        const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
        return bitCount(bits) <= cons.k;
      }
      case "PARITY": {
        const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
        return bitCount(bits) % 2 === (cons.odd ? 1 : 0);
      }
      case "COMPARE": {
        const left = cons.wantCrim ? bitCount(C & cons.leftMask) : bitCount(~C & FULL_MASK & cons.leftMask);
        const right = cons.wantCrim ? bitCount(C & cons.rightMask) : bitCount(~C & FULL_MASK & cons.rightMask);
        if (cons.op === ">")
          return left > right;
        if (cons.op === "<")
          return left < right;
        return left === right;
      }
      case "UNIQUE_COUNT_EQ": {
        let hits = 0;
        for (const gm of cons.groupMasks) {
          const bits = cons.wantCrim ? C & gm : ~C & FULL_MASK & gm;
          if (bitCount(bits) === cons.k)
            hits++;
          if (hits > 1)
            return false;
        }
        return hits === 1;
      }
      case "NEIGHBOR_COUNT": {
        if (cons.qualifier === "IN_ROW" && cons.qualifierMask) {
          const bits = cons.wantCrim ? C & cons.mask & cons.qualifierMask : ~C & FULL_MASK & cons.mask & cons.qualifierMask;
          return bitCount(bits) === cons.k;
        }
        return false;
      }
      case "CONN_ALL": {
        const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
        if (bits === 0)
          return false;
        return isConnected(bits);
      }
      case "NAME_STATUS_IN_GROUP": {
        const has = (C >> cons.nameIdx & 1) === 1;
        if (cons.wantCrim && !has)
          return false;
        if (!cons.wantCrim && has)
          return false;
        if (cons.k !== void 0) {
          const bits = cons.wantCrim ? C & cons.mask : ~C & FULL_MASK & cons.mask;
          return bitCount(bits) === cons.k;
        }
        return true;
      }
      case "INTERSECTION_EMPTY": {
        const aBits = cons.wantCrim ? C & cons.maskA : ~C & FULL_MASK & cons.maskA;
        const bBits = cons.wantCrim ? C & cons.maskB : ~C & FULL_MASK & cons.maskB;
        return (aBits & bBits) === 0;
      }
      case "UNIQUE_ROW_COUNT_EQ": {
        let hits = 0;
        for (const rowMask of cons.rowMasks) {
          const bits = cons.wantCrim ? C & rowMask : ~C & FULL_MASK & rowMask;
          if (bitCount(bits) === cons.countPerRow)
            hits++;
          if (hits > cons.numRows)
            return false;
        }
        return hits === cons.numRows;
      }
    }
    return false;
  }
  function solve(board) {
    function enumerateSolutions(b) {
      let knownCrimMask = 0;
      let knownInnoMask = 0;
      for (const cell of b.cells) {
        if (cell.status === "CRIMINAL")
          knownCrimMask |= 1 << cell.id;
        if (cell.status === "INNOCENT")
          knownInnoMask |= 1 << cell.id;
      }
      const knownMask = knownCrimMask | knownInnoMask;
      const unknownMask = ~knownMask & FULL_MASK;
      const constraints = compileClues2(b.clues, b);
      const unknownIndices = [];
      for (let i = 0; i < N_CELLS; i++)
        if ((unknownMask >> i & 1) === 1)
          unknownIndices.push(i);
      const k = unknownIndices.length;
      const solutions = [];
      const maxIter = 1 << k;
      for (let mask = 0; mask < maxIter; mask++) {
        let C = knownCrimMask;
        for (let j = 0; j < k; j++)
          if ((mask >> j & 1) === 1)
            C |= 1 << unknownIndices[j];
        if ((C & knownInnoMask) !== 0)
          continue;
        let ok = true;
        for (const cons of constraints) {
          if (!evalConstraint(cons, C)) {
            ok = false;
            break;
          }
        }
        if (ok)
          solutions.push(C);
      }
      return solutions;
    }
    const baseSolutions = enumerateSolutions(board);
    if (baseSolutions.length === 0)
      throw new Error("No solutions found for given clues and statuses");
    const res = { forced: [], numSolutions: baseSolutions.length };
    const knownMaskNow = board.cells.reduce((m, c) => m | (c.status === "CRIMINAL" || c.status === "INNOCENT" ? 1 << c.id : 0), 0);
    for (let idx = 0; idx < N_CELLS; idx++) {
      const isKnown = (knownMaskNow >> idx & 1) === 1;
      if (isKnown)
        continue;
      let all1 = true;
      let all0 = true;
      for (const C of baseSolutions) {
        const b = C >> idx & 1;
        if (b === 1)
          all0 = false;
        else
          all1 = false;
      }
      if (all1)
        res.forced.push({ id: idx, status: "CRIMINAL", reason: `Always criminal in ${baseSolutions.length} solutions` });
      if (all0)
        res.forced.push({ id: idx, status: "INNOCENT", reason: `Always innocent in ${baseSolutions.length} solutions` });
    }
    if (res.forced.length > 0) {
      res.forced.sort((a, b) => {
        const degA = bitCount(masks2.nbrMask[a.id]);
        const degB = bitCount(masks2.nbrMask[b.id]);
        return degB - degA;
      });
    }
    return res;
  }

  // src/content.ts
  function isDebugEnabled() {
    try {
      return window.localStorage.getItem("cluesbysam_debug") === "1";
    } catch {
      return false;
    }
  }
  function debugLog(...args) {
    if (isDebugEnabled())
      console.debug(...args);
  }
  function infoLog(...args) {
    if (isDebugEnabled())
      console.info(...args);
  }
  function textOf(el) {
    if (!el)
      return "";
    return (el.textContent || "").trim().replace(/\u00A0/g, " ");
  }
  function findClueStrings() {
    debugLog("CluesBySam Solver: searching for clue strings...");
    const hints = [];
    const backHints = document.querySelectorAll(".card-back .hint, .card .hint");
    backHints.forEach((h) => {
      const t = textOf(h);
      if (t)
        hints.push(t);
    });
    debugLog(`CluesBySam Solver: found ${hints.length} hints on card-backs`);
    if (hints.length > 0)
      return hints;
    const selectors = [".clues", ".clue-list", ".clues-list", ".clue", "[data-clue]", ".hint-list"];
    for (const s of selectors) {
      const container = document.querySelector(s);
      if (container) {
        const items = Array.from(container.querySelectorAll("li, .clue-item, p, div"));
        const texts = items.map((it) => textOf(it)).filter((t) => t.length > 3);
        if (texts.length > 0)
          return texts;
      }
    }
    const nodes = Array.from(document.querySelectorAll("p, div, li"));
    const clues = [];
    for (const n of nodes) {
      const t = textOf(n);
      if (/innocent|criminal|connected|neighbors?|row|column|only one|exactly|odd number/i.test(t) && t.length < 240 && t.length > 8)
        clues.push(t);
    }
    debugLog(`CluesBySam Solver: fallback found ${clues.length} candidate clue nodes`);
    return clues.slice(0, 50);
  }
  function findCardElements() {
    debugLog("CluesBySam Solver: locating card elements (.card-grid #grid .card-container .card)");
    const grid = document.querySelector(".card-grid") || document.getElementById("grid");
    if (grid) {
      const cards = Array.from(grid.querySelectorAll(".card-container .card"));
      debugLog(`CluesBySam Solver: found ${cards.length} cards in grid`);
      if (cards.length >= 10)
        return cards;
    }
    const fallback = Array.from(document.querySelectorAll(".card, .person-card, .grid-item, li"));
    debugLog(`CluesBySam Solver: fallback found ${fallback.length} card-like elements`);
    return Array.from(document.querySelectorAll(".card, .person-card, .grid-item, li"));
  }
  function parseCard(el, idx) {
    const coordEl = el.querySelector(".coord");
    const pos = coordEl ? textOf(coordEl) : void 0;
    const nameEl = el.querySelector(".name h3.name, .name h3");
    const name = nameEl ? textOf(nameEl) : `P${idx + 1}`;
    const profEl = el.querySelector(".profession, .job, .role");
    const profession = profEl ? textOf(profEl) : void 0;
    const classList = (el.getAttribute("class") || "").toLowerCase();
    let status = "UNKNOWN";
    if (classList.includes("innocent"))
      status = "INNOCENT";
    if (classList.includes("criminal"))
      status = "CRIMINAL";
    const back = el.querySelector(".card-back");
    if (back) {
      const backCls = (back.getAttribute("class") || "").toLowerCase();
      if (backCls.includes("innocent"))
        status = "INNOCENT";
      if (backCls.includes("criminal"))
        status = "CRIMINAL";
    }
    return { id: idx, name, profession, status, pos };
  }
  function buildBoardSnapshotFromDOM() {
    const cardEls = findCardElements();
    const parsed = [];
    for (let i = 0; i < Math.min(cardEls.length, 20); i++) {
      const el = cardEls[i];
      parsed.push(parseCard(el, i));
    }
    if (parsed.length < 20) {
      const fallback = buildDefaultBoard();
      for (let i = 0; i < 20; i++) {
        if (!parsed[i])
          parsed[i] = fallback[i];
      }
    }
    const cells = parsed.map((p, i) => ({ id: i, name: p.name || `P${i + 1}`, profession: p.profession || "", status: p.status || "UNKNOWN", pos: p.pos || void 0 }));
    const clues = findClueStrings();
    return { cells, clues };
  }
  var OVERLAY_ID = "cluesbysam-solver-overlay";
  var RULES_PANEL_ID = "cluesbysam-rules-panel";
  function getCustomRules() {
    const stored = localStorage.getItem("cluesbysam_custom_rules");
    return stored ? JSON.parse(stored) : [];
  }
  function saveCustomRules(rules) {
    localStorage.setItem("cluesbysam_custom_rules", JSON.stringify(rules));
  }
  function ensureOverlay() {
    let ov = document.getElementById(OVERLAY_ID);
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
      const rulesBtn = document.createElement("button");
      rulesBtn.textContent = "\u2699 Rules";
      rulesBtn.style.cssText = "margin-top:8px;padding:4px 8px;background:#444;color:#fff;border:1px solid #666;border-radius:4px;cursor:pointer;font-size:12px;";
      rulesBtn.onclick = () => toggleRulesPanel();
      ov.appendChild(rulesBtn);
      debugLog("CluesBySam Solver: overlay created");
    }
    return ov;
  }
  function toggleRulesPanel() {
    let panel = document.getElementById(RULES_PANEL_ID);
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
    closeBtn.textContent = "\u2715";
    closeBtn.style.cssText = "float:right;background:#c00;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;";
    closeBtn.onclick = () => panel?.remove();
    panel.appendChild(closeBtn);
    const title = document.createElement("h3");
    title.textContent = "Clue Translation & Rules";
    title.style.cssText = "margin:0 0 16px 0;color:#fff;";
    panel.appendChild(title);
    const snapshot = buildBoardSnapshotFromDOM();
    renderClueTranslations(panel, snapshot);
    renderCustomRuleForm(panel);
    document.body.appendChild(panel);
  }
  function renderClueTranslations(container, snapshot) {
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
    let disabledClues;
    try {
      const stored = localStorage.getItem("cluesbysam_disabled_clues");
      disabledClues = stored ? new Set(JSON.parse(stored)) : /* @__PURE__ */ new Set();
    } catch {
      disabledClues = /* @__PURE__ */ new Set();
    }
    snapshot.clues.forEach((clue, idx) => {
      const isDisabled = disabledClues.has(clue);
      const clueDiv = document.createElement("div");
      clueDiv.style.cssText = `margin-bottom:12px;padding:8px;background:#2a2a2a;border-radius:4px;border-left:3px solid #555;opacity:${isDisabled ? "0.5" : "1"};`;
      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = isDisabled ? "\u2610" : "\u2611";
      toggleBtn.style.cssText = "padding:2px 6px;margin-right:8px;background:#666;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:12px;";
      toggleBtn.title = isDisabled ? "Enable clue" : "Disable clue (grey out)";
      toggleBtn.onclick = () => {
        if (isDisabled) {
          disabledClues.delete(clue);
        } else {
          disabledClues.add(clue);
        }
        localStorage.setItem("cluesbysam_disabled_clues", JSON.stringify([...disabledClues]));
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
        const constraints = compileClues2([clue], snapshot);
        const dslDiv = document.createElement("div");
        dslDiv.style.cssText = "margin-top:4px;margin-left:22px;";
        if (constraints.length === 0) {
          dslDiv.textContent = "\u274C NOT TRANSLATED (no matching pattern)";
          dslDiv.style.color = "#ff6b6b";
        } else {
          dslDiv.innerHTML = `<strong style="color:#51cf66;">\u2713 Constraints (${constraints.length}):</strong>`;
          const detailsDiv = document.createElement("div");
          detailsDiv.style.cssText = "margin-top:4px;padding:6px;background:#1a1a1a;border-radius:2px;font-size:11px;color:#aaa;font-family:monospace;white-space:pre-wrap;word-break:break-all;";
          const constraintsSummary = constraints.map((c, i) => {
            const lines = [`[${i}] ${c.kind}`];
            Object.entries(c).forEach(([key, value]) => {
              if (key !== "kind") {
                if (typeof value === "number") {
                  lines.push(`  ${key}: ${value}`);
                } else if (key === "op") {
                  lines.push(`  ${key}: "${value}"`);
                } else {
                  lines.push(`  ${key}: ${value}`);
                }
              }
            });
            return lines.join("\n");
          }).join("\n\n");
          detailsDiv.textContent = constraintsSummary;
          dslDiv.appendChild(detailsDiv);
        }
        clueDiv.appendChild(dslDiv);
      } catch (e) {
        const errorDiv = document.createElement("div");
        errorDiv.textContent = `\u274C ERROR: ${e}`;
        errorDiv.style.cssText = "margin-top:4px;margin-left:22px;color:#ff6b6b;";
        clueDiv.appendChild(errorDiv);
      }
      section.appendChild(clueDiv);
    });
    container.appendChild(section);
  }
  function renderCustomRuleForm(container) {
    const section = document.createElement("div");
    const heading = document.createElement("h4");
    heading.textContent = "Custom DSL Rules";
    heading.style.cssText = "margin:0 0 8px 0;color:#4fc3f7;";
    section.appendChild(heading);
    const desc = document.createElement("p");
    desc.textContent = "Add custom clue\u2192DSL mappings for patterns not supported by default rules.";
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
      const customRules2 = getCustomRules();
      customRules2.push({ clue, dsl, enabled: true });
      saveCustomRules(customRules2);
      clueInput.value = "";
      dslInput.value = "";
      toggleRulesPanel();
      toggleRulesPanel();
    };
    form.appendChild(addBtn);
    section.appendChild(form);
    const customRules = getCustomRules();
    if (customRules.length > 0) {
      const listHeading = document.createElement("h5");
      listHeading.textContent = "Saved Custom Rules";
      listHeading.style.cssText = "margin:16px 0 8px 0;color:#ffd43b;";
      section.appendChild(listHeading);
      customRules.forEach((rule, idx) => {
        const ruleDiv = document.createElement("div");
        ruleDiv.style.cssText = `margin-bottom:8px;padding:8px;background:${rule.enabled ? "#2a2a2a" : "#1a1a1a"};border-radius:4px;opacity:${rule.enabled ? "1" : "0.5"};`;
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = rule.enabled ? "\u2713" : "\u2717";
        toggleBtn.style.cssText = `padding:2px 6px;margin-right:8px;background:${rule.enabled ? "#51cf66" : "#666"};color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;`;
        toggleBtn.onclick = () => {
          customRules[idx].enabled = !customRules[idx].enabled;
          saveCustomRules(customRules);
          toggleRulesPanel();
          toggleRulesPanel();
        };
        ruleDiv.appendChild(toggleBtn);
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "\u{1F5D1}";
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
        textSpan.textContent = `"${rule.clue}" \u2192 ${rule.dsl}`;
        textSpan.style.cssText = "font-size:11px;";
        ruleDiv.appendChild(textSpan);
        section.appendChild(ruleDiv);
      });
    }
    container.appendChild(section);
  }
  function highlightForcedCells(forced) {
    const cardEls = findCardElements();
    for (let i = 0; i < cardEls.length && i < 20; i++) {
      const el = cardEls[i];
      if (!el)
        continue;
      el.style.outline = "";
      el.style.boxShadow = "";
    }
    for (const f of forced) {
      const el = cardEls[f.id];
      if (!el)
        continue;
      if (f.status === "CRIMINAL") {
        el.style.outline = "3px solid rgba(220,50,50,0.9)";
        el.style.boxShadow = "0 0 8px rgba(220,50,50,0.35)";
      } else {
        el.style.outline = "3px solid rgba(50,180,90,0.9)";
        el.style.boxShadow = "0 0 8px rgba(50,180,90,0.35)";
      }
    }
  }
  var lastSnapshotJson = "";
  var observer = null;
  var prevClues = [];
  var prevStatuses = {};
  function runSolveAndUpdateUI() {
    try {
      debugLog("CluesBySam Solver: runSolveAndUpdateUI called");
      const snapshot = buildBoardSnapshotFromDOM();
      debugLog("CluesBySam Solver: snapshot built", snapshot);
      const json = JSON.stringify({ cells: snapshot.cells.map((c) => ({ id: c.id, status: c.status })), cluesCount: snapshot.clues.length });
      if (json === lastSnapshotJson)
        return;
      lastSnapshotJson = json;
      try {
        if (isDebugEnabled()) {
          for (let i = 0; i < snapshot.clues.length; i++) {
            const c = snapshot.clues[i];
            const ast = compileClues2([c], snapshot);
            debugLog(`Clue[${i}]:`, c, "->", ast);
          }
        }
        const added = snapshot.clues.filter((x) => !prevClues.includes(x));
        const removed = prevClues.filter((x) => !snapshot.clues.includes(x));
        if (added.length)
          infoLog("CluesBySam Solver: new clues added:", added);
        if (removed.length)
          infoLog("CluesBySam Solver: clues removed:", removed);
        prevClues = snapshot.clues.slice();
      } catch (e) {
        console.error("CluesBySam Solver: error compiling clues", e);
      }
      const statusChanges = [];
      for (const c of snapshot.cells) {
        const prev2 = prevStatuses[String(c.id)];
        if (prev2 !== void 0 && prev2 !== c.status)
          statusChanges.push(`${c.pos || "?"} ${c.name}: ${prev2} -> ${c.status}`);
        prevStatuses[String(c.id)] = c.status;
      }
      if (statusChanges.length)
        infoLog("CluesBySam Solver: status changes detected:", statusChanges);
      const suggestion = solve(snapshot);
      debugLog("Solver suggestion:", suggestion);
      const ov = ensureOverlay();
      const lines = [];
      lines.push(`Solutions: ${suggestion.numSolutions}`);
      lines.push(`Forced: ${suggestion.forced.length}`);
      ov.innerText = lines.join("\n");
      let details = ov.querySelector(".solver-details");
      if (!details) {
        details = document.createElement("div");
        details.className = "solver-details";
        details.style.marginTop = "8px";
        details.style.maxHeight = "240px";
        details.style.overflow = "auto";
        details.style.fontSize = "12px";
        details.style.whiteSpace = "pre-wrap";
        ov.appendChild(details);
      }
      const clueText = snapshot.clues.length ? snapshot.clues.join("\n") : "(no clues found)";
      const statusLines = snapshot.cells.map((c) => `${c.pos || "?"} ${c.name}: ${c.status}`).join("\n");
      const prev = window.localStorage.getItem("cluesbysam_prev_statuses");
      const prevMap = prev ? JSON.parse(prev) : {};
      const nowMap = {};
      const newLabels = [];
      for (const c of snapshot.cells) {
        nowMap[String(c.id)] = c.status;
        if (prevMap[String(c.id)] && prevMap[String(c.id)] !== c.status)
          newLabels.push(`${c.pos || "?"} ${c.name}: ${prevMap[String(c.id)]} \u2192 ${c.status}`);
      }
      window.localStorage.setItem("cluesbysam_prev_statuses", JSON.stringify(nowMap));
      details.innerText = `CLUES:
${clueText}

STATUSES:
${statusLines}

NEW LABELS:
${newLabels.length ? newLabels.join("\n") : "(none)"}
`;
      highlightForcedCells(suggestion.forced);
    } catch (e) {
      console.error("Solver error:", e);
      if (isDebugEnabled()) {
        try {
          const snapshot = buildBoardSnapshotFromDOM();
          console.error("CluesBySam Solver: clues", snapshot.clues);
          console.error("CluesBySam Solver: statuses", snapshot.cells.map((c) => ({ id: c.id, pos: c.pos, name: c.name, status: c.status })));
          console.error("CluesBySam Solver: board state summary");
          let crimCount = 0, innocCount = 0, unknownCount = 0;
          for (const c of snapshot.cells) {
            if (c.status === "CRIMINAL")
              crimCount++;
            else if (c.status === "INNOCENT")
              innocCount++;
            else
              unknownCount++;
          }
          console.error(`  Criminals: ${crimCount}, Innocents: ${innocCount}, Unknown: ${unknownCount}`);
          for (let i = 0; i < snapshot.clues.length; i++) {
            const c = snapshot.clues[i];
            const ast = compileClues2([c], snapshot);
            console.error(`Clue[${i}] "${c}" constraints:`, JSON.stringify(ast, null, 2));
          }
        } catch (debugErr) {
          console.error("CluesBySam Solver: debug collection failed", debugErr);
        }
      }
    }
  }
  function attachObserver() {
    if (observer)
      return;
    observer = new MutationObserver((mutations) => {
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => runSolveAndUpdateUI());
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
    window.addEventListener("keydown", (ev) => {
      if (ev.ctrlKey && ev.shiftKey && ev.code === "KeyY") {
        const ov = document.getElementById(OVERLAY_ID);
        if (!ov)
          return;
        ov.style.display = ov.style.display === "none" ? "block" : "none";
        debugLog("CluesBySam Solver: toggled overlay visibility ->", ov.style.display);
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
