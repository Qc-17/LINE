<div align="center">

# LINE 3.0

**Language with Intuitive and Natural Expression**

*Linguaggio di programmazione interpretato · keyword inglesi · eseguibile nel browser*  
*Interpreted programming language · English keywords · runs in the browser*

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Platform](https://img.shields.io/badge/platform-browser-orange)
![No install](https://img.shields.io/badge/install-none-lightgrey)

[🇮🇹 Italiano](#-italiano) · [🇬🇧 English](#-english) · [⌨ IDE](https://qc-17.github.io/LINE/ide.html) · [📖 Manuale / Docs](https://qc-17.github.io/LINE)

</div>

---

## 🇮🇹 Italiano

### Cos'è LINE?

LINE è un linguaggio di programmazione interpretato, progettato per essere comprensibile e facile da apprendere. Le keyword sono in inglese, verbose e nominative — ogni costrutto dice esattamente cosa fa, rendendolo leggibile quasi come testo naturale.

Un programma LINE viene salvato in un file con estensione `.line` ed eseguito dall'interprete, disponibile nel browser senza installazioni.

### Caratteristiche

| Funzionalità | Descrizione |
|---|---|
| **Keyword inglesi** | `TALK`, `STAY`, `FUN`, `THEN`, `GO`, `FOR`, `TRY` — leggibili e intuitive |
| **Tre tipi di variabile** | Standard, costanti (`STAY`) e reattive (`IF`) che si aggiornano automaticamente |
| **Liste native** | Con tag, accesso per indice o etichetta, iterazione con `FOR` |
| **Funzioni & blocchi** | `FUN` per le funzioni, `THEN` per i blocchi, `GO` per le condizioni |
| **Gestione errori** | `TRY` / `SHOW` / `YET` per catturare e gestire gli errori |
| **Moduli standard** | `math` · `str` · `list` · `rand` · `io` · `type` · `conv` |
| **LINE-DOM** | Integrazione diretta nel DOM HTML — zero JavaScript scritto a mano |

### Uso nel browser

```html
<script src="https://qc-17.github.io/LINE/interpreter.js"></script>
```

```javascript
await LINE_run(sorgente, {
  output: s => console.log(s),
  input:  prompt => Promise.resolve(window.prompt(prompt))
});
```

### LINE-DOM

`line-dom.js` è il layer che collega LINE al DOM HTML. Scrivi codice LINE direttamente dentro tag `<script type="text/line">` — LINE-DOM compila ed esegue il codice, collegandolo agli elementi HTML.

```html
<script src="https://qc-17.github.io/LINE/interpreter.js"></script>
<script src="https://qc-17.github.io/LINE/line-dom.js"></script>

<p id="saluto"></p>
<script type="text/line" autorun>
  <saluto>TALK Ciao, mondo!</saluto>
</script>
```

Funzionalità di LINE-DOM:

- Routing output su `id`, classe, `localStorage`
- Iniezione automatica degli input HTML come variabili LINE
- `after` / `before` per append/prepend
- Attributi `trigger`, `autorun`, `replace`, `body-class`, `counter`
- Blocchi agganciati a bottoni con `THEN:btnId` / `GO:btnId`

### File

| File | Descrizione |
|---|---|
| `interpreter.js` | Interprete LINE 3.0 completo |
| `line-dom.js` | Framework HTML per LINE |
| `ide.html` | IDE online — scrivi ed esegui nel browser |

### Contribuisci

LINE è un progetto aperto. Puoi contribuire segnalando bug, suggerendo funzionalità, scrivendo esempi o migliorando il manuale.

→ [Apri una issue su GitHub](https://github.com/qc-17/LINE/issues)

---

## 🇬🇧 English

### What is LINE?

LINE is an interpreted programming language designed to be understandable and easy to learn. Its keywords are in English, verbose and nominative — every construct says exactly what it does, making it readable almost like natural text.

A LINE program is saved in a file with the `.line` extension and executed by the interpreter, available in the browser with no installation required.

### Features

| Feature | Description |
|---|---|
| **English keywords** | `TALK`, `STAY`, `FUN`, `THEN`, `GO`, `FOR`, `TRY` — readable and intuitive |
| **Three variable types** | Standard, constants (`STAY`) and reactive (`IF`) that auto-update |
| **Native lists** | With tags, access by index or label, iteration with `FOR` |
| **Functions & blocks** | `FUN` for functions, `THEN` for blocks, `GO` for conditions |
| **Error handling** | `TRY` / `SHOW` / `YET` to catch and handle errors |
| **Standard modules** | `math` · `str` · `list` · `rand` · `io` · `type` · `conv` |
| **LINE-DOM** | Direct HTML DOM integration — zero handwritten JavaScript |

### Browser usage

```html
<script src="https://qc-17.github.io/LINE/interpreter.js"></script>
```

```javascript
await LINE_run(source, {
  output: s => console.log(s),
  input:  prompt => Promise.resolve(window.prompt(prompt))
});
```

### LINE-DOM

`line-dom.js` is the layer that connects LINE to the HTML DOM. Write LINE code directly inside `<script type="text/line">` tags — LINE-DOM compiles and executes the code, wiring it to HTML elements.

```html
<script src="https://qc-17.github.io/LINE/interpreter.js"></script>
<script src="https://qc-17.github.io/LINE/line-dom.js"></script>

<p id="greeting"></p>
<script type="text/line" autorun>
  <greeting>TALK Hello, world!</greeting>
</script>
```

LINE-DOM features:

- Output routing to `id`, class, `localStorage`
- Automatic injection of HTML inputs as LINE variables
- `after` / `before` for append/prepend
- Attributes: `trigger`, `autorun`, `replace`, `body-class`, `counter`
- Blocks hooked to buttons via `THEN:btnId` / `GO:btnId`

### Files

| File | Description |
|---|---|
| `interpreter.js` | Complete LINE 3.0 interpreter |
| `line-dom.js` | HTML framework for LINE |
| `ide.html` | Online IDE — write and run in the browser |

### Contribute

LINE is an open project. Contributions are welcome: bug reports, feature suggestions, code examples, or improvements to the manual.

→ [Open an issue on GitHub](https://github.com/qc-17/LINE/issues)

---

<div align="center">

Copyright © [qc-17](https://github.com/qc-17) · [GNU GPL v3.0](https://www.gnu.org/licenses/gpl-3.0.html)

</div>
