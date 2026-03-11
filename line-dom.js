/**
 * ═══════════════════════════════════════════════════════════
 *  LINE-DOM  —  Framework HTML per LINE 3.0
 *  Dipende da: interpreter.js (LINE_run deve essere globale)
 * ═══════════════════════════════════════════════════════════
 *
 *  SINTASSI NEL SORGENTE LINE
 *  ──────────────────────────
 *  <id>OUT testo</id>   → scrive in document.getElementById(id)
 *  <id>INP var</id>     → legge da quell'elemento
 *
 *  ATTRIBUTI DEL TAG  <script type="text/line">
 *  ─────────────────────────────────────────────
 *  trigger="id"      → esegue al click dell'elemento con quell'id
 *  autorun           → esegue subito al caricamento
 *  replace           → ogni OUT sostituisce (default: append)
 *  counter="id"      → scrive il contatore esecuzioni in quell'elemento
 *                       e inietta __N__ nel sorgente
 *  body-class="id"   → quando LINE scrive in quell'elemento,
 *                       il suo testo viene applicato come className al body
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

  const M_SET   = "\x01";
  const M_RESET = "\x02";

  /* ── Preprocessore ── */
  function preprocess(src) {
    const lines = src.split("\n");
    const out   = [];
    const stack = [];

    for (const line of lines) {
      let rest = line, buf = "";
      while (rest.length > 0) {
        const openM = rest.match(/^(.*?)<([\w][\w-]*)>([\s\S]*)$/);
        if (openM) {
          buf += openM[1];
          stack.push(openM[2]);
          rest = openM[3];
          if (buf.trim()) out.push(buf.trimEnd());
          out.push(`OUT ${M_SET}${openM[2]}${M_SET}`);
          buf = ""; continue;
        }
        const closeM = rest.match(/^(.*?)<\/([\w][\w-]*)>([\s\S]*)$/);
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

  /* ── Scrittura su elemento ── */
  function writeToElement(el, text, opts) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (opts.replace) {
      el.textContent = text;
    } else {
      const sep = opts.separator !== undefined ? opts.separator : "\n";
      if (el.textContent && sep) el.appendChild(document.createTextNode(sep));
      el.appendChild(document.createTextNode(text));
    }
    if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }

  /* ── Lettura da elemento ── */
  function readFromElement(el) {
    const tag = el.tagName.toLowerCase();
    return (tag === "input" || tag === "textarea") ? el.value : el.textContent.trim();
  }

  /* ── Inietta variabili da input DOM in cima al sorgente ── */
  function injectInputVars(src) {
    const lines = [];
    document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
      const val = el.value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
      lines.push(el.id + ' = ' + val);
    });
    return lines.length ? lines.join('\n') + '\n' + src : src;
  }

  /* ── LINE_dom (API programmatica) ── */
  async function LINE_dom(src, options = {}) {
    if (typeof G.LINE_run !== "function")
      throw new Error("[LINE-DOM] LINE_run non trovato. Carica interpreter.js prima di line-dom.js.");

    const processed = preprocess(injectInputVars(src));
    const opts = {
      replace:   options.replace   || false,
      separator: options.separator !== undefined ? options.separator : "\n",
      onRoute:   options.onRoute   || null,
    };

    let currentId = null;

    const outputHandler = (text) => {
      if (text.startsWith(M_SET) && text.endsWith(M_SET) && text.length > 2) {
        currentId = text.slice(1, -1); return;
      }
      if (text === M_RESET) { currentId = null; return; }
      if (currentId) {
        const el = document.getElementById(currentId);
        if (el) {
          writeToElement(el, text, opts);
          if (opts.onRoute) opts.onRoute(currentId, text, el);
          return;
        }
      }
      if (typeof options.output === "function") options.output(text);
      else console.log("[LINE]", text);
    };

    const inputHandler = async (prompt) => {
      // Prima cerca un elemento con id = nome della variabile
      const elById = document.getElementById(prompt);
      if (elById) return readFromElement(elById);
      // Poi prova l'elemento corrente (tag <id>INP</id>)
      if (currentId) {
        const el = document.getElementById(currentId);
        if (el) { const v = readFromElement(el); if (v !== "") return v; }
      }
      if (typeof options.input === "function") return options.input(prompt);
      return "";
    };

    return G.LINE_run(processed, { output: outputHandler, input: inputHandler });
  }

  /* ══════════════════════════════════════════════════════════
     AUTO-INIT  —  <script type="text/line" ...>
  ══════════════════════════════════════════════════════════ */
  function autoInit() {
    document.querySelectorAll('script[type="text/line"]').forEach(script => {
      const src          = script.textContent;
      const triggerId    = script.getAttribute('trigger');
      const replace      = script.hasAttribute('replace');
      const autorun      = script.hasAttribute('autorun');
      const counterId    = script.getAttribute('counter');
      const bodyClassId  = script.getAttribute('body-class');

      /* Se body-class è specificato, monta un MutationObserver
         che copia il testo dell'elemento come className del body */
      if (bodyClassId) {
        const watchEl = document.getElementById(bodyClassId);
        if (watchEl) {
          const applyClass = () => {
            const cls = watchEl.textContent.trim();
            if (cls) document.body.className = cls;
          };
          new MutationObserver(applyClass)
            .observe(watchEl, { childList: true, characterData: true, subtree: true });
        }
      }

      let busy = false, n = 0;

      async function run() {
        if (busy) return; busy = true; n++;
        const resolved = counterId ? src.replace(/__N__/g, n) : src;
        await LINE_dom(resolved, { replace });
        busy = false;
      }

      if (triggerId) {
        const btn = document.getElementById(triggerId);
        if (btn) btn.addEventListener('click', run);
      }
      if (autorun) run();
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', autoInit);
  else
    autoInit();

  G.LINE_dom = LINE_dom;

})(typeof window !== "undefined" ? window : global);