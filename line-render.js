/**
 * ══════════════════════════════════════════════════════════
 *  LINE-RENDER  —  Rendering LaTeX standard per LINE IDE
 *
 *  Dipende da (da caricare PRIMA di questo file):
 *    - KaTeX         katex.min.js
 *    - mhchem        contrib/mhchem.min.js   (solo per la chimica)
 *
 *  Sintassi LINE
 *  ─────────────
 *  Matematica: il contenuto è LaTeX puro.
 *
 *    RENDER{
 *      \int_0^1 x^2 \, dx = \frac{1}{3}
 *    }
 *
 *  Più formule nello stesso blocco: separale con una riga vuota.
 *  Ambienti multilinea (\begin{aligned} … \\ … \end{aligned}) funzionano
 *  normalmente, perché l'intero paragrafo è un'unica espressione LaTeX.
 *
 *  Chimica: prima riga CHEM, poi una riga per reazione/molecola (mhchem).
 *
 *    RENDER{
 *      CHEM
 *      2H2 + O2 -> 2H2O
 *      CH3COOH <=> CH3COO- + H+
 *    }
 *
 *  Si può anche usare \ce{...} direttamente dentro una formula.
 *
 *  HTML: prima riga HTML, poi il codice.
 *
 *    RENDER{
 *      HTML
 *      <h1>Titolo</h1>
 *    }
 *
 *  Inline nella console: \R formula LaTeX \R
 *
 *  API esposta:
 *    LINE_render_preprocess(src) → { processedSrc, blocks: [{index, content}] }
 *    LINE_render_html(content)   → stringa HTML da inserire nel DOM
 *    LINE_render_to_latex(src)   → sorgente LaTeX (per \R inline)
 *    LINE_RENDER_MARKER          → prefisso dei marker interni
 * ══════════════════════════════════════════════════════════
 */
(function (G) {
  'use strict';

  const RENDER_MARKER = '__LRENDER_';

  const KATEX_OPTS = {
    throwOnError: true,
    strict: 'ignore',
    trust: false
  };

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* LaTeX standard: nessuna traduzione, solo pulizia degli spazi */
  function toLatex(src) {
    return String(src).trim();
  }

  /* ── Modalità (prima riga del blocco) ── */
  function firstLine(raw) { return raw.split('\n')[0].trim().toUpperCase(); }
  function isHtmlMode(raw) { return firstLine(raw) === 'HTML'; }
  function isChemMode(raw) { return firstLine(raw) === 'CHEM'; }
  function bodyAfterFirstLine(raw) { return raw.split('\n').slice(1).join('\n').trim(); }

  /* ══════════════════════════════════════════════════════════
     PRE-PROCESSORE — sostituisce RENDER{...} con un marker TALK.
     Le graffe sono bilanciate; i caratteri preceduti da "\"
     (come \{ \} \\ del LaTeX) non vengono contati.
  ══════════════════════════════════════════════════════════ */
  function preprocessRender(src) {
    const blocks = [];
    let result = '', pos = 0, blockIdx = 0;
    const KW = 'RENDER{';

    while (pos < src.length) {
      const found = src.indexOf(KW, pos);
      if (found === -1) { result += src.slice(pos); break; }

      result += src.slice(pos, found);
      pos = found + KW.length;

      let depth = 1, content = '';
      while (pos < src.length && depth > 0) {
        const c = src[pos++];
        if (c === '\\' && pos < src.length) { content += c + src[pos++]; continue; }
        if (c === '{') { depth++; content += c; }
        else if (c === '}') { depth--; if (depth > 0) content += c; }
        else { content += c; }
      }

      blocks.push({ index: blockIdx, content: content.trim() });
      result += 'TALK ' + RENDER_MARKER + blockIdx + '__\n';
      blockIdx++;
    }

    return { processedSrc: result, blocks };
  }

  /* ══════════════════════════════════════════════════════════
     RENDERER — produce HTML da una stringa di contenuto
  ══════════════════════════════════════════════════════════ */
  function renderLatex(latex) {
    const container = document.createElement('div');
    katex.render(latex, container, Object.assign({ displayMode: true }, KATEX_OPTS));
    return container.innerHTML;
  }

  function errorHtml(e, latex) {
    let msg = escapeHtml(e && e.message ? e.message : e);
    if (/\\ce|\\pu/.test(latex) && /Undefined control sequence/.test(String(e && e.message))) {
      msg += ' — carica contrib/mhchem.min.js dopo katex.min.js';
    }
    return '<div class="lrender-err">⚠ ' + msg + '</div>';
  }

  function renderBlockToHTML(content) {
    if (typeof katex === 'undefined') {
      return '<div class="lrender-err">KaTeX non caricato — aggiungi katex.min.js</div>';
    }

    /* ── HTML ── */
    if (isHtmlMode(content)) {
      const htmlContent = bodyAfterFirstLine(content);
      if (!htmlContent) return '<div class="lrender-empty">HTML — scrivi il contenuto HTML sotto</div>';
      return '<div class="lrender-html">' + htmlContent + '</div>';
    }

    /* ── Chimica (mhchem) ── */
    if (isChemMode(content)) {
      const lines = bodyAfterFirstLine(content).split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return '<div class="lrender-empty">CHEM — scrivi la reazione sotto</div>';
      let html = '<div class="lrender-chem">';
      for (const line of lines) {
        const latex = /\\ce\s*\{|\\pu\s*\{/.test(line) ? line : '\\ce{' + line + '}';
        try {
          html += '<div class="lrender-mol"><div class="lrender-line">' + renderLatex(latex) + '</div></div>';
        } catch (e) {
          html += errorHtml(e, latex);
        }
      }
      return html + '</div>';
    }

    /* ── Matematica: LaTeX puro, un paragrafo = una formula ── */
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (!paragraphs.length) return '<div class="lrender-empty">—</div>';

    let html = '<div class="lrender-math">';
    paragraphs.forEach((p, idx) => {
      if (idx > 0) html += '<div class="lrender-sep"></div>';
      try {
        html += '<div class="lrender-line">' + renderLatex(toLatex(p)) + '</div>';
      } catch (e) {
        html += errorHtml(e, p);
      }
    });
    return html + '</div>';
  }

  /* ── API globale ── */
  G.LINE_render_preprocess = preprocessRender;
  G.LINE_render_html       = renderBlockToHTML;
  G.LINE_RENDER_MARKER     = RENDER_MARKER;
  G.LINE_render_to_latex   = toLatex;   // usato da ide.html per \R inline

})(typeof window !== 'undefined' ? window : global);
