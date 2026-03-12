/**
 * ═══════════════════════════════════════════════════════════
 *  LINE-DOM  —  Framework HTML per LINE 3.0
 *  Dipende da: interpreter.js (LINE_run deve essere globale)
 * ═══════════════════════════════════════════════════════════
 *
 *  ROUTING OUTPUT
 *  ──────────────
 *  <id>TALK testo</id>           → scrive in #id (replace)
 *  <id=after>TALK testo</id>     → appende in fondo a #id
 *  <id=before>TALK testo</id>    → inserisce all'inizio di #id
 *  <.cls>TALK testo</.cls>       → scrive in tutti gli elementi con classe .cls
 *  <.cls=after>TALK testo</.cls> → appende a tutti gli elementi con classe .cls
 *
 *  LOCALSTORAGE
 *  ────────────
 *  <ls>var = valore</ls>   → salva var in localStorage (KEY: "line_var")
 *                            e la inietta come variabile LINE ad ogni run
 *
 *  ESCAPE
 *  ──────
 *  \n nel testo → <br> nell'HTML (negli elementi non-input)
 *
 *  ONCLICK
 *  ───────
 *  Se l'etichetta di un THEN/FUN/GO corrisponde all'id di un bottone,
 *  line-dom registra automaticamente il click su quel bottone per
 *  eseguire quel blocco. Implementato tramite attributo onclick="label"
 *  nel tag script:
 *    <script type="text/line" onclick="btnId:label">
 *  Il formato è  btnId:nomeLabel  (più coppie separate da virgola)
 *
 *  ATTRIBUTI DEL TAG  <script type="text/line">
 *  ─────────────────────────────────────────────
 *  trigger="id"        → esegue l'intero programma al click
 *  autorun             → esegue subito al caricamento
 *  replace             → ogni TALK sostituisce (default: replace)
 *  counter="id"        → inietta __N__ e scrive il contatore in #id
 *  body-class="id"     → applica il testo di #id come className del body
 *  onclick="btnId:lbl" → aggancia click di #btnId all'esecuzione del
 *                        blocco THEN/FUN di nome lbl (virgola per più coppie)
 *
 *  API PROGRAMMATICA
 *  ─────────────────
 *  await LINE_dom(src, options)
 *    options: output, input, replace, separator, onRoute
 *
 * ═══════════════════════════════════════════════════════════
 */
