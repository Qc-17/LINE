# LINE 3.0

LINE è un linguaggio di programmazione interpretato, scritto in JavaScript, con sintassi in italiano.

Qui per la pagina: **<a href="https://qc-17.github.io/LINE">index</a>**

Progettato per essere leggibile, espressivo e facilmente integrabile in pagine web tramite **LINE-DOM**.

---

## Caratteristiche

- Sintassi verbosa e nominativa in italiano (`STAY`, `RET`, `THEN`, `GO`, `FOR`, `FUN`)
- Variabili reattive (`IF var = espressione` — si aggiorna automaticamente)
- Liste native con tag, accesso per indice o etichetta
- Moduli standard: `math`, `str`, `list`, `rand`, `io`, `type`, `conv`
- Gestione errori con `TRY / SHOW / YET`
- Eseguibile nel browser senza installazioni

---

## Uso nel browser

```html
<script src="https://qc-17.github.io/LINE/interpreter.js"></script>
```

```javascript
await LINE_run(sorgente, {
  output: s => console.log(s),
  input:  prompt => Promise.resolve(window.prompt(prompt))
});
```

---

## LINE-DOM

`line-dom.js` è il framework che collega LINE al DOM HTML.  
Permette di scrivere programmi LINE direttamente nell'HTML con routing verso elementi:

```html
<script src="https://qc-17.github.io/LINE/line-dom.js"></script>

<p id="saluto"></p>
<script type="text/line" autorun>
  <saluto>TALK Ciao, mondo!</saluto>
</script>
```

Funzionalità:
- Routing output su id, classe, localStorage
- Iniezione automatica degli input HTML come variabili LINE
- `after` / `before` per append/prepend
- Escape `\n` → `<br>`
- Attributi `trigger`, `autorun`, `replace`, `body-class`, `counter`
- Sintassi `THEN:btnId` / `GO:btnId` per agganciare blocchi a bottoni

---

## File

| File | Descrizione |
|---|---|
| `interpreter.js` | Interprete LINE 3.0 completo |
| `line-dom.js` | Framework HTML per LINE |
| `ide.html` | IDE online per scrivere ed eseguire programmi LINE |

---

## Licenza

Copyright © Qc-17  
Distribuito sotto licenza **GNU General Public License v3.0**  
[https://www.gnu.org/licenses/gpl-3.0.html](https://www.gnu.org/licenses/gpl-3.0.html)
