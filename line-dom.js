/**
 * ═══════════════════════════════════════════════════════════
 *  LINE-DOM  —  Framework HTML per LINE 3.0
 *  Dipende da: interpreter.js (LINE_run deve essere globale)
 * ═══════════════════════════════════════════════════════════
 *
 *  SINTASSI NEL SORGENTE LINE
 *  ──────────────────────────
 *  Wrappa uno o più comandi LINE in tag <id>…</id>.
 *  L'id corrisponde all'id di un elemento HTML.
 *
 *    <myDiv>OUT Ciao mondo</myDiv>
 *    <mySpan>TALK Sei @nome, hai @eta anni</mySpan>
 *    <myInput>INP nome</myInput>
 *
 *  Tag multi-riga: tutti i comandi dentro il tag
 *  scrivono/leggono sullo stesso elemento.
 *
 *    <log>
 *      OUT Riga 1
 *      OUT Riga 2
 *    </log>
 *
 *  COMPORTAMENTO PER TIPO ELEMENTO
 *  ────────────────────────────────
 *  input / textarea  → .value = testo   (sostituisce)
 *  altri (div, p…)   → aggiunge <span>\n</span> per ogni OUT
 *                       (o sostituisce se options.replace = true)
 *
 *  INP dentro un tag  → legge .value dell'elemento;
 *                        se vuoto usa la callback options.input
 *
 *  API
 *  ───
 *  await LINE_dom(src, options)
 *
 *  options estende quelle di LINE_run:
 *    output(text)      → fallback per output senza tag
 *    input(prompt)     → fallback per input senza tag / elemento vuoto
 *    replace           → se true, ogni OUT sostituisce invece di appendere (default: false)
 *    separator         → separatore tra righe in append mode (default: '\n')
 *    onRoute(id, text) → callback opzionale chiamata ad ogni scrittura su DOM
 *
 * ═══════════════════════════════════════════════════════════
 */
(function (G) {
  "use strict";

  /* ── Marcatori invisibili nel flusso output ── */
  const M_SET   = "\x01";   // \x01<id>\x01  → imposta target
  const M_RESET = "\x02";   // \x02          → torna al fallback

  /* ── Pre-processore ────────────────────────────────────────
     Trasforma <id>...</id> iniettando marker OUT prima/dopo.
     Supporta tag annidati (l'id più vicino vince).
     Preserva le righe originali per numeri di errore corretti.
  ─────────────────────────────────────────────────────────── */
  function preprocess(src) {
    const lines = src.split("\n");
    const out   = [];
    const stack = [];   // stack degli id attivi

    for (const line of lines) {
      let rest = line;
      let buf  = "";

      while (rest.length > 0) {
        /* Tag di apertura  <id>  */
        const openM = rest.match(/^(.*?)<([\w][\w-]*)>([\s\S]*)$/);
        if (openM) {
          buf  += openM[1];           // testo prima del tag
          const id = openM[2];
          stack.push(id);
          rest = openM[3];
          /* Inietta marker SET */
          if (buf.trim()) out.push(buf.trimEnd());
          out.push(`OUT ${M_SET}${id}${M_SET}`);
          buf = "";
          continue;
        }

        /* Tag di chiusura  </id>  */
        const closeM = rest.match(/^(.*?)<\/([\w][\w-]*)>([\s\S]*)$/);
        if (closeM) {
          buf += closeM[1];
          stack.pop();
          rest = closeM[3];
          if (buf.trim()) out.push(buf.trimEnd());
          /* Inietta marker: torna all'id padre o reset */
          const parent = stack[stack.length - 1];
          out.push(parent
            ? `OUT ${M_SET}${parent}${M_SET}`
            : `OUT ${M_RESET}`);
          buf = "";
          continue;
        }

        buf += rest;
        break;
      }

      if (buf !== "") out.push(buf);
    }

    return out.join("\n");
  }

  /* ── Aggiorna un elemento HTML ─────────────────────────── */
  function writeToElement(el, text, opts) {
    const tag = el.tagName.toLowerCase();

    if (tag === "input" || tag === "textarea") {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const sep = opts.separator !== undefined ? opts.separator : "\n";

    if (opts.replace) {
      el.textContent = text;
    } else {
      /* Append mode: aggiunge riga */
      if (el.textContent && sep) {
        el.appendChild(document.createTextNode(sep));
      }
      el.appendChild(document.createTextNode(text));
    }

    /* Scroll automatico se l'elemento è scrollabile */
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
    }
  }

  /* ── Leggi da un elemento HTML (per INP) ──────────────── */
  function readFromElement(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return el.value;
    return el.textContent.trim();
  }

  /* ── LINE_dom ───────────────────────────────────────────── */
  async function LINE_dom(src, options = {}) {
    if (typeof G.LINE_run !== "function") {
      throw new Error("[LINE-DOM] LINE_run non trovato. Carica interpreter.js prima di line-dom.js.");
    }

    const processed = preprocess(src);
    const opts = {
      replace:   options.replace   || false,
      separator: options.separator !== undefined ? options.separator : "\n",
      onRoute:   options.onRoute   || null,
    };

    let currentId = null;   // id elemento corrente

    /* ── Output handler ── */
    const outputHandler = (text) => {
      /* Marker SET: imposta target */
      if (text.startsWith(M_SET) && text.endsWith(M_SET) && text.length > 2) {
        currentId = text.slice(1, -1);
        return;
      }
      /* Marker RESET: torna al fallback */
      if (text === M_RESET) {
        currentId = null;
        return;
      }

      /* Prova a scrivere nell'elemento DOM */
      if (currentId) {
        const el = document.getElementById(currentId);
        if (el) {
          writeToElement(el, text, opts);
          if (opts.onRoute) opts.onRoute(currentId, text, el);
          return;
        }
      }

      /* Fallback: callback utente o console */
      if (typeof options.output === "function") {
        options.output(text);
      } else {
        console.log("[LINE]", text);
      }
    };

    /* ── Input handler ── */
    const inputHandler = async (prompt) => {
      /* Se c'è un id corrente e l'elemento è un input, leggi da lì */
      if (currentId) {
        const el = document.getElementById(currentId);
        if (el) {
          const val = readFromElement(el);
          if (val !== "") return val;
        }
      }
      /* Fallback: callback utente */
      if (typeof options.input === "function") {
        return options.input(prompt);
      }
      return "";
    };

    return G.LINE_run(processed, {
      output: outputHandler,
      input:  inputHandler,
    });
  }

  /* ── Esponi globalmente ── */
  G.LINE_dom = LINE_dom;

})(typeof window !== "undefined" ? window : global);