(function (G) {
  "use strict";

  /* ── Marcatori interni ── */
  const M_SET   = "\x01";   // \x01<target>\x01  — imposta target corrente
  const M_RESET = "\x02";   // \x02              — reset al fallback
  const M_LS    = "\x03";   // \x03<key>=<val>   — localStorage set

  /* ══════════════════════════════════════════════════════════
     1. PREPROCESSORE
     Trasforma tag <id>, <id=after>, <.cls>, <ls> in marker OUT.
  ══════════════════════════════════════════════════════════ */
  function preprocess(src) {
    const lines = src.split("\n");
    const out   = [];
    const stack = [];   // stack di target attivi

    for (const line of lines) {
      let rest = line, buf = "";

      while (rest.length > 0) {

        /* ── Tag di apertura: <id>, <id=after>, <id=before>, <.cls>, <ls> ── */
        // Formato: <target> oppure <target=mode>
        const openM = rest.match(/^(.*?)<(\.[.\w-]+|ls|[\w][\w-]*)(?:=([\w]+))?>([\s\S]*)$/);
        if (openM) {
          buf += openM[1];
          const rawTarget = openM[2];
          const mode      = openM[3] || 'replace';  // replace | after | before
          const target    = rawTarget + ':' + mode;  // es. "myDiv:after"
          stack.push(target);
          rest = openM[4];
          if (buf.trim()) out.push(buf.trimEnd());
          out.push(`OUT ${M_SET}${target}${M_SET}`);
          buf = ""; continue;
        }

        /* ── Tag di chiusura: </id>, </.cls>, </ls> ── */
        const closeM = rest.match(/^(.*?)<\/(\.[\w-]+|ls|[\w][\w-]*)>([\s\S]*)$/);
        if (closeM) {
          buf += closeM[1];
          stack.pop();
          rest = closeM[3];
          if (buf.trim()) out.push(buf.trimEnd());
          const parent = stack[stack.length - 1];
          out.push(parent ? `OUT ${M_SET}${parent}${M_SET}` : `OUT ${M_RESET}`);
          buf = ""; continue;
        }

        buf += rest; break;
      }
      if (buf !== "") out.push(buf);
    }
    return out.join("\n");
  }

  /* ══════════════════════════════════════════════════════════
     2. ESCAPE  \n → <br>
  ══════════════════════════════════════════════════════════ */
  function applyEscape(text) {
    return text.replace(/\\n/g, '\n');
  }

  /* ══════════════════════════════════════════════════════════
     3. SCRITTURA SU ELEMENTO
  ══════════════════════════════════════════════════════════ */
  function writeToElements(elements, text, mode) {
    const escaped = applyEscape(text);
    const hasNewline = escaped.includes('\n');

    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();

      /* Input / textarea: sempre replace del value, no HTML */
      if (tag === 'input' || tag === 'textarea') {
        if (mode === 'after')  { el.value += text; }
        else if (mode === 'before') { el.value = text + el.value; }
        else                   { el.value = text; }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      /* Elemento generico: usa innerHTML per supportare <br> */
      if (mode === 'after') {
        el.innerHTML += hasNewline ? escaped.replace(/\n/g, '<br>') : escaped;
      } else if (mode === 'before') {
        el.innerHTML = (hasNewline ? escaped.replace(/\n/g, '<br>') : escaped) + el.innerHTML;
      } else {
        /* replace */
        el.innerHTML = hasNewline ? escaped.replace(/\n/g, '<br>') : escaped;
      }

      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
  }

  /* ── Risolve un target "nome:mode" → { elements, mode, isLS } ── */
  function resolveTarget(target) {
    const colonIdx = target.lastIndexOf(':');
    const name = target.slice(0, colonIdx);
    const mode = target.slice(colonIdx + 1);  // replace | after | before

    /* localStorage */
    if (name === 'ls') return { isLS: true, mode };

    /* Classe  .nomeclasse */
    if (name.startsWith('.')) {
      const cls = name.slice(1);
      return { elements: Array.from(document.getElementsByClassName(cls)), mode, isLS: false };
    }

    /* ID */
    const el = document.getElementById(name);
    return { elements: el ? [el] : [], mode, isLS: false };
  }

  /* ══════════════════════════════════════════════════════════
     4. LOCALSTORAGE
  ══════════════════════════════════════════════════════════ */
  const LS_PREFIX = 'line_';

  function lsSave(varName, value) {
    try { localStorage.setItem(LS_PREFIX + varName, value); } catch(e) {}
  }

  function lsLoadAll() {
    const lines = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(LS_PREFIX)) {
          const varName = k.slice(LS_PREFIX.length);
          const val     = localStorage.getItem(k);
          lines.push(`${varName} = ${val}`);
        }
      }
    } catch(e) {}
    return lines;
  }

  /* Quando il target è <ls>, il testo è "varName = valore" */
  function handleLS(text) {
    const eq = text.indexOf('=');
    if (eq < 0) return;
    const varName = text.slice(0, eq).trim();
    const value   = text.slice(eq + 1).trim();
    lsSave(varName, value);
  }

  /* ══════════════════════════════════════════════════════════
     5. LETTURA DA ELEMENTO
  ══════════════════════════════════════════════════════════ */
  function readFromElement(el) {
    const tag = el.tagName.toLowerCase();
    return (tag === 'input' || tag === 'textarea' || tag === 'select')
      ? el.value
      : el.textContent.trim();
  }

  /* ══════════════════════════════════════════════════════════
     6. INIEZIONE VARIABILI PRIMA DEL RUN
        - input/textarea/select[id] → variabile LINE
        - localStorage (prefisso line_) → variabile LINE
  ══════════════════════════════════════════════════════════ */
  function injectVars(src) {
    const lines = [];

    /* Input DOM */
    document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
      const val = el.value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
      lines.push(`${el.id} = ${val}`);
    });

    /* LocalStorage */
    lines.push(...lsLoadAll());

    return lines.length ? lines.join('\n') + '\n' + src : src;
  }

  /* ══════════════════════════════════════════════════════════
     7. LINE_dom  —  API PRINCIPALE
  ══════════════════════════════════════════════════════════ */
  async function LINE_dom(src, options = {}) {
    if (typeof G.LINE_run !== 'function')
      throw new Error('[LINE-DOM] LINE_run non trovato. Carica interpreter.js prima di line-dom.js.');

    const processed = preprocess(injectVars(src));

    let currentTarget = null;   // stringa "nome:mode" oppure null

    const outputHandler = (text) => {
      /* Marker SET */
      if (text.startsWith(M_SET) && text.endsWith(M_SET) && text.length > 2) {
        currentTarget = text.slice(1, -1); return;
      }
      /* Marker RESET */
      if (text === M_RESET) { currentTarget = null; return; }

      /* Scrittura verso target */
      if (currentTarget) {
        const { elements, mode, isLS } = resolveTarget(currentTarget);
        if (isLS) { handleLS(text); return; }
        if (elements.length) {
          writeToElements(elements, text, mode);
          if (typeof options.onRoute === 'function') options.onRoute(currentTarget, text, elements);
          return;
        }
      }

      /* Fallback */
      if (typeof options.output === 'function') options.output(text);
      else console.log('[LINE]', text);
    };

    const inputHandler = async (prompt) => {
      /* Cerca elemento con id = nome variabile */
      const elById = document.getElementById(prompt);
      if (elById) return readFromElement(elById);
      /* Prova il target corrente */
      if (currentTarget) {
        const { elements } = resolveTarget(currentTarget);
        if (elements.length) { const v = readFromElement(elements[0]); if (v !== '') return v; }
      }
      if (typeof options.input === 'function') return options.input(prompt);
      return '';
    };

    return G.LINE_run(processed, { output: outputHandler, input: inputHandler });
  }

  /* ══════════════════════════════════════════════════════════
     8. AUTO-INIT  —  <script type="text/line" ...>
  ══════════════════════════════════════════════════════════ */
  function autoInit() {
    document.querySelectorAll('script[type="text/line"]').forEach(script => {
      const src         = script.textContent;
      const triggerId   = script.getAttribute('trigger');
      const replace     = script.hasAttribute('replace');
      const autorun     = script.hasAttribute('autorun');
      const counterId   = script.getAttribute('counter');
      const bodyClassId = script.getAttribute('body-class');
      const onclickAttr = script.getAttribute('onclick');  // "btnId:label,btnId2:label2"

      /* body-class: MutationObserver su #id → body.className */
      if (bodyClassId) {
        const watchEl = document.getElementById(bodyClassId);
        if (watchEl) {
          new MutationObserver(() => {
            const cls = watchEl.textContent.trim();
            if (cls) document.body.className = cls;
          }).observe(watchEl, { childList: true, characterData: true, subtree: true });
        }
      }

      let busy = false, n = 0;

      /* Esegue l'intero programma */
      async function runAll() {
        if (busy) return; busy = true; n++;
        const resolved = counterId ? src.replace(/__N__/g, n) : src;
        await LINE_dom(resolved, { replace });
        busy = false;
      }

      /* Esegue solo il blocco THEN/FUN con nome label */
      async function runBlock(label) {
        if (busy) return; busy = true; n++;
        // Costruisce un mini-programma che chiama solo quel blocco
        // Estrae tutto il sorgente (serve per avere i THEN/FUN definiti)
        // e poi aggiunge una chiamata al blocco in fondo
        const resolved = (counterId ? src.replace(/__N__/g, n) : src)
          + '\n' + label + '()';
        await LINE_dom(resolved, { replace });
        busy = false;
      }

      /* trigger principale */
      if (triggerId) {
        const btn = document.getElementById(triggerId);
        if (btn) btn.addEventListener('click', runAll);
      }

      /* onclick="btnId:label,btnId2:label2" */
      if (onclickAttr) {
        onclickAttr.split(',').forEach(pair => {
          const [btnId, label] = pair.trim().split(':');
          if (!btnId || !label) return;
          const btn = document.getElementById(btnId.trim());
          if (btn) btn.addEventListener('click', () => runBlock(label.trim()));
        });
      }

      if (autorun) runAll();
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', autoInit);
  else
    autoInit();

  G.LINE_dom = LINE_dom;

})(typeof window !== 'undefined' ? window : global);
