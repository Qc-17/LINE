/**
 * ═══════════════════════════════════════════════════════════
 *  LINE-DOM  —  Framework HTML per LINE 3.0
 *  Dipende da: interpreter.js (LINE_run deve essere globale)
 * ═══════════════════════════════════════════════════════════
 *
 *  ROUTING OUTPUT
 *  ──────────────
 *  <id>TALK testo</id>             → scrive in #id (replace)
 *  <id=after>TALK testo</id>       → appende in fondo a #id
 *  <id=before>TALK testo</id>      → inserisce all'inizio di #id
 *  <.cls>TALK testo</.cls>         → scrive in tutti gli elementi con classe cls
 *  <.cls=after>TALK testo</.cls>   → appende a tutti gli elementi con classe cls
 *
 *  LOCALSTORAGE
 *  ────────────
 *  <ls>var = valore</ls>   → salva "var" in localStorage con chiave "line_var"
 *                            le variabili salvate vengono iniettate ad ogni run
 *
 *  ESCAPE
 *  ──────
 *  \n nel testo → <br> negli elementi HTML (non negli input)
 *
 *  ONCLICK SU BLOCCO
 *  ─────────────────
 *  <script type="text/line" onclick="btnId:nomeLabel,btn2:label2">
 *  Aggancia il click di #btnId all'esecuzione del blocco THEN/FUN "nomeLabel"
 *
 *  ATTRIBUTI DEL TAG  <script type="text/line">
 *  ─────────────────────────────────────────────
 *  trigger="id"         → esegue l'intero programma al click di #id
 *  autorun              → esegue subito al caricamento
 *  loop                 → ri-esegue il programma ogni volta che termina
 *                         (usa input hidden o <ls> per persistere lo stato)
 *  replace              → ogni TALK sostituisce (default)
 *  counter="id"         → inietta __N__ e scrive il contatore in #id
 *  body-class="id"      → applica testo di #id come className del body
 *  onclick="btnId:lbl"  → aggancia click di #btnId al blocco lbl
 *
 *  NOTE SUI BUTTON ID
 *  ──────────────────
 *  THEN:id, FUN:id e GO:id supportano id con trattini: THEN:mio-btn nomeblocco
 *
 *  STATO PERSISTENTE SENZA localStorage
 *  ──────────────────────────────────────
 *  Usa un <input type="hidden" id="nome" value="0"> come memoria:
 *  - injectVars inietta automaticamente il suo valore come variabile LINE
 *  - <nome>TALK @nuovoValore</nome> aggiorna il valore dell'input
 *  - Alla prossima esecuzione il valore aggiornato è già disponibile come @nome
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

  /* ══════════════════════════════════════════════════════════
     1. PREPROCESSORE
     Trasforma <id>, <id=mode>, <.cls>, <ls> in marker OUT.
  ══════════════════════════════════════════════════════════ */
  function preprocess(src) {
    // Pre-pass: <ls>key = val</ls> → <ls>TALK key = val</ls>
    // Necessario perché "key = val" in LINE è un assegnamento (nessun output),
    // mentre handleLS si aspetta un valore in arrivo dall'output handler.
    // Se il contenuto inizia già con TALK o OUT, viene lasciato intatto.
    src = src.replace(
      /<ls>([\s\S]*?)<\/ls>/g,
      (match, inner) => {
        const t = inner.trim();
        if (!t || /^(TALK|OUT)\s/i.test(t)) return match;
        return '<ls>TALK ' + t + '</ls>';
      }
    );

    const lines = src.split("\n");
    const out   = [];
    const stack = [];

    for (const line of lines) {
      let rest = line, buf = "";

      while (rest.length > 0) {

        // Apertura: <name>, <name=mode>, <.cls>, <.cls=mode>, <ls>
        const openM = rest.match(/^(.*?)<(\.[.\w-]+|ls|[\w][\w-]*)(?:=([\w]+))?>([\s\S]*)$/);
        if (openM) {
          buf += openM[1];
          const name   = openM[2];
          const mode   = openM[3] || 'replace';
          const target = name + ':' + mode;
          stack.push(target);
          rest = openM[4];
          if (buf.trim()) out.push(buf.trimEnd());
          out.push(`OUT ${M_SET}${target}${M_SET}`);
          buf = ""; continue;
        }

        // Chiusura: </name>, </.cls>, </ls>
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
     2. RISOLVE TARGET  "nome:mode"
  ══════════════════════════════════════════════════════════ */
  function resolveTarget(target) {
    const i    = target.lastIndexOf(':');
    const name = target.slice(0, i);
    const mode = target.slice(i + 1);   // replace | after | before
    if (name === 'ls') return { isLS: true, mode };
    if (name.startsWith('.')) {
      return { elements: Array.from(document.getElementsByClassName(name.slice(1))), mode, isLS: false };
    }
    const el = document.getElementById(name);
    return { elements: el ? [el] : [], mode, isLS: false };
  }

  /* ══════════════════════════════════════════════════════════
     3. SCRITTURA SU ELEMENTO  (con escape \n → <br>)
  ══════════════════════════════════════════════════════════ */
  function writeToElements(elements, rawText, mode) {
    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();

      if (tag === 'input' || tag === 'textarea') {
        if      (mode === 'after')  el.value += rawText;
        else if (mode === 'before') el.value  = rawText + el.value;
        else                        el.value  = rawText;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Applica escape \n → <br>
      const html = rawText.replace(/\\n/g, '<br>');

      if      (mode === 'after')  el.innerHTML += html;
      else if (mode === 'before') el.innerHTML  = html + el.innerHTML;
      else                        el.innerHTML  = html;

      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
  }

  /* ══════════════════════════════════════════════════════════
     4. LOCALSTORAGE
  ══════════════════════════════════════════════════════════ */
  const LS_PREFIX = 'line_';

  function handleLS(text) {
    const eq = text.indexOf('=');
    if (eq < 0) return;
    const key = text.slice(0, eq).trim();
    const val = text.slice(eq + 1).trim();
    try { localStorage.setItem(LS_PREFIX + key, val); } catch(e) {}
  }

  function lsLoadAll() {
    const lines = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) {
          lines.push(`${k.slice(LS_PREFIX.length)} = ${localStorage.getItem(k)}`);
        }
      }
    } catch(e) {}
    return lines;
  }

  /* ══════════════════════════════════════════════════════════
     5. LETTURA DA ELEMENTO
  ══════════════════════════════════════════════════════════ */
  function readFromElement(el) {
    const tag = el.tagName.toLowerCase();
    return (tag === 'input' || tag === 'textarea' || tag === 'select')
      ? el.value : el.textContent.trim();
  }

  /* ══════════════════════════════════════════════════════════
     6. INIEZIONE VARIABILI  (input DOM + localStorage)
  ══════════════════════════════════════════════════════════ */
  function injectVars(src) {
    const lines = [];
    document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
      const val = el.value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
      lines.push(`${el.id} = ${val}`);
    });
    lines.push(...lsLoadAll());
    return lines.length ? lines.join('\n') + '\n' + src : src;
  }

  /* ══════════════════════════════════════════════════════════
     7. ONCLICK SCANNER
     Scansiona GO:id / THEN:id / FUN:id nel sorgente,
     registra i click listener, restituisce il sorgente pulito.
  ══════════════════════════════════════════════════════════ */
  function scanOnclick(src, runFn) {
    const lines   = src.split("\n");
    const cleaned = [];
    const blocks  = {};  // btnId → nome blocco da chiamare

    // Prima passata: trova i pattern e raccogli i nomi
    lines.forEach(line => {
      const trimmed = line.trim();

      // THEN:btnId nomeblocco
      // [\w-]+ invece di \w+ per supportare id con trattini (es. btn-submit)
      const thenM = trimmed.match(/^THEN:([\w-]+)\s+(\w+)/);
      if (thenM) {
        blocks[thenM[1]] = thenM[2];
        cleaned.push(line.replace(':' + thenM[1], ''));
        return;
      }

      // FUN:btnId nome(...)
      const funM = trimmed.match(/^FUN:([\w-]+)\s+(\w+)/);
      if (funM) {
        blocks[funM[1]] = funM[2];
        cleaned.push(line.replace(':' + funM[1], ''));
        return;
      }

      // GO:btnId @{...} — avvolge in un THEN anonimo generato
      const goM = trimmed.match(/^GO:([\w-]+)\s+/);
      if (goM) {
        const btnId    = goM[1];
        const autoName = '__go_' + btnId + '_' + Math.random().toString(36).slice(2, 7);
        blocks[btnId]  = autoName;
        cleaned.push('THEN ' + autoName);
        cleaned.push('  ' + line.replace(':' + btnId, '').trim());
        cleaned.push('THEND');
        return;
      }

      cleaned.push(line);
    });

    // Registra i listener per ogni btnId trovato
    Object.entries(blocks).forEach(([btnId, label]) => {
      const btn = document.getElementById(btnId);
      if (btn && !btn.__linedom_bound) {
        btn.__linedom_bound = true;
        btn.addEventListener('click', () => runFn(label));
      }
    });

    return cleaned.join("\n");
  }

  /* ══════════════════════════════════════════════════════════
     8. LINE_dom  —  API PRINCIPALE
  ══════════════════════════════════════════════════════════ */
  async function LINE_dom(src, options = {}) {
    if (typeof G.LINE_run !== 'function')
      throw new Error('[LINE-DOM] LINE_run non trovato. Carica interpreter.js prima di line-dom.js.');

    // Registra gli onclick inline (GO:id / THEN:id / FUN:id)
    // runBlock esegue il sorgente completo + chiamata al blocco
    const srcScanned = scanOnclick(src, async (label) => {
      await LINE_dom(src + '\n' + label + '()', options);
    });

    const processed   = preprocess(injectVars(srcScanned));
    let currentTarget = null;

    const outputHandler = (text) => {
      if (text.startsWith(M_SET) && text.endsWith(M_SET) && text.length > 2) {
        currentTarget = text.slice(1, -1); return;
      }
      if (text === M_RESET) { currentTarget = null; return; }

      if (currentTarget) {
        const { elements, mode, isLS } = resolveTarget(currentTarget);
        if (isLS) { handleLS(text); return; }
        if (elements.length) {
          writeToElements(elements, text, mode);
          if (typeof options.onRoute === 'function') options.onRoute(currentTarget, text, elements);
          return;
        }
      }
      if (typeof options.output === 'function') options.output(text);
      else console.log('[LINE]', text);
    };

    const inputHandler = async (prompt) => {
      const elById = document.getElementById(prompt);
      if (elById) return readFromElement(elById);
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
     9. AUTO-INIT  —  <script type="text/line" ...>
  ══════════════════════════════════════════════════════════ */
  function autoInit() {
    document.querySelectorAll('script[type="text/line"]').forEach(script => {
      const src         = script.textContent;
      const triggerId   = script.getAttribute('trigger');
      const autorun     = script.hasAttribute('autorun');
      const replace     = script.hasAttribute('replace');
      const counterId   = script.getAttribute('counter');
      const bodyClassId = script.getAttribute('body-class');
      const onclickAttr = script.getAttribute('onclick');
      // loop: ri-esegue il programma ogni volta che termina.
      // Utile per mantenere i blocchi THEN/FUN sempre registrati e
      // per rileggere lo stato da input hidden o localStorage ad ogni ciclo.
      const isLoop      = script.hasAttribute('loop');

      /* body-class */
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

      function getSrc() {
        n++;
        return counterId ? src.replace(/__N__/g, n) : src;
      }

      /* Esegue l'intero programma */
      async function runAll() {
        if (busy) return; busy = true;
        await LINE_dom(getSrc(), { replace });
        busy = false;
        // Se loop è attivo, ri-schedula la prossima esecuzione.
        // setTimeout(,0) cede il controllo all'event loop tra un'iterazione e l'altra,
        // così i click e gli aggiornamenti DOM vengono elaborati.
        if (isLoop) setTimeout(runAll, 0);
      }

      /* Esegue solo un blocco THEN/FUN — ri-esegue tutto ma chiama solo il blocco */
      async function runBlock(label) {
        if (busy) return; busy = true;
        await LINE_dom(getSrc() + '\n' + label + '()', { replace });
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
          const parts = pair.trim().split(':');
          if (parts.length < 2) return;
          const btnId = parts[0].trim();
          const label = parts[1].trim();
          const btn   = document.getElementById(btnId);
          if (btn) btn.addEventListener('click', () => runBlock(label));
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