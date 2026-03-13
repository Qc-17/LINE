(function(G) {
"use strict";

//Defnisco i tipi di variabile
   
const TS = "string", TN = "number", TB = "bool";
const VT = "V", VF = "F";

//Errori
   
class LErr extends Error {
  constructor(code, msg) { super(msg); this.code = code; this.lmsg = msg; }
}
function lerr(code, msg) { throw new LErr(code, msg); }

//Valori
   
const mkS = v => ({ value: String(v),                       type: TS });
const mkN = v => ({ value: Number(v),                       type: TN });
const mkB = v => ({ value: (v === VT || v === true) ? VT : VF, type: TB });
const mkL = l => ({ value: l,                               type: TS });

function truthy(v) {
  if (!v) return false;
  if (v.type === TB) return v.value === VT;
  if (v.type === TN) return v.value !== 0;
  return v.value !== "" && v.value !== VF;
}

//Qui def liste
   
class LList {
  constructor(items = []) { this.items = items; }

  display(withTags = false) {
    const parts = this.items.map(it => {
      const v = it.value instanceof LList ? it.value.display(withTags) : String(it.value);
      return (withTags && it.tags.length) ? it.tags.join(" | ") + " | " + v : v;
    });
    return "[" + parts.join(" ; ") + "]";
  }

  at(idx) {
    if (idx < 0) idx = this.items.length + idx;
    if (idx < 0 || idx >= this.items.length)
      lerr("LIST_OUT_OF_RANGE", `Indice ${idx} fuori dai limiti (lunghezza ${this.items.length})`);
    return this.items[idx];
  }

  byTag(tag) {
    const found = this.items.filter(it => it.tags.includes(tag));
    if (!found.length) lerr("TAG_NOT_FOUND", `Tag '${tag}' non trovato nella lista`);
    return found;
  }
}

//Qui def scope variabil. BUG: RET accettato in globale superfluo)!!
   
class Scope {
  constructor(parent = null, defret = false) {
    this.vars   = new Map();
    this.parent = parent;
    this.defret = defret;
  }

  _find(name) {
    if (this.vars.has(name)) return this;
    return this.parent ? this.parent._find(name) : null;
  }

  _global() {
    let s = this;
    while (s.parent) s = s.parent;
    return s;
  }

  set(name, val, { stay = false, isIF = false, expr = null, isRET = false, temp = false } = {}) {
    // Variabile già esistente → aggiorna dove vive (a meno che temp = forza locale)
    if (!temp) {
      const existing = this._find(name);
      if (existing) {
        const rec = existing.vars.get(name);
        if (rec.stay) lerr("CONST_MODIFY", `Costante '${name}' non modificabile`);
        existing.vars.set(name, {
          val,
          stay: rec.stay,
          isIF: rec.isIF,
          expr: expr !== null ? expr : rec.expr,
          isRET: rec.isRET,
          temp: rec.temp
        });
        return;
      }
    }
    // Nuova variabile
    const rec = { val, stay, isIF, expr, isRET, temp };
    if (isRET) {
      this._global().vars.set(name, rec);
    } else {
    
      this.vars.set(name, rec);
    }
  }

  get(name, interp) {
    const s = this._find(name);
    if (!s) return null;
    const rec = s.vars.get(name);
    if (rec.isIF && rec.expr && interp) {
      const v = interp.evalFull(rec.expr, this);
      const bv = mkB(truthy(v) ? VT : VF);
      rec.val = bv;
    }
    return rec;
  }

  getRec(name) {
    const s = this._find(name);
    return s ? s.vars.get(name) : null;
  }
}
   
//Rimozione commenti dal codice (>> e <* *>)
   
function stripComments(src) {
  const out = [];
  let multi = false;
  for (const [i, raw] of src.split("\n").entries()) {
    let res = "", j = 0;
    while (j < raw.length) {
      if (multi) {
        if (raw[j] === "*" && raw[j + 1] === ">") { multi = false; j += 2; }
        else j++;
      } else {
        if (raw[j] === "<" && raw[j + 1] === "*") { multi = true; j += 2; }
        else if (raw[j] === ">" && raw[j + 1] === ">") break;
        else { res += raw[j]; j++; }
      }
    }
    out.push({ text: res, lineNo: i + 1 });
  }
  return out;
}

// Pareser etcetera
   
function parse(src) {
  const lines = stripComments(src);
  return assembleBlock(lines, 0, lines.length).nodes;
}

function assembleBlock(lines, from, to) {
  const nodes = [];
  let i = from;

  while (i < to) {
    const { text, lineNo } = lines[i];
    const t = text.trim();
    if (!t) { i++; continue; }

    // Funzioni FUN
    if (/^FUN\s/.test(t)) {
      const m = t.match(/^FUN\s+(\w+)\s*\(([^)]*)\)/);
      if (!m) lerr("SYNTAX_ERROR", `FUN non valido riga ${lineNo}`);
      i++;
      const fend = findKw(lines, i, to, ["FEND"]);
      const body = assembleBlock(lines, i, fend).nodes;
      i = fend + 1;
      const params = m[2].split(",").map(p => p.trim()).filter(Boolean);
      nodes.push({ type: "FUN_DEF", name: m[1], params, body, lineNo });
      continue;
    }
    if (t === "FEND") { i++; continue; }

    // Funzioni THEN
    if (/^THEN\s/.test(t)) {
      const m = t.match(/^THEN\s+(\w+)/);
      i++;
      const tend = findKw(lines, i, to, ["THEND"]);
      const body = assembleBlock(lines, i, tend).nodes;
      i = tend + 1;
      nodes.push({ type: "THEN_DEF", name: m[1], body, lineNo });
      continue;
    }
    if (t === "THEND") { i++; continue; }

    // Blocco TRY 
     
    if (/^TRY\s/.test(t)) {
      const m = t.match(/^TRY\s+(\w+)/);
      i++;
      const bodyEnd = findKw(lines, i, to, ["TREND", "SHOW", "YET"]);
      const body = assembleBlock(lines, i, bodyEnd).nodes;
      i = bodyEnd;
      if (lines[i] && lines[i].text.trim() === "TREND") i++;

      const node = { type: "TRY", name: m[1], body, show: null, yet: null, lineNo };

      if (i < to && /^SHOW\s/.test(lines[i].text.trim())) {
        const sm = lines[i].text.trim().match(/^SHOW\s+(\w+)\s+@?(\w+)/);
        i++;
        const send = findKw(lines, i, to, ["SEND", "YET", "YEND"]);
        const sbody = assembleBlock(lines, i, send).nodes;
        i = send;
        if (lines[i] && lines[i].text.trim() === "SEND") i++;
        node.show = { body: sbody };
      }

      if (i < to && /^YET\s/.test(lines[i].text.trim())) {
        i++;
        const yend = findKw(lines, i, to, ["YEND"]);
        const ybody = assembleBlock(lines, i, yend).nodes;
        i = yend + 1;
        node.yet = { body: ybody };
      }

      nodes.push(node);
      continue;
    }
    if (["TREND", "SEND", "YEND"].includes(t)) { i++; continue; }

    // GO like a yoyo :-)
     
    if (/^GO[\s:@{]/.test(t) || t === "GO") {
      const { raw, nextI } = collectGORaw(lines, i, to);
      // Usa parseSingleLine sulla prima riga per preservare label (GO:nome)
      const goNode = parseSingleLine(t, lineNo) || { type: "GO_RAW", raw, lineNo };
      // Aggiorna il raw con tutto il testo raccolto (multilinea)
      goNode.raw = raw;
      nodes.push(goNode);
      i = nextI;
      continue;
    }

    // Blocco FOR
    if (/^FOR\s/.test(t)) {
      const { raw, nextI } = collectMultilineBody(lines, i, to);
      const node = parseSingleLine(raw.replace(/\n/g, " "), lineNo);
      if (node) nodes.push(node);
      i = nextI;
      continue;
    }

    const node = parseSingleLine(t, lineNo);
    if (node) nodes.push(node);
    i++;
  }
  return { nodes };
}

function findKw(lines, from, to, kws) {
  for (let i = from; i < to; i++)
    if (kws.includes(lines[i].text.trim())) return i;
  return to;
}

// Alias per retrocompabilita (dubbioso)
   
function goTrailingSep(line) {
  return /(?:&&|\belse\b(?!\s+if)|\byet\b)\s*$/.test(line) ||
         /(?:&(?!&)|\belse\s+if\b|\belif\b|\bshow\b)\s*$/.test(line);
}

function goLeadingSep(line) {
  return /^(?:&&?|else\s+if|elif|show|else(?!\s+if)|yet)\b/.test(line);
}

function collectGORaw(lines, startI, to) {
  let raw   = lines[startI].text.trim();
  let depth = countBraces(raw);
  let trailingOpen = goTrailingSep(raw);
  let i = startI + 1;

  while (i < to) {
    const t = lines[i].text.trim();
    if (!t) { if (depth <= 0) break; i++; continue; }

    if (depth > 0) {
      raw += "\n" + t;
      depth += countBraces(t);
      trailingOpen = goTrailingSep(t);
      i++;
      continue;
    }
    
    if (trailingOpen || goLeadingSep(t)) {
      raw += "\n" + t;
      depth += countBraces(t);
      trailingOpen = goTrailingSep(t);
      i++;
      continue;
    }
    break;
  }
  return { raw, nextI: i };
}


function collectMultilineBody(lines, startI, to) {
  let raw = lines[startI].text.trim();
  let depth = countBraces(raw);
  let i = startI + 1;
  while (depth > 0 && i < to) {
    const t = lines[i].text.trim();
    raw += "\n" + t;
    depth += countBraces(t);
    i++;
  }
  return { raw, nextI: i };
}

function countBraces(s) {
  let d = 0;
  for (const c of s) { if (c === "{") d++; else if (c === "}") d--; }
  return d;
}
/
function parseSingleLine(text, lineNo) {
  if (!text) return null;
  text = text.trim();

  // *etichetta
  if (text[0] === "*") return { type: "LABEL_CALL", target: text.slice(1).trim(), lineNo };

   
  const kwLbl = text.match(/^(TALK|OUT|INP|GO|FOR|SCREAM):(\w+)\s*(.*)?$/s);
  if (kwLbl) {
    if (kwLbl[1] === "TALK" && kwLbl[2] === "V") return { type: "TALK_V", prompt: kwLbl[3] || "", lineNo };
    if (kwLbl[1] === "TALK" && kwLbl[2] === "F") return { type: "TALK_F", lineNo };
    const inner = parseSingleLine(`${kwLbl[1]} ${kwLbl[3] || ""}`.trim(), lineNo);
    if (inner) inner.label = kwLbl[2];
    return inner;
  }
  if (text === "TALK:F") return { type: "TALK_F", lineNo };

  // TAKE
  const takeM = text.match(/^TAKE\s+(\w+)$/);
  if (takeM) return { type: "TAKE", module: takeM[1], lineNo };
   
  const ioM = text.match(/^(TALK|OUT|INP|SCREAM)(?:\s+([\s\S]*))?$/s);
  if (ioM) return { type: "IO", kw: ioM[1], tpl: ioM[2] || "", lineNo };

  if (/^return(\s|$)/.test(text))
    return { type: "RETURN", expr: text.slice(6).trim(), lineNo };
  if (text === "SKIP") return { type: "SKIP", lineNo };

  // ADD lista
  const addM = text.match(/^ADD\s+(\w+)\s+(AT|BY)\s*([^\s=]*)?\s*=\s*([\s\S]+)$/s);
  if (addM) return { type: "ADD", list: addM[1], mode: addM[2], idx: addM[3] || "", val: addM[4].trim(), lineNo };

  // CANC lista 
  const cancM = text.match(/^CANC\s+(\w+)\s+(AT|BY|IS|IN)\s+([\s\S]+)$/s);
  if (cancM) return { type: "CANC", list: cancM[1], mode: cancM[2], arg: cancM[3].trim(), lineNo };

  // FOR 
  const forM = text.match(/^FOR\s+@(\w+)\s+#\[([^;]*);([^;]*);([^\]]*)\]\s*=\s*([\s\S]+)$/s);
  if (forM) return {
    type: "FOR",
    list: forM[1],
    start: forM[2].trim() || "0",
    end:   forM[3].trim() || "-1",
    step:  forM[4].trim() || "1",
    fn:    forM[5].trim(),
    lineNo
  };

  // GO (here we GO again infatuation touches me...)
  if (/^GO[\s:@{]/.test(text) || text === "GO")
    return { type: "GO_RAW", raw: text, lineNo };

  // Conversioni  
  const cvM = text.match(/^([nsb]):(\w+)$/);
  if (cvM) return { type: "CONV", op: cvM[1], varN: cvM[2], lineNo };

  // DEFRET
  if (text === "DEFRET") return { type: "DEFRET", lineNo };

  const pfxM = text.match(/^(STAY|IF|RET|TEMP)\s+([\s\S]+)$/s);
  if (pfxM) {
    const inner = parseSingleLine(pfxM[2], lineNo);
    if (inner && (inner.type === "ASSIGN" || inner.type === "ASSIGN_OP")) {
      inner.stay  = pfxM[1] === "STAY";
      inner.isIF  = pfxM[1] === "IF";
      inner.isRET = pfxM[1] === "RET";
      inner.temp  = pfxM[1] === "TEMP";
    }
    return inner;
  }

  // Operatori incrementali
  const incM = text.match(/^(#?)(\w+)\s*(\+|-|\*|\/\/|\/|%|\^)=\s*([\s\S]+)$/s);
  if (incM) return {
    type: "ASSIGN_OP",
    isNum: incM[1] === "#",
    varName: incM[2],
    op: incM[3],
    expr: incM[4].trim(),
    lineNo
  };

  // Riassegnazione
  const reAssM = text.match(/^@(\w+)\s*=\s*([\s\S]*)$/s);
  if (reAssM) return { type: "ASSIGN", isNum: false, varName: reAssM[1], expr: reAssM[2].trim(), lineNo, forceReassign: true };

  // Assegnazione
  const assM = text.match(/^(#?)(\w+)\s*=\s*([\s\S]*)$/s);
  if (assM && assM[2] !== "=") return {
    type: "ASSIGN",
    isNum: assM[1] === "#",
    varName: assM[2],
    expr: assM[3].trim(),
    lineNo
  };

  // Chiamata funzione standalone
  if (/^\w+\(/.test(text)) return { type: "CALL", expr: text, lineNo };

  return { type: "RAW", text, lineNo };
}

function evalExpr(expr, scope, interp) {
  expr = String(expr).trim();
  if (!expr) return mkS("");

  if (expr.startsWith("\\t")) {
    const nm = expr.slice(2).trim();
    const r  = scope.get(nm, interp);
    return mkS(r ? r.val.type : "undefined");
  }

  // Lista letterale
  if (expr.startsWith("["))
    return mkL(parseListLit(expr, scope, interp));

  const laM = expr.match(/^(\w+)\[(.+)\]$/);
  if (laM && interp) return interp.listGet(laM[1], laM[2], scope);

  if (/^\w+\(/.test(expr) && interp) {
    return interp.callFnSync(expr, scope) || mkS("");
  }

  // Risolvi 
  const resolved = resolveRefs(expr, scope, interp);
  return evalTokens(resolved);
}

// Marcatori di tipo 
const _TM = { S: "S:", N: "N:", B: "B:", END: "" };
const _TM_RE = /([SNB]):([^]*)/g;

function encodeTyped(v) {
  if (v.type === TN) return _TM.N + String(v.value) + _TM.END;
  if (v.type === TB) return _TM.B + String(v.value) + _TM.END;
  return _TM.S + String(v.value) + _TM.END;
}

function resolveRefs(expr, scope, interp) {
  return expr.replace(/@(\w+)/g, (match, name) => {
    if (!scope) return match;
    const r = scope.get(name, interp);
    if (!r) return match;
    const v = r.val;
    if (v.value instanceof LList) return v.value.display(false);
    return encodeTyped(v);
  });
}

function decodeTyped(s) {
  const m = s.match(/^([SNB]):([^]*)$/);
  if (!m) return null;
  if (m[1] === "N") return mkN(parseFloat(m[2]));
  if (m[1] === "B") return mkB(m[2]);
  return mkS(m[2]);
}

function evalTokens(expr) {
  expr = expr.trim();
  if (!expr) return mkS("");
  const decoded = decodeTyped(expr);
  if (decoded) return decoded;

  for (const op of [" AUT ", " VEL ", " ET "]) {
    const i = findOpFromRight(expr, op);
    if (i >= 0) {
      const L = evalTokens(expr.slice(0, i).trim());
      const R = evalTokens(expr.slice(i + op.length).trim());
      const l = truthy(L), r = truthy(R);
      if (op === " ET ")  return mkB((l && r)   ? VT : VF);
      if (op === " VEL ") return mkB((l || r)   ? VT : VF);
      if (op === " AUT ") return mkB((l !== r)  ? VT : VF);
    }
  }

  if (expr[0] === "!") return mkB(truthy(evalTokens(expr.slice(1).trim())) ? VF : VT);

  // Operation IN (vy) questa è sottile
  {
    const i = findOpFromRight(expr, " IN ");
    if (i >= 0) {
      const L = evalTokens(expr.slice(0, i).trim());
      const R = evalTokens(expr.slice(i + 4).trim());
      const rStr = String(R.value);
      if (rStr.startsWith("[")) {
        const items = splitSemicolon(rStr.slice(1, -1)).map(s => s.trim());
        return mkB(items.some(it => String(L.value) === it) ? VT : VF);
      }
      return mkB(String(L.value) === rStr ? VT : VF);
    }
  }

  for (const op of ["<=", ">=", "<", ">"]) {
    const i = findOpFromRight(expr, op, true);
    if (i >= 0) {
      const L = evalTokens(expr.slice(0, i).trim());
      const R = evalTokens(expr.slice(i + op.length).trim());
      const lv = Number(L.value), rv = Number(R.value);
      if (op === "<=") return mkB(lv <= rv ? VT : VF);
      if (op === ">=") return mkB(lv >= rv ? VT : VF);
      if (op === "<")  return mkB(lv <  rv ? VT : VF);
      if (op === ">")  return mkB(lv >  rv ? VT : VF);
    }
  }

  for (const op of ["==", "!="]) {
    const i = findOpFromRight(expr, op, true);
    if (i >= 0) {
      const L = evalTokens(expr.slice(0, i).trim());
      const R = evalTokens(expr.slice(i + op.length).trim());
      const eq = String(L.value) === String(R.value) && L.type === R.type;
      return mkB((op === "==" ? eq : !eq) ? VT : VF);
    }
  }
  for (let i = expr.length - 1; i > 0; i--) {
    const c = expr[i];
    if ((c === "+" || c === "-") && isTopLevel(expr, i)) {
      const prev = expr[i - 1];
      if (prev && "=<>!*/^%(".includes(prev)) continue; // parte di altro op
      const left  = expr.slice(0, i).trim();
      const right = expr.slice(i + 1).trim();
      if (!left || !right) continue;
      const L = evalTokens(left);
      const R = evalTokens(right);
      if (c === "+" && L.type === TN && R.type === TN) return mkN(L.value + R.value);
      if (c === "+" ) return mkS(String(L.value) + String(R.value));
      if (L.type === TN && R.type === TN)               return mkN(L.value - R.value);
    }
  }
  {
    const i = findOpFromRight(expr, "%", true);
    if (i > 0) {
      const L = toNum(expr.slice(0, i).trim());
      const R = toNum(expr.slice(i + 1).trim());
      if (L !== null && R !== null) return mkN(L % R);
    }
  }

  {
    const i = findLast(expr, "//");
    if (i > 0 && isTopLevel(expr, i)) {
      const L = toNum(expr.slice(0, i).trim());
      const R = toNum(expr.slice(i + 2).trim());
      if (L !== null && R !== null) {
        if (R === 0) lerr("DIV_BY_ZERO", "Divisione per zero");
        return mkN(Math.trunc(L / R));
      }
    }
  }


  for (let i = expr.length - 1; i > 0; i--) {
    const c = expr[i];
    if ((c === "*" || c === "/") && isTopLevel(expr, i)) {
      if (c === "/" && (expr[i - 1] === "/" || expr[i + 1] === "/")) continue; 
      if (expr[i + 1] === "=") continue; // *= /=
      const left  = expr.slice(0, i).trim();
      const right = expr.slice(i + 1).trim();
      if (!left || !right) continue;
      const L = toNum(left);
      const R = toNum(right);
      if (L !== null && R !== null) {
        if (c === "/") { if (R === 0) lerr("DIV_BY_ZERO", "Divisione per zero"); return mkN(L / R); }
        return mkN(L * R);
      }
    }
  }

 
  {
    const i = findFirst(expr, "^");
    if (i > 0 && isTopLevel(expr, i)) {
      const L = toNum(expr.slice(0, i).trim());
      const R = toNum(expr.slice(i + 1).trim());
      if (L !== null && R !== null) return mkN(Math.pow(L, R));
    }
  }

  // ()
  if (expr[0] === "(" && matchClose(expr, 0) === expr.length - 1)
    return evalTokens(expr.slice(1, -1).trim());

  if (expr === VT) return mkB(VT);
  if (expr === VF) return mkB(VF);
  if (/^-?\d+(\.\d+)?$/.test(expr)) return mkN(parseFloat(expr));

  return mkS(applyEscape(expr));
}

function findOpFromRight(expr, op, requireTopLevel = false) {
  for (let i = expr.length - op.length; i >= 0; i--) {
    if (requireTopLevel && !isTopLevel(expr, i)) continue;
    if (expr.slice(i, i + op.length) === op) return i;
  }
  return -1;
}

function findLast(expr, op) {
  let last = -1;
  for (let i = 0; i <= expr.length - op.length; i++)
    if (expr.slice(i, i + op.length) === op) last = i;
  return last;
}

function findFirst(expr, op) {
  for (let i = 0; i <= expr.length - op.length; i++)
    if (isTopLevel(expr, i) && expr.slice(i, i + op.length) === op) return i;
  return -1;
}

function isTopLevel(expr, i) {
  let d = 0;
  for (let j = 0; j < i; j++) {
    if (expr[j] === "(" || expr[j] === "[") d++;
    else if (expr[j] === ")" || expr[j] === "]") d--;
  }
  return d === 0;
}

function matchClose(s, open) {
  let d = 0;
  const openC = s[open] === "(" ? "(" : "[";
  const closeC = openC === "(" ? ")" : "]";
  for (let i = open; i < s.length; i++) {
    if (s[i] === openC) d++;
    else if (s[i] === closeC) { d--; if (d === 0) return i; }
  }
  return -1;
}

function toNum(s) {
  s = s.trim();
  if (s === VT) return 1;
  if (s === VF) return 0;
  if (s[0] === "(" && matchClose(s, 0) === s.length - 1) {
    const v = evalTokens(s.slice(1, -1).trim());
    return v.type === TN ? v.value : parseFloat(String(v.value));
  }
  const simple = /^-?\d+(\.\d+)?$/.test(s);
  if (simple) return parseFloat(s);
  try { const v = evalTokens(s); return v.type === TN ? v.value : parseFloat(String(v.value)); }
  catch(e) { return null; }
}

function applyEscape(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\%/g, "%")
    .replace(/\\@/g, "@")
    .replace(/\\\|/g, "|")
    .replace(/\\;/g, ";");
}

function parseListLit(expr, scope, interp) {
  const inner = expr.trim().replace(/^\[|\]$/g, "").trim();
  if (!inner) return new LList([]);
  return new LList(
    splitSemicolon(inner).map(part => {
      part = part.trim();
      const segs = splitPipe(part);
      const rawVal = segs.pop().trim();
      const tags = segs.map(s => s.trim());
      let value;
      if (rawVal.startsWith("[")) {
        value = parseListLit(rawVal, scope, interp);
      } else {
        const ev = evalExpr(rawVal, scope, interp);
        value = ev.value instanceof LList ? ev.value : ev.value;
      }
      return { value, tags };
    })
  );
}

function splitArgs(s) {
  const out = []; let cur = "", d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") d++;
    else if (c === ")" || c === "]") d--;
    else if (c === "," && d === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map(a => a.trim() === "" && a.length > 0 ? a : a.trim());
}

function splitSemicolon(s) {
  const out = []; let cur = "", d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[" || c === "(") d++;
    else if (c === "]" || c === ")") d--;
    else if (c === ";" && s[i - 1] !== "\\" && d === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function splitPipe(s) {
  const out = []; let cur = "", d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "[" || c === "(") d++;
    else if (c === "]" || c === ")") d--;
    else if (c === "|" && s[i - 1] !== "\\" && d === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function renderTpl(tpl, scope, interp, allowInput) {
  
  tpl = tpl
    .replace(/\\n/g,  "\n")
    .replace(/\\@/g,  "\x00AT\x00")
    .replace(/\\%/g,  "\x00PCT\x00")
    .replace(/\\\|/g, "\x00PIPE\x00")
    .replace(/\\;/g,  "\x00SEMI\x00");
  tpl = tpl.replace(/%/g, "");
  tpl = tpl.replace(/\\t(\w+)/g, (_, nm) => {
    const r = scope.get(nm, interp);
    return r ? r.val.type : "undefined";
  });

  tpl = tpl.replace(/@(\w+)\[([^\]]+)\]/g, (match, name, key) => {
    try {
      const res = interp.listGet(name, key, scope);
      return res.value instanceof LList ? res.value.display(false) : String(res.value);
    }
    catch(e) { return match; }
  });
  const inputVars = [];
  tpl = tpl.replace(/@(\w+)(?:\[([^\]]+)\])?/g, (match, name, key) => {
    const r = scope.get(name, interp);
    if (!r) {
      if (allowInput && !key) { inputVars.push(name); return `\x01${name}\x01`; }
      if (allowInput && key) return "";
      lerr("VAR_NOT_FOUND", `Variabile '${name}' non trovata`);
    }
    const v = r.val;
    // Accesso lista 
    if (key && v.value instanceof LList) {
      try {
        const item = key.startsWith("#")
          ? v.value.at(Number(key.slice(1)))
          : v.value.byTag(key)[0];
        if (!item) return "";
        return item.value instanceof LList ? item.value.display(false) : String(item.value);
      } catch(e) { return ""; }
    }
    return v.value instanceof LList ? v.value.display(false) : String(v.value);
  });
  tpl = tpl
    .replace(/\x00AT\x00/g,   "@")
    .replace(/\x00PCT\x00/g,  "%")
    .replace(/\x00PIPE\x00/g, "|")
    .replace(/\x00SEMI\x00/g, ";");

  return { text: tpl, inputVars };
}

// MODULI SPEMLICIOSI MA LUNGOSI!!

const MODULES = {

  math: {
    docs: {
      sqrt:   "sqrt(n) → radice quadrata",
      abs:    "abs(n) → valore assoluto",
      floor:  "floor(n) → arrotonda verso il basso",
      ceil:   "ceil(n) → arrotonda verso l'alto",
      round:  "round(n) → arrotonda",
      pow:    "pow(base, esp) → potenza",
      log:    "log(n) → logaritmo naturale",
      log2:   "log2(n) → logaritmo base 2",
      log10:  "log10(n) → logaritmo base 10",
      sin:    "sin(n) → seno (radianti)",
      cos:    "cos(n) → coseno (radianti)",
      tan:    "tan(n) → tangente (radianti)",
      asin:   "asin(n) → arcoseno",
      acos:   "acos(n) → arcocoseno",
      atan:   "atan(n) → arcotangente",
      atan2:  "atan2(y,x) → arcotangente di y/x",
      pi:     "pi() → 3.14159...",
      e:      "e() → 2.71828...",
      rand:   "rand() → numero casuale [0,1)",
      randint:"randint(a,b) → intero casuale [a,b]",
      max:    "max(a,b) → massimo",
      min:    "min(a,b) → minimo",
      sign:   "sign(n) → segno (-1, 0, 1)",
      clamp:  "clamp(n,min,max) → limita n tra min e max",
      hypot:  "hypot(a,b) → ipotenusa",
      trunc:  "trunc(n) → parte intera (tronca)",
    },
    fns: {
      math_sqrt:   (a)       => mkN(Math.sqrt(Number(a))),
      math_abs:    (a)       => mkN(Math.abs(Number(a))),
      math_floor:  (a)       => mkN(Math.floor(Number(a))),
      math_ceil:   (a)       => mkN(Math.ceil(Number(a))),
      math_round:  (a)       => mkN(Math.round(Number(a))),
      math_pow:    (a, b)    => mkN(Math.pow(Number(a), Number(b))),
      math_log:    (a)       => mkN(Math.log(Number(a))),
      math_log2:   (a)       => mkN(Math.log2(Number(a))),
      math_log10:  (a)       => mkN(Math.log10(Number(a))),
      math_sin:    (a)       => mkN(Math.sin(Number(a))),
      math_cos:    (a)       => mkN(Math.cos(Number(a))),
      math_tan:    (a)       => mkN(Math.tan(Number(a))),
      math_asin:   (a)       => mkN(Math.asin(Number(a))),
      math_acos:   (a)       => mkN(Math.acos(Number(a))),
      math_atan:   (a)       => mkN(Math.atan(Number(a))),
      math_atan2:  (a, b)    => mkN(Math.atan2(Number(a), Number(b))),
      math_pi:     ()        => mkN(Math.PI),
      math_e:      ()        => mkN(Math.E),
      math_rand:   ()        => mkN(Math.random()),
      math_randint:(a, b)    => mkN(Math.floor(Math.random()*(Number(b)-Number(a)+1))+Number(a)),
      math_max:    (a, b)    => mkN(Math.max(Number(a), Number(b))),
      math_min:    (a, b)    => mkN(Math.min(Number(a), Number(b))),
      math_sign:   (a)       => mkN(Math.sign(Number(a))),
      math_clamp:  (n, lo, hi) => mkN(Math.min(Math.max(Number(n), Number(lo)), Number(hi))),
      math_hypot:  (a, b)    => mkN(Math.hypot(Number(a), Number(b))),
      math_trunc:  (a)       => mkN(Math.trunc(Number(a))),
    }
  },

  str: {
    docs: {
      len:      "len(s) → lunghezza della stringa",
      upper:    "upper(s) → maiuscolo",
      lower:    "lower(s) → minuscolo",
      trim:     "trim(s) → rimuove spazi iniziali/finali",
      ltrim:    "ltrim(s) → rimuove spazi a sinistra",
      rtrim:    "rtrim(s) → rimuove spazi a destra",
      contains: "contains(s,sub) → V se s contiene sub",
      starts:   "starts(s,pre) → V se s inizia con pre",
      ends:     "ends(s,suf) → V se s finisce con suf",
      index:    "index(s,sub) → posizione di sub in s (-1 se assente)",
      sub:      "sub(s,a,b) → sottostringa da indice a a b",
      rep:      "rep(s,n) → ripete s per n volte",
      repl:     "repl(s,old,new) → sostituisce old con new in s",
      char:     "char(n) → carattere con codice Unicode n",
      code:     "code(s) → codice Unicode del primo carattere",
      rev:      "rev(s) → stringa invertita",
      pad:      "pad(s,n) → aggiunge spazi a destra fino a lunghezza n",
      lpad:     "lpad(s,n) → aggiunge spazi a sinistra fino a lunghezza n",
      split:    "split(s,sep) → lista di sottostringhe",
      join:     "join(lista,sep) → unisce lista con separatore",
      num:      "num(s) → converte stringa in numero",
      isnum:    "isnum(s) → V se s è un numero valido",
    },
    fns: {
      str_len:      (a)       => mkN(String(a).length),
      str_upper:    (a)       => mkS(String(a).toUpperCase()),
      str_lower:    (a)       => mkS(String(a).toLowerCase()),
      str_trim:     (a)       => mkS(String(a).trim()),
      str_ltrim:    (a)       => mkS(String(a).trimStart()),
      str_rtrim:    (a)       => mkS(String(a).trimEnd()),
      str_contains: (a, b)    => mkB(String(a).includes(String(b)) ? VT : VF),
      str_starts:   (a, b)    => mkB(String(a).startsWith(String(b)) ? VT : VF),
      str_ends:     (a, b)    => mkB(String(a).endsWith(String(b)) ? VT : VF),
      str_index:    (a, b)    => mkN(String(a).indexOf(String(b))),
      str_sub:      (a, b, c) => mkS(String(a).slice(Number(b), c !== undefined ? Number(c) : undefined)),
      str_rep:      (a, b)    => mkS(String(a).repeat(Math.max(0, Number(b)))),
      str_repl:     (a, b, c) => mkS(String(a).replaceAll(String(b), String(c))),
      str_char:     (a)       => mkS(String.fromCharCode(Number(a))),
      str_code:     (a)       => mkN(String(a).charCodeAt(0)),
      str_rev:      (a)       => mkS(String(a).split("").reverse().join("")),
      str_pad:      (a, b)    => mkS(String(a).padEnd(Number(b))),
      str_lpad:     (a, b)    => mkS(String(a).padStart(Number(b))),
      str_split:    (a, b)    => {
        const parts = String(a).split(String(b === undefined ? "" : b));
        return mkL(new LList(parts.map(p => ({ value: p, tags: [] }))));
      },
      str_join:     (a, b)    => {
        if (a instanceof LList) return mkS(a.items.map(i => String(i.value)).join(String(b === undefined ? "" : b)));
        return mkS(String(a));
      },
      str_num:      (a)       => { const n = parseFloat(String(a)); return mkN(isNaN(n) ? 0 : n); },
      str_isnum:    (a)       => mkB(!isNaN(parseFloat(String(a))) && isFinite(String(a)) ? VT : VF),
    }
  },

  list: {
    docs: {
      len:    "len(lista) → numero di elementi",
      get:    "get(lista,i) → elemento all'indice i",
      first:  "first(lista) → primo elemento",
      last:   "last(lista) → ultimo elemento",
      rev:    "rev(lista) → lista invertita",
      sort:   "sort(lista) → lista ordinata (alfabetico/numerico)",
      has:    "has(lista,val) → V se val è nella lista",
      flat:   "flat(lista) → appiattisce liste annidate di un livello",
      sum:    "sum(lista) → somma degli elementi numerici",
      avg:    "avg(lista) → media degli elementi numerici",
      max:    "max(lista) → elemento massimo",
      min:    "min(lista) → elemento minimo",
      uniq:   "uniq(lista) → rimuove duplicati",
      slice:  "slice(lista,a,b) → sotto-lista da indice a a b",
      tags:   "tags(lista,i) → tag dell'elemento all'indice i",
    },
    fns: {
      list_len:   (a) => {
        if (a instanceof LList) return mkN(a.items.length);
        return mkN(0);
      },
      list_get:   (a, b) => {
        if (!(a instanceof LList)) return mkS("");
        let i = Number(b); if (i < 0) i = a.items.length + i;
        return i >= 0 && i < a.items.length ? mkS(String(a.items[i].value)) : mkS("");
      },
      list_first: (a) => {
        if (!(a instanceof LList) || !a.items.length) return mkS("");
        return mkS(String(a.items[0].value));
      },
      list_last:  (a) => {
        if (!(a instanceof LList) || !a.items.length) return mkS("");
        return mkS(String(a.items[a.items.length-1].value));
      },
      list_rev:   (a) => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        return mkL(new LList([...a.items].reverse()));
      },
      list_sort:  (a) => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        const sorted = [...a.items].sort((x,y) => {
          const nx = Number(x.value), ny = Number(y.value);
          if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
          return String(x.value).localeCompare(String(y.value));
        });
        return mkL(new LList(sorted));
      },
      list_has:   (a, b) => {
        if (!(a instanceof LList)) return mkB(VF);
        return mkB(a.items.some(it => String(it.value) === String(b)) ? VT : VF);
      },
      list_flat:  (a) => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        const items = [];
        for (const it of a.items) {
          if (it.value instanceof LList) items.push(...it.value.items);
          else items.push(it);
        }
        return mkL(new LList(items));
      },
      list_sum:   (a) => {
        if (!(a instanceof LList)) return mkN(0);
        return mkN(a.items.reduce((s,it) => s + (Number(it.value)||0), 0));
      },
      list_avg:   (a) => {
        if (!(a instanceof LList) || !a.items.length) return mkN(0);
        const s = a.items.reduce((acc,it) => acc + (Number(it.value)||0), 0);
        return mkN(s / a.items.length);
      },
      list_max:   (a) => {
        if (!(a instanceof LList) || !a.items.length) return mkS("");
        return mkN(Math.max(...a.items.map(it => Number(it.value))));
      },
      list_min:   (a) => {
        if (!(a instanceof LList) || !a.items.length) return mkS("");
        return mkN(Math.min(...a.items.map(it => Number(it.value))));
      },
      list_uniq:  (a) => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        const seen = new Set();
        return mkL(new LList(a.items.filter(it => {
          const k = String(it.value); if (seen.has(k)) return false; seen.add(k); return true;
        })));
      },
      list_slice: (a, b, c) => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        return mkL(new LList(a.items.slice(Number(b), c !== undefined ? Number(c) : undefined)));
      },
      list_tags:  (a, b) => {
        if (!(a instanceof LList)) return mkS("");
        let i = Number(b); if (i<0) i=a.items.length+i;
        const it = a.items[i];
        return it ? mkS(it.tags.join(",")) : mkS("");
      },
    }
  },

  io: {
    docs: {
      now:    "now() → timestamp Unix in millisecondi",
      date:   "date() → data corrente (stringa)",
      time:   "time() → ora corrente (stringa)",
      wait:   "wait(ms) → pausa (ms millisecondi) — solo effetto, ritorna 0",
    },
    fns: {
      io_now:  ()  => mkN(Date.now()),
      io_date: ()  => mkS(new Date().toLocaleDateString("it-IT")),
      io_time: ()  => mkS(new Date().toLocaleTimeString("it-IT")),
      io_wait: (ms)=> mkN(0),  
    }
  },

  conv: {
    docs: {
      tonum:  "tonum(s) → converte in numero",
      tostr:  "tostr(n) → converte in stringa",
      tobool: "tobool(s) → converte in booleano (V/F)",
      hex:    "hex(n) → numero in esadecimale",
      bin:    "bin(n) → numero in binario",
      oct:    "oct(n) → numero in ottale",
      fromhex:"fromhex(s) → esadecimale in numero",
    },
    fns: {
      conv_tonum:   (a) => { const n=parseFloat(String(a)); return mkN(isNaN(n)?0:n); },
      conv_tostr:   (a) => mkS(String(a)),
      conv_tobool:  (a) => mkB((String(a)===""||String(a)===VF)?VF:VT),
      conv_hex:     (a) => mkS(Math.trunc(Number(a)).toString(16)),
      conv_bin:     (a) => mkS(Math.trunc(Number(a)).toString(2)),
      conv_oct:     (a) => mkS(Math.trunc(Number(a)).toString(8)),
      conv_fromhex: (a) => mkN(parseInt(String(a),16)||0),
    }
  },

  rand: {
    docs: {
      int:     "int(a,b) → intero casuale tra a e b (inclusi)",
      float:   "float(a,b) → decimale casuale tra a e b",
      pick:    "pick(lista) → elemento casuale dalla lista",
      shuffle: "shuffle(lista) → copia della lista mescolata",
      coinflip:"coinflip() → V o F con probabilità 50/50",
      percent: "percent(n) → V se numero casuale < n (probabilità n%)",
      dice:    "dice(facce) → lancio dado con N facce (1-N)",
      uuid:    "uuid() → stringa univoca (UUID v4 semplificato)",
    },
    fns: {
      rand_int:      (a, b) => mkN(Math.floor(Math.random()*(Number(b)-Number(a)+1))+Number(a)),
      rand_float:    (a, b) => mkN(Math.random()*(Number(b)-Number(a))+Number(a)),
      rand_pick:     (a)    => {
        if (!(a instanceof LList)||!a.items.length) return mkS("");
        return mkS(String(a.items[Math.floor(Math.random()*a.items.length)].value));
      },
      rand_shuffle:  (a)    => {
        if (!(a instanceof LList)) return mkL(new LList([]));
        const arr=[...a.items]; for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
        return mkL(new LList(arr));
      },
      rand_coinflip: ()     => mkB(Math.random()<0.5?VT:VF),
      rand_percent:  (n)    => mkB(Math.random()*100<Number(n)?VT:VF),
      rand_dice:     (n)    => mkN(Math.floor(Math.random()*Number(n))+1),
      rand_uuid:     ()     => {
        const s4=()=>Math.floor((1+Math.random())*0x10000).toString(16).slice(1);
        return mkS(`${s4()}${s4()}-${s4()}-4${s4().slice(1)}-${s4()}-${s4()}${s4()}${s4()}`);
      },
    }
  },

  
  num: {
    docs: {
      fmt:     "fmt(n, dec) → numero formattato con dec decimali",
      isint:   "isint(n) → V se n è intero",
      isnan:   "isnan(n) → V se non è un numero valido",
      isinf:   "isinf(n) → V se è infinito",
      clamp:   "clamp(n,a,b) → limita n tra a e b",
      lerp:    "lerp(a,b,t) → interpolazione lineare tra a e b con t∈[0,1]",
      map:     "map(n,a1,b1,a2,b2) → rimappa n da [a1,b1] a [a2,b2]",
      digits:  "digits(n) → numero di cifre intere",
      sum:     "sum(lista) → somma tutti i numeri della lista",
      prod:    "prod(lista) → prodotto di tutti i numeri della lista",
      fib:     "fib(n) → n-esimo numero di Fibonacci",
      fact:    "fact(n) → n! (fattoriale)",
      gcd:     "gcd(a,b) → massimo comun divisore",
      lcm:     "lcm(a,b) → minimo comune multiplo",
      prime:   "prime(n) → V se n è un numero primo",
      roman:   "roman(n) → numero in cifre romane",
    },
    fns: {
      num_fmt:    (a, b)    => mkS(Number(a).toFixed(Math.max(0, Number(b||0)))),
      num_isint:  (a)       => mkB(Number.isInteger(Number(a))?VT:VF),
      num_isnan:  (a)       => mkB(isNaN(Number(a))?VT:VF),
      num_isinf:  (a)       => mkB(!isFinite(Number(a))&&!isNaN(Number(a))?VT:VF),
      num_clamp:  (a,lo,hi) => mkN(Math.min(Math.max(Number(a),Number(lo)),Number(hi))),
      num_lerp:   (a,b,t)   => mkN(Number(a)+(Number(b)-Number(a))*Number(t)),
      num_map:    (n,a1,b1,a2,b2) => mkN(Number(a2)+(Number(n)-Number(a1))/(Number(b1)-Number(a1))*(Number(b2)-Number(a2))),
      num_digits: (a)       => mkN(Math.floor(Math.log10(Math.abs(Number(a))))+1||1),
      num_sum:    (a)       => {
        if (!(a instanceof LList)) return mkN(0);
        return mkN(a.items.reduce((s,it)=>s+(Number(it.value)||0),0));
      },
      num_prod:   (a)       => {
        if (!(a instanceof LList)) return mkN(1);
        return mkN(a.items.reduce((p,it)=>p*(Number(it.value)||1),1));
      },
      num_fib:    (a)       => {
        let n=Math.max(0,Math.trunc(Number(a))); let [a2,b]=[0,1];
        for(let i=0;i<n;i++){[a2,b]=[b,a2+b];} return mkN(a2);
      },
      num_fact:   (a)       => {
        let n=Math.max(0,Math.trunc(Number(a))); let r=1;
        for(let i=2;i<=n;i++) r*=i; return mkN(r);
      },
      num_gcd:    (a, b)    => {
        let x=Math.abs(Math.trunc(Number(a))),y=Math.abs(Math.trunc(Number(b)));
        while(y){[x,y]=[y,x%y];} return mkN(x);
      },
      num_lcm:    (a, b)    => {
        let x=Math.abs(Math.trunc(Number(a))),y=Math.abs(Math.trunc(Number(b)));
        let g=x; let yy=y; while(yy){[g,yy]=[yy,g%yy];}
        return mkN(g===0?0:(x*y)/g);
      },
      num_prime:  (a)       => {
        const n=Math.trunc(Number(a)); if(n<2) return mkB(VF);
        for(let i=2;i<=Math.sqrt(n);i++) if(n%i===0) return mkB(VF);
        return mkB(VT);
      },
      num_roman:  (a)       => {
        let n=Math.max(1,Math.min(3999,Math.trunc(Number(a))));
        const vals=[1000,900,500,400,100,90,50,40,10,9,5,4,1];
        const syms=["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
        let r=""; for(let i=0;i<vals.length;i++){while(n>=vals[i]){r+=syms[i];n-=vals[i];}} return mkS(r);
      },
    }
  },

  type: {
    docs: {
      isstr:   "isstr(v) → V se v è una stringa",
      isnum:   "isnum(v) → V se v è un numero",
      isbool:  "isbool(v) → V se v è un booleano",
      islist:  "islist(v) → V se v è una lista",
      istrue:  "istrue(v) → V se v è vero (qualsiasi tipo)",
      isfalse: "isfalse(v) → V se v è falso (qualsiasi tipo)",
      isempty: "isempty(v) → V se v è stringa vuota o lista vuota",
    },
    fns: {
      type_isstr:   (a, _t)  => mkB(_t==="string"?VT:VF),
      type_isnum:   (a, _t)  => mkB(_t==="number"?VT:VF),
      type_isbool:  (a, _t)  => mkB(_t==="bool"?VT:VF),
      type_islist:  (a)      => mkB(a instanceof LList?VT:VF),
      type_istrue:  (a, _t)  => {
        if(_t==="bool") return mkB(a===VT||a===true?VT:VF);
        if(_t==="number") return mkB(Number(a)!==0?VT:VF);
        return mkB(a!==""&&a!==VF?VT:VF);
      },
      type_isfalse: (a, _t)  => {
        if(_t==="bool") return mkB(a===VF||a===false?VT:VF);
        if(_t==="number") return mkB(Number(a)===0?VT:VF);
        return mkB(a===""||a===VF?VT:VF);
      },
      type_isempty: (a)      => {
        if(a instanceof LList) return mkB(a.items.length===0?VT:VF);
        return mkB(String(a)===""?VT:VF);
      },
    }
  },

};

const ALL_FNS = {};
for (const mod of Object.values(MODULES))
  for (const [k, fn] of Object.entries(mod.fns)) ALL_FNS[k] = fn;

const MATH_MODULE = MODULES.math.fns;


function normalizeGORaw(text) {
  text = text.replace(/&&[ \t]*\n[ \t]*/g, ' && ');
  text = text.replace(/&[ \t]*\n[ \t]*/g,  ' & ');
  text = text.replace(/\n[ \t]*(else\s+if|elif|show)[ \t]*/gi, ' & ');
  text = text.replace(/\n[ \t]*(else|yet)[ \t]*/gi,            ' && ');
  text = text.replace(/\s+(else\s+if|elif|show)\s+/gi, ' & ');
  text = text.replace(/\s+else\s+(?!if)/gi,             ' && ');
  text = text.replace(/\s+yet\s+/gi,                    ' && ');
  return text;
}

function parseGOChain(raw) {
  let text = normalizeGORaw(raw.replace(/^GO\s*(?::\w+\s*)?/, "").trim());
  const parts  = splitGOParts(text);
  const branches = [];
  let makeElse = false;

  for (const part of parts) {
    branches.push(parseGOBranch(part.text.trim(), makeElse));
    if (part.isDoubleAmp) makeElse = true;
  }
  return branches;
}

function splitGOParts(text) {
  const parts = [];
  let cur = "", d = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") d++;
    else if (text[i] === "}") d--;

    if (d === 0 && text[i] === "&") {
      if (text[i + 1] === "&") {
        parts.push({ text: cur, isDoubleAmp: true });
        cur = ""; i++;
      } else {
        parts.push({ text: cur, isDoubleAmp: false });
        cur = "";
      }
    } else {
      cur += text[i];
    }
  }
  if (cur.trim()) parts.push({ text: cur, isDoubleAmp: false });
  return parts;
}

function parseGOBranch(text, isElse) {
  const b = {
    cond:       null,   
    condInline: null,   
    fn:         null,   
    bodyInline: null,   
    reps:       1,
    repsVar:    null,
    infinite:   false,
    isElse
  };

  text = String(text).trim();

  if (!isElse) {
    const ci = text.match(/^@\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
    if (ci) {
      b.condInline = ci[1].trim();
      text = text.slice(ci[0].length).trim();
    } else {
      const cv = text.match(/^@(\w+)/);
      if (cv) { b.cond = cv[1]; text = text.slice(cv[0].length).trim(); }
    }
  }

  if (text.startsWith("@{") || text.startsWith("{")) {
    const start = text.indexOf("{");
    const end   = findMatchingBrace(text, start);
    b.bodyInline = text.slice(start + 1, end).trim();
    text = text.slice(end + 1).trim();
  } else {
    const fn = text.match(/^@?(\w+)(?:\(\))?\s*/);
    if (fn) { b.fn = fn[1]; text = text.slice(fn[0].length).trim(); }
  }

  const rm = text.match(/^#(c|@?\w+|\d+)/);
  if (rm) {
    const r = rm[1];
    if (r === "c")           b.infinite = true;
    else if (/^\d+$/.test(r)) b.reps = parseInt(r);
    else                       b.repsVar = r.replace(/^@/, "");
  }

  return b;
}

function findMatchingBrace(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}") { d--; if (d === 0) return i; }
  }
  return s.length - 1;
}

// Interprete con async

class Interpreter {
  constructor({ output, input }) {
    this.out    = output || (s => console.log("[LINE]", s));
    this.inp    = input  || (() => Promise.resolve(""));
    this.fns    = new Map(); // FUN
    this.thens  = new Map(); // THEN
    this.labels = new Map(); // etichette KW:nome
    this.retVal = null;
    this.G      = new Scope();
    this.talkV        = false;
    this.talkVPrompt  = "";
    this._thisgoStack = [];   // stack di flags THISGO per GO annidati
    this._skipFlag    = false; // flag SKIP (continue)
    this._loopFlag    = null;  // flag del loop corrente (ROUND=N/F)
    this._loaded = new Set(["math"]); // math sempre attivo
  }

  async run(nodes, scope) {
    scope = scope || this.G;

    for (const n of nodes) {
      if (n.type === "FUN_DEF")  this.fns.set(n.name, n);
      if (n.type === "THEN_DEF") this.thens.set(n.name, n);
      if (n.label && n.type !== "LABEL_CALL") this.labels.set(n.label, n);
    }

    for (const n of nodes) {
      const sig = await this.exec(n, scope);
      if (sig === "RETURN") return "RETURN";
      if (sig === "SKIP" || this._skipFlag) return "SKIP"; 
    }
  }

  async exec(n, scope) {
    if (!n) return;
    switch (n.type) {
      case "FUN_DEF":
      case "THEN_DEF":    return;
      case "ASSIGN":      return this.execAssign(n, scope);
      case "ASSIGN_OP":   return this.execAssignOp(n, scope);
      case "DEFRET":      scope.defret = true; return;
      case "IO":          return this.execIO(n, scope);
      case "TALK_V":      return this.execTALKV(n, scope);
      case "TALK_F":      this.talkV = false; return;
      case "CONV":        return this.execConv(n, scope);
      case "GO_RAW":      return this.execGO(n, scope);
      case "FOR":         return this.execFOR(n, scope);
      case "ADD":         return this.execADD(n, scope);
      case "CANC":        return this.execCANC(n, scope);
      case "TRY":         return this.execTRY(n, scope);
      case "RETURN":
        this.retVal = this.evalFull(n.expr, scope);
        return "RETURN";
      case "SKIP":
        this._skipFlag = true;
        return "SKIP";
      case "CALL":
        await this.callFn(n.expr, scope);
        return;
      case "LABEL_CALL":  return this.execLabelCall(n.target, scope);
      case "TAKE":        return this.execTAKE(n);
      case "RAW":         return; 
    }
  }

  evalFull(expr, scope) {
    if (expr === undefined || expr === null || expr === "") return mkS("");
    expr = String(expr).trim();
    if (!expr) return mkS("");

    if (expr.startsWith("\\t")) {
      const r = scope.get(expr.slice(2).trim(), this);
      return mkS(r ? r.val.type : "undefined");
    }

    if (expr.startsWith("[")) return mkL(parseListLit(expr, scope, this));

    const laM = expr.match(/^(\w+)\[(.+)\]$/);
    if (laM) return this.listGet(laM[1], laM[2], scope);

    if (/^\w+\(/.test(expr)) {
      return this.callFnSync(expr, scope) || mkS("");
    }

    const inIdx = findOpFromRight(expr, " IN ");
    if (inIdx >= 0) {
      const leftE  = expr.slice(0, inIdx).trim();
      const rightE = expr.slice(inIdx + 4).trim();
      const lval = this.evalFull(leftE, scope);
      let rval;
      const rRec = scope.get(rightE, this);
      if (rRec) rval = rRec.val;
      else rval = this.evalFull(rightE, scope);
      const rStr = rval.value instanceof LList ? rval.value.display(false) : String(rval.value);
      if (rStr.startsWith("[")) {
        const items = splitSemicolon(rStr.slice(1, -1)).map(s => s.trim());
        return mkB(items.some(it => String(lval.value) === it) ? VT : VF);
      }
      return mkB(String(lval.value) === rStr ? VT : VF);
    }

    const resolved = resolveRefs(expr, scope, this);
    return evalTokens(resolved);
  }

  execAssign(n, scope) {
    if (n.varName === "EXTGO") {
      const val = this.evalFull(n.expr, scope);
      let s = scope;
      while (s) {
        if (s.vars.has("EXTGO")) { const rec = s.vars.get("EXTGO"); if (!rec.stay) rec.val = val; }
        s = s.parent;
      }
      if (String(val.value) === VF) {
        const curFlag = this._thisgoStack.length ? this._thisgoStack[this._thisgoStack.length - 1] : null;
        if (curFlag && curFlag.parentFlag) {
          curFlag.parentFlag.stopped = true;
          if (curFlag.parentFlag.ownLoopFlag) curFlag.parentFlag.ownLoopFlag.stopped = true;
        }
        s = scope;
        let skipped = false;
        while (s) {
          if (s.vars.has("THISGO")) {
            if (!skipped) { skipped = true; } 
            else { const rec = s.vars.get("THISGO"); if (!rec.stay) rec.val = mkB(VF); break; }
          }
          s = s.parent;
        }
      }
      return;
    }

    if (n.varName === "ROUND") {
      const val = this.evalFull(n.expr, scope);
      let s = scope;
      while (s) {
        if (s.vars.has("ROUND")) { const rec = s.vars.get("ROUND"); if (!rec.stay) rec.val = val; }
        s = s.parent;
      }
      if (String(val.value) === VF) {
        if (this._loopFlag) this._loopFlag.stopped = true;
        let ss = scope;
        while (ss) {
          if (ss.vars.has("THISGO")) { const rec = ss.vars.get("THISGO"); if (!rec.stay) rec.val = mkB(VF); }
          ss = ss.parent;
        }
      } else if (this._loopFlag) 
        const n = Number(val.value);
        if (!isNaN(n) && n > 0) this._loopFlag.roundTarget = n;
      }
      return;
    }

    if (n.varName === "THISGO") {
      const val = this.evalFull(n.expr, scope);
      let s = scope;
      while (s) {
        if (s.vars.has("THISGO")) {
          const rec = s.vars.get("THISGO");
          if (!rec.stay) rec.val = val;
        }
        s = s.parent;
      }
      if (val.value === VF && this._thisgoStack.length) {
        this._thisgoStack[this._thisgoStack.length - 1].stopped = true;
      }
      return;
    }

    const rawExpr = n.expr;
    let val;

    const laM = rawExpr.match(/^(\w+)\[(.+)\]$/);
    if (laM) {
      val = this.listGet(laM[1], laM[2], scope);
    }
    else if (/^\w+\(/.test(rawExpr)) {
      val = this.callFnSync(rawExpr, scope) || mkS("");
    }
    else {
      val = this.evalFull(rawExpr, scope);
    }
    const singleRef = rawExpr.match(/^@(\w+)$/);
    if (singleRef) {
      const r = scope.get(singleRef[1], this);
      if (r) val = { ...r.val };
    }
    if (!n.isNum && !n.isIF && val.type === TN && !rawExpr.includes("@") && !rawExpr.includes("(")) {
      if (/^-?\d+(\.\d+)?$/.test(rawExpr.trim())) {
        val = mkS(String(val.value));
      }
    }

    if (n.isNum) {
      if (val.type === TS) {
        if (val.value === VT || val.value === VF) {
          val = mkB(val.value);
        } else {
          const f = parseFloat(val.value);
          val = isNaN(f) ? (val.value === "" ? mkN(0) : mkN(1)) : mkN(f);
        }
      }
    }

    if (n.isIF) {
      if (val.type !== TB) val = mkB(truthy(val) ? VT : VF);
    }

    const exprStr = (n.isIF && rawExpr) ? rawExpr : null;
    scope.set(n.varName, val, { stay: n.stay, isIF: n.isIF, expr: exprStr, isRET: n.isRET, temp: n.temp });


  }

  execAssignOp(n, scope) {
    const rec = scope.get(n.varName, this);
    if (!rec) lerr("VAR_NOT_FOUND", `Variabile '${n.varName}' non trovata`);
    if (rec.val.type !== TN) lerr("NUMBER_EXPECTED", `Operatore ${n.op}= richiede un numero`);
    const rhs = Number(this.evalFull(n.expr, scope).value);
    let v = rec.val.value;
    switch (n.op) {
      case "+":  v += rhs; break;
      case "-":  v -= rhs; break;
      case "*":  v *= rhs; break;
      case "/":  if (!rhs) lerr("DIV_BY_ZERO", "Divisione per zero"); v /= rhs; break;
      case "//": if (!rhs) lerr("DIV_BY_ZERO", "Divisione per zero"); v = Math.trunc(v / rhs); break;
      case "%":  v %= rhs; break;
      case "^":  v = Math.pow(v, rhs); break;
      default:   lerr("SYNTAX_ERROR", `Operatore ${n.op}= sconosciuto`);
    }
    scope.set(n.varName, mkN(v), { isRET: n.isRET, temp: n.temp });
  }


  async execTALKV(n, scope) {
    this.talkV       = true;
    this.talkVPrompt = n.prompt || "";
    
  }

  async _askAndStoreASKED() {
    const val = await this.inp(this.talkVPrompt);
    this._setASKED(val);
    return val;
  }

  _setASKED(val) {
    const rec = this.G.vars.get("ASKED");
    if (rec) { rec.val = mkS(val); }
    else      { this.G.vars.set("ASKED", { val: mkS(val), stay: false, isIF: false, expr: null, isRET: false, temp: false }); }
  }

  async execIO(n, scope) {
    if (n.kw === "SCREAM") {
      const m = n.tpl.match(/@(\w+)/);
      if (m) {
        const r = scope.get(m[1], this);
        if (r && r.val.value instanceof LList) { this.out(r.val.value.display(true)); return; }
      }
    }

    if (this.talkV && (n.kw === "TALK" || n.kw === "OUT")) {
      const count = (n.tpl.match(/@ASKED/g) || []).length;
      if (count > 0) {
        const vals = [];
        for (let i = 0; i < count; i++) {
          const v = await this.inp(this.talkVPrompt);
          this._setASKED(v);
          vals.push(v);
        }
        let i = 0;
        const resolvedTpl = n.tpl.replace(/@ASKED/g, () => vals[i++] || "");
        const { text } = renderTpl(resolvedTpl, scope, this, false);
        if (text.trim()) this.out(text);
      } else {
        const { text } = renderTpl(n.tpl, scope, this, false);
        if (text.trim()) this.out(text);
      }
      return;
    }

    const allowIn = n.kw === "TALK" || n.kw === "INP";
    const { text, inputVars } = renderTpl(n.tpl, scope, this, allowIn);

    if (!allowIn && inputVars.length)
      lerr("VAR_NOT_FOUND", `Variabile '${inputVars[0]}' non trovata`);

    let remaining = text;
    for (const varName of inputVars) {
      const ph = `\x01${varName}\x01`;
      const idx = remaining.indexOf(ph);
      if (idx > 0) this.out(remaining.slice(0, idx));
      const prompt = (varName === "ASKED" && this.talkV) ? this.talkVPrompt : varName;
      const val = await this.inp(prompt);
      scope.set(varName, mkS(val), {});
      this._setASKED(val);
      remaining = remaining.slice(idx + ph.length);
    }
    if (remaining) this.out(remaining);
  }

  // conversion to...
  execConv(n, scope) {
    const r = scope.get(n.varN, this);
    if (!r) lerr("VAR_NOT_FOUND", `Variabile '${n.varN}' non trovata`);
    let v = r.val;
    if (n.op === "n") {
      if (v.type === TS) {
        const f = parseFloat(v.value);
        v = isNaN(f) ? (v.value === "" ? mkN(0) : mkN(1)) : mkN(f);
      } else if (v.type === TB) {
        v = mkN(v.value === VT ? 1 : 0);
      }
    } else if (n.op === "s") {
      v = mkS(v.value);
    } else if (n.op === "b") {
      if (v.type === TS) v = mkB(v.value === "" || v.value === VF ? VF : VT);
      else if (v.type === TN) v = mkB(v.value !== 0 ? VT : VF);
    }
    scope.set(n.varN, v, {});
  }
  execTAKE(n) {
    if (MODULES[n.module]) {
      this._loaded.add(n.module);
      return; 
    }
    this.out(`[TAKE] Modulo '${n.module}' non trovato. Usa .MODS per la lista.`);
  }
  async execGO(n, scope) {
    const chain = parseGOChain(n.raw);
    for (let bi = 0; bi < chain.length; bi++) {
      const branch = chain[bi];
      const cond = this._evalCond(branch, scope);
      if (!truthy(cond)) continue;
      await this._execBranch(branch, cond, scope);

      const isLoop = branch.infinite || branch.reps > 1 || branch.repsVar != null;
      if (isLoop) {
        const next = chain[bi + 1];
        if (next && next.isElse) {
          await this._execBranch(next, mkB(VT), scope);
        }
      }
      return;
    }
  }

  _evalCond(branch, scope) {
    if (branch.isElse)       return mkB(VT);
    if (branch.condInline)   return this.evalFull(branch.condInline, scope);
    if (branch.cond) {
      const r = scope.get(branch.cond, this);
      return r ? r.val : mkB(VF);
    }
    return mkB(VF);
  }

  async _execBranch(branch, condVal, scope) {
    const isLoop = branch.infinite || branch.reps > 1 || branch.repsVar != null;
    let round = 1;
    const loopFlag = isLoop ? { isLoop: true, stopped: false, roundTarget: null } : null;
    const prevLoopFlag = this._loopFlag;
    if (isLoop) this._loopFlag = loopFlag;  // sovrascrive solo per loop veri

    const execOnce = async () => {
      if (branch.bodyInline !== null)
        return this._runInlineBody(branch.bodyInline, scope, condVal, isLoop ? round : null);
      return this._runFnOrThen(branch.fn, scope, condVal, isLoop ? round : null);
    };

    if (branch.infinite) {
      let limit = 2_000_000;
      while (limit-- > 0) {
        const cv = this._evalCond(branch, scope);
        if (!truthy(cv)) break;
        const cont = await execOnce();
        if (loopFlag.roundTarget != null) { round = loopFlag.roundTarget; loopFlag.roundTarget = null; }
        else round++;
        if (!cont || loopFlag.stopped) break;
      }
    } else {
      let reps = branch.reps || 1;
      if (branch.repsVar) {
        const r = scope.get(branch.repsVar, this);
        reps = r ? Math.max(0, Math.round(Number(r.val.value))) : 1;
      }
      for (let i = 0; i < reps; i++) {
        const cont = await execOnce();
        if (loopFlag && loopFlag.roundTarget != null) {
          i = loopFlag.roundTarget - 2; round = loopFlag.roundTarget; loopFlag.roundTarget = null;
        } else round++;
        if (!cont || (loopFlag && loopFlag.stopped)) break;
      }
    }
    this._loopFlag = prevLoopFlag;  
  }

  async _runInlineBody(bodyStr, scope, condVal, round = null) {
    const nodes      = parse(bodyStr);
    const inner      = new Scope(scope);
    const parentFlag = this._thisgoStack.length ? this._thisgoStack[this._thisgoStack.length - 1] : null;
    const flag       = { val: condVal, parentFlag, ownLoopFlag: this._loopFlag };
    this._thisgoStack.push(flag);
    inner.set("THISGO", condVal, { temp: true }); 
    if (round !== null) inner.set("ROUND", mkN(round), { temp: true }); 
    inner.set("EXTGO", parentFlag ? { ...parentFlag.val } : mkB(VF), { temp: true });
    const isLoopBody = round !== null;
    flag.isLoop = isLoopBody;
    if (isLoopBody) this._skipFlag = false;
    await this.run(nodes, inner);
    this._thisgoStack.pop();
    if (isLoopBody && this._skipFlag) { this._skipFlag = false; return true; }
    const tg = inner.getRec("THISGO");
    const stopped = (tg && tg.val.value === VF) || flag.stopped;
    return !stopped;
  }

  async _runFnOrThen(name, scope, condVal, round = null) {
    if (!name) return true;
    const clean = name.replace(/^@/, "").replace(/\(\)$/, "");

    if (this.thens.has(clean)) {
      const inner      = new Scope(scope);
      const parentFlag = this._thisgoStack.length ? this._thisgoStack[this._thisgoStack.length - 1] : null;
      const flag       = { val: condVal, isLoop: round !== null, parentFlag, ownLoopFlag: this._loopFlag };
      this._thisgoStack.push(flag);
      inner.set("THISGO", condVal, { temp: true }); 
      if (round !== null) inner.set("ROUND", mkN(round), { temp: true }); 
      inner.set("EXTGO", parentFlag ? { ...parentFlag.val } : mkB(VF), { temp: true });
      this._skipFlag = false;
      await this.run(this.thens.get(clean).body, inner);
      this._thisgoStack.pop();
      if (round !== null && this._skipFlag) { this._skipFlag = false; return true; }
      const tg = inner.getRec("THISGO");
      const stopped = (tg && tg.val.value === VF) || flag.stopped;
      return !stopped;
    }
    if (this.fns.has(clean)) {
      await this.callFn(clean + "()", scope);
      return true;
    }
    lerr("FUNC_NOT_FOUND", `Funzione/then '${clean}' non trovata`);
  }


  async execFOR(n, scope) {
    const startN = Number(this.evalFull(n.start, scope).value) || 0;
    const stepN  = Number(this.evalFull(n.step,  scope).value) || 1;

    if (n.list === "NUMBERS") {
      const endN = Number(this.evalFull(n.end, scope).value);
      const cmp  = stepN > 0 ? (v => v <= endN) : (v => v >= endN);
      for (let v = startN; cmp(v); v += stepN) {
        const inner = new Scope(scope);
        inner.set("ONITEM",  mkN(v),  {});
        inner.set("ONINDEX", mkN(v),  {});
        inner.set("ONTAG",   mkS(""), {});
        await this._forBody(n.fn, inner, scope);
      }
      return;
    }

    const rec = scope.get(n.list, this);
    if (!rec || !(rec.val.value instanceof LList))
      lerr("LIST_NOT_FOUND", `Lista '${n.list}' non trovata`);
    const list = rec.val.value;
    const len  = list.items.length;
    if (!len) return;

    const endRaw = this.evalFull(n.end, scope).value;
    const endN   = (String(endRaw) === "-1") ? len - 1 : Math.min(len - 1, Number(endRaw));
    const start  = Math.max(0, startN);
    const cmp    = stepN > 0 ? (i => i <= endN) : (i => i >= endN);

    for (let idx = start; cmp(idx); idx += stepN) {
      if (idx < 0 || idx >= len) break;
      const item = list.items[idx];
      const inner = new Scope(scope);
      inner.set("ONITEM",  mkS(item.value instanceof LList ? item.value.display(false) : String(item.value)), {});
      inner.set("ONINDEX", mkN(idx), {});
      inner.set("ONTAG",   mkS(item.tags.join(",")), {});
      await this._forBody(n.fn, inner, scope);
    }
  }

  async _forBody(fn, inner, parentScope) {
    fn = fn.trim();
    if (fn.startsWith("{") || fn.startsWith("@{")) {
      const start = fn.indexOf("{");
      const body  = fn.slice(start + 1, findMatchingBrace(fn, start)).trim();
      await this.run(parse(body), inner);
      return;
    }
    const clean = fn.replace(/^@/, "").replace(/\(\)$/, "");
    if (this.thens.has(clean)) { await this.run(this.thens.get(clean).body, inner); return; }
    if (this.fns.has(clean))   { await this.callFn(clean + "()", parentScope); return; }
    lerr("FUNC_NOT_FOUND", `Funzione '${clean}' non trovata per FOR`);
  }
  execADD(n, scope) {
    const r = scope.get(n.list, this);
    if (!r || !(r.val.value instanceof LList))
      lerr("LIST_NOT_FOUND", `Lista '${n.list}' non trovata`);
    const list = r.val.value;
    const valRaw = n.val.trim();
    const segs   = splitPipe(valRaw);
    const rawVal = segs.pop().trim();
    const tags   = segs.map(s => s.trim()).filter(Boolean);
    const val    = this.evalFull(rawVal, scope).value;
    const item   = { value: val, tags };

    if (n.mode === "AT") {
      const idx = n.idx === "" ? list.items.length
                               : Number(this.evalFull(n.idx, scope).value);
      list.items.splice(idx, 0, item);
    } else { 
      const idx = Number(this.evalFull(n.idx, scope).value);
      list.items.splice(idx, 1, item);
    }
  }

  execCANC(n, scope) {
    const r = scope.get(n.list, this);
    if (!r || !(r.val.value instanceof LList))
      lerr("LIST_NOT_FOUND", `Lista '${n.list}' non trovata`);
    const list = r.val.value;

    if (n.mode === "AT") {
      let idx = Number(n.arg);
      if (idx < 0) idx = list.items.length + idx;
      list.items.splice(idx, 1);
    } else if (n.mode === "BY") {
      list.items = list.items.filter(it => !it.tags.includes(n.arg.trim()));
    } else if (n.mode === "IS") {
      list.items = list.items.filter(it => String(it.value) !== n.arg.trim());
    } else if (n.mode === "IN") {
      const tags = splitSemicolon(n.arg.replace(/^\[|\]$/g, "")).map(t => t.trim());
      list.items = list.items.filter(it => !tags.some(t => it.tags.includes(t)));
    }
  }

  async execTRY(n, scope) {
    let caught = null;
    try {
      await this.run(n.body, scope);
    } catch (e) {
      caught = e instanceof LErr ? e : new LErr("UNKNOWN_ERROR", String(e.message));
    }

    if (caught && n.show) {
      const ss = new Scope(scope);
      ss.set("ERRCODE", mkN(1), {});
      ss.set("ERRMSG",  mkS(caught.lmsg || caught.message), {});
      await this.run(n.show.body, ss);
    } else if (caught) {
      this.out(`ERRORE [${caught.code}]: ${caught.lmsg}`);
    }

    if (n.yet) await this.run(n.yet.body, new Scope(scope));
  }

  async callFn(expr, scope) {
    const nameM = expr.match(/^@?(\w+)\s*\((.*)\)\s*$/s);
    if (!nameM) return null;
    const name   = nameM[1];
    const argStr = nameM[2];

    if (ALL_FNS[name]) return this.callFnSync(expr, scope);

    const fn = this.fns.get(name) || this.thens.get(name);
    if (!fn) lerr("FUNC_NOT_FOUND", `Funzione '${name}' non trovata`);

    const fnScope = new Scope(this.G);
    if (fn.params && fn.params.length && argStr.trim()) {
      const args = splitArgs(argStr).map(a => this._evalArg(a, scope));
      fn.params.forEach((p, i) => fnScope.set(p, args[i] || mkS(""), {}));
    }
    this.retVal = null;
    await this.run(fn.body, fnScope);
    return this.retVal;
  }

  callFnSync(expr, scope) {
    const nameM = expr.match(/^@?(\w+)\s*\((.*)\)\s*$/s);
    if (!nameM) return null;
    const name   = nameM[1];
    const argStr = nameM[2]; 

    if (ALL_FNS[name]) {
      const argVals = argStr.trim() ? splitArgs(argStr).map(a => this._evalArg(a, scope)) : [];
      const vals    = argVals.map(a => a instanceof Object && "value" in a ? a.value : a);
      const types   = argVals.map(a => a instanceof Object && "type"  in a ? a.type  : "string");
      if (name.startsWith("type_")) return ALL_FNS[name](vals[0], types[0], vals[1], types[1]);
      return ALL_FNS[name](...vals);
    }
    const fn = this.fns.get(name) || this.thens.get(name);
    if (!fn) return null; 

    const fnScope = new Scope(this.G);
    if (fn.params && fn.params.length && argStr.trim()) {
      const args = splitArgs(argStr).map(a => this._evalArg(a, scope));
      fn.params.forEach((p, i) => fnScope.set(p, args[i] || mkS(""), {}));
    }

    for (const node of fn.body) {
      if (node.type === "RETURN")    { return this.evalFull(node.expr, fnScope); }
      if (node.type === "ASSIGN")    { this.execAssign(node, fnScope); }
      if (node.type === "ASSIGN_OP") { this.execAssignOp(node, fnScope); }
      if (node.type === "CONV")      { this.execConv(node, fnScope); }
    }
    return this.retVal || mkS("");
  }
  _evalArg(arg, scope) {
    if (arg === undefined || arg === null) return mkS("");
    if (arg.trim() === "" && arg.length > 0) return mkS(arg);
    arg = arg.trim();
    if (!arg) return mkS("");
    if (arg.startsWith("#")) return this.evalFull(arg, scope);
    if (arg.startsWith("@")) {
      const nm = arg.slice(1);
      const rec = scope.get(nm, this);
      if (rec) return rec.val;   
      return this.evalFull(arg, scope); 
    }
    if (/[+\-*/()\[\]]/.test(arg)) return this.evalFull(arg, scope);
    const rec = scope.get(arg, this);
    if (rec) return rec.val;
    if (/^-?\d+(\.\d+)?$/.test(arg)) return mkN(parseFloat(arg));
    return mkS(arg);
  }

  listGet(listName, key, scope) {
    const r = scope.get(listName, this);
    if (!r || !(r.val.value instanceof LList))
      lerr("LIST_NOT_FOUND", `Lista '${listName}' non trovata`);
    const list = r.val.value;
    key = key.trim();

    if (key.startsWith("#")) {
      const idx = Number(key.slice(1));
      const atItem = list.at(idx);
      if (atItem.value instanceof LList) return mkL(atItem.value);
      return mkS(String(atItem.value));
    }
    if (key.includes(";")) {
      const tags  = key.split(";").map(t => t.trim());
      const items = list.items.filter(it => tags.some(t => it.tags.includes(t)));
      return mkS(items.map(it => it.value instanceof LList ? it.value.display(false) : String(it.value)).join(", "));
    }
    const tagItem = list.byTag(key)[0];
    if (tagItem.value instanceof LList) return mkL(tagItem.value);
    return mkS(String(tagItem.value));
  }

  async execLabelCall(label, scope) {
    const n = this.labels.get(label);
    if (!n) lerr("SYNTAX_ERROR", `Etichetta '${label}' non trovata`);
    await this.exec(n, scope);
  }
}

async function LINE_run(src, options = {}) {
  const lines = [];
  const out = options.output || (s => { lines.push(s); console.log("[LINE]", s); });
  const inp = options.input  || (() => Promise.resolve(""));

  const trimmed = src.trim();
  if (trimmed === ".MODS") {
    out("Moduli disponibili:");
    for (const m of Object.keys(MODULES)) out("  " + m);
    return lines.join("\n");
  }
  const modQuery = trimmed.match(/^\.([A-Z]+)$/);
  if (modQuery) {
    const mname = modQuery[1].toLowerCase();
    if (MODULES[mname]) {
      out(`Modulo: ${mname}`);
      for (const [fn, desc] of Object.entries(MODULES[mname].docs || {}))
        out(`  ${mname}_${fn}  →  ${desc}`);
    } else {
      out(`Modulo '${mname}' non trovato. Usa .MODS per la lista.`);
    }
    return lines.join("\n");
  }

  const interp = new Interpreter({ output: out, input: inp });
  try {
    const nodes = parse(src);
    await interp.run(nodes, interp.G);
  } catch (e) {
    const msg = e instanceof LErr
      ? `ERRORE [${e.code}]: ${e.lmsg}`
      : `ERRORE INTERNO: ${e.message}`;
    out(msg);
    if (!(e instanceof LErr)) console.error("[LINE internal]", e);
  }
  return lines.join("\n");
}

G.LINE_run   = LINE_run;
G.LINE_parse = parse;

})(typeof window !== "undefined" ? window : global);

// AZZ finalmente è finito marò
