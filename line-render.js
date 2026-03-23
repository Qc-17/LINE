/**
 * ══════════════════════════════════════════════════════════
 *  LINE-RENDER  —  Motore di rendering matematico/chimico
 *  per LINE 3.0 IDE
 *
 *  Dipende da: KaTeX (deve essere caricato prima di questo file)
 *
 *  Sintassi LINE:
 *    RENDER{
 *      formula oppure espressione chimica
 *    }
 *
 *  Per la chimica la prima riga dentro il blocco deve essere CHEM:
 *    RENDER{
 *      CHEM
 *      C(HHH=O)
 *    }
 *
 *  API esposta:
 *    LINE_render_preprocess(src) → { processedSrc, blocks: [{index, content}] }
 *    LINE_render_html(content)   → stringa HTML da inserire nel DOM
 *    LINE_RENDER_MARKER          → prefisso dei marker interni
 *
 *  Basato sul motore FormulaMath (notazione simbolica → KaTeX)
 * ══════════════════════════════════════════════════════════
 */
(function (G) {
  'use strict';

  const RENDER_MARKER = '__LRENDER_';

  /* ── VARS ── */
  const VARS = new Set(['x','y','z','t','k','j','p','q','m','n','a','b','c','d','e','f','g','h']);

  /* ── HELPERS ── */
  function isSimple(s){let d=0;for(const c of s){if(c==='{')d++;else if(c==='}')d--;else if(d===0&&(c==='+'||c==='-'||c===' '))return false}return true}
  function isTall(s){return/\\frac|\\int|\\sum|\\prod|\\sqrt|\\begin/.test(s)}
  function funcArg(s){if(isSimple(s))return ' '+s;if(isTall(s))return '\\left('+s+'\\right)';return '('+s+')'}
  function explicitParen(s){return isTall(s)?'\\left('+s+'\\right)':'('+s+')'}
  function stripParen(s){if(s.startsWith('\\left(')&&s.endsWith('\\right)'))return s.slice(6,-7);if(s.startsWith('(')&&s.endsWith(')'))return s.slice(1,-1);return s}

  /* ── KEYWORDS ── */
  const KEYWORDS = [
    {k:'arcsin',type:'func',fn:x=>'\\arcsin'+funcArg(x)},
    {k:'arccos',type:'func',fn:x=>'\\arccos'+funcArg(x)},
    {k:'arctan',type:'func',fn:x=>'\\arctan'+funcArg(x)},
    {k:'CombR', type:'bifunc',fn:(n,k)=>'\\binom{'+n+'+'+k+'-1}{'+k+'}'},
    {k:'Mult',  type:'multifunc',fn:els=>'\\binom{'+els[0]+'}{'+els.slice(1).join(', ')+'}'},
    {k:'Perm',  type:'bifunc',fn:(n,k)=>k?'A_{'+n+'}^{'+k+'}':n+'!'},
    {k:'cond',  type:'func',fn:x=>'\\kappa'+funcArg(x)},
    {k:'sinh',  type:'func',fn:x=>'\\sinh'+funcArg(x)},
    {k:'cosh',  type:'func',fn:x=>'\\cosh'+funcArg(x)},
    {k:'tanh',  type:'func',fn:x=>'\\tanh'+funcArg(x)},
    {k:'Gam',type:'const',v:'\\Gamma'},{k:'Lam',type:'const',v:'\\Lambda'},
    {k:'Sig',type:'const',v:'\\Sigma'},{k:'The',type:'const',v:'\\Theta'},
    {k:'Phi',type:'const',v:'\\Phi'},{k:'Psi',type:'const',v:'\\Psi'},
    {k:'phi',type:'const',v:'\\varphi'},{k:'the',type:'const',v:'\\theta'},
    {k:'chi',type:'const',v:'\\chi'},{k:'psi',type:'const',v:'\\psi'},
    {k:'alp',type:'const',v:'\\alpha'},{k:'bet',type:'const',v:'\\beta'},
    {k:'gam',type:'const',v:'\\gamma'},{k:'lam',type:'const',v:'\\lambda'},
    {k:'eps',type:'const',v:'\\varepsilon'},{k:'eta',type:'const',v:'\\eta'},
    {k:'zet',type:'const',v:'\\zeta'},{k:'kap',type:'const',v:'\\kappa'},
    {k:'rho',type:'const',v:'\\rho'},{k:'sig',type:'const',v:'\\sigma'},
    {k:'ome',type:'const',v:'\\omega'},
    {k:'del',type:'optfunc',sym:'\\delta',fn:x=>'\\delta '+x},
    {k:'do2',type:'deco',fn:x=>'\\ddot{'+x+'}'},
    {k:'sin',type:'func',fn:x=>'\\sin'+funcArg(x)},
    {k:'cos',type:'func',fn:x=>'\\cos'+funcArg(x)},
    {k:'tan',type:'func',fn:x=>'\\tan'+funcArg(x)},
    {k:'cot',type:'func',fn:x=>'\\cot'+funcArg(x)},
    {k:'sec',type:'func',fn:x=>'\\sec'+funcArg(x)},
    {k:'csc',type:'func',fn:x=>'\\csc'+funcArg(x)},
    {k:'exp',type:'func',fn:x=>'\\exp'+funcArg(x)},
    {k:'log',type:'func',fn:x=>'\\log'+funcArg(x)},
    {k:'oo', type:'func',fn:x=>'o('+x+')'},
    {k:'Om', type:'const',v:'\\Omega'},{k:'mu',type:'const',v:'\\mu'},
    {k:'nu', type:'const',v:'\\nu'},{k:'xi',type:'const',v:'\\xi'},
    {k:'pi', type:'const',v:'\\pi'},{k:'eu',type:'const',v:'\\mathrm{e}'},
    {k:'na', type:'const',v:'\\nabla'},{k:'in',type:'const',v:'\\in'},
    {k:'ni', type:'const',v:'\\ni'},{k:'su',type:'const',v:'\\subset'},
    {k:'vc', type:'deco',fn:x=>'\\vec{'+x+'}'},
    {k:'ha', type:'deco',fn:x=>'\\hat{'+x+'}'},
    {k:'ba', type:'deco',fn:x=>'\\bar{'+x+'}'},
    {k:'ti', type:'deco',fn:x=>'\\tilde{'+x+'}'},
    {k:'do', type:'deco',fn:x=>'\\dot{'+x+'}'},
    {k:'fl', type:'deco',fn:x=>'\\lfloor '+x+' \\rfloor'},
    {k:'ce', type:'deco',fn:x=>'\\lceil '+x+' \\rceil'},
    {k:'sg', type:'func',fn:x=>'\\operatorname{sgn}'+funcArg(x)},
    {k:'tr', type:'func',fn:x=>'\\operatorname{tr}'+funcArg(x)},
    {k:'re', type:'func',fn:x=>'\\operatorname{Re}'+funcArg(x)},
    {k:'im', type:'func',fn:x=>'\\operatorname{Im}'+funcArg(x)},
    {k:'Db', type:'optfunc',sym:'\\nabla',fn:x=>'\\nabla '+x},
    {k:'dp', type:'optfunc',sym:'\\partial',fn:x=>'\\partial '+x},
    {k:'de', type:'optfunc',sym:'d',fn:x=>'d '+x},
    {k:'ln', type:'func',fn:x=>'\\ln'+funcArg(x)},
    {k:'O',  type:'func',fn:x=>'\\mathcal{O}('+x+')'},
    {k:'I',  type:'const',v:'\\infty'},
  ].sort((a,b)=>b.k.length-a.k.length);

  /* ── PARSER ── */
  class MathParser {
    constructor(src){this.s=src;this.i=0}
    eof(){return this.i>=this.s.length}
    ch(n=0){return this.s[this.i+n]}
    ws(){while(!this.eof()&&this.ch()===' ')this.i++}
    px(src){return new MathParser(src).parseExpr()}

    readBalanced(op='(',cl=')'){
      if(this.ch()!==op)return null;
      this.i++;let d=1,acc='';
      while(!this.eof()){const c=this.s[this.i++];if(c===op){d++;acc+=c}else if(c===cl){d--;if(d===0)break;acc+=c}else acc+=c}
      return acc
    }
    readDigits(){let s='';while(!this.eof()&&/\d/.test(this.ch()))s+=this.s[this.i++];return s}

    parseExpr(){
      this.ws();let r=this.parseTerm();this.ws();
      while(!this.eof()){
        const c=this.ch();
        if(c==='<'&&this.ch(1)==='='&&this.ch(2)==='>'){this.i+=3;this.ws();r+=' \\Leftrightarrow '+this.parseTerm();this.ws()}
        else if(c==='='&&this.ch(1)==='>'){this.i+=2;this.ws();r+=' \\Rightarrow '+this.parseTerm();this.ws()}
        else if(c==='-'&&this.ch(1)==='>'){this.i+=2;this.ws();r+=' \\to '+this.parseTerm();this.ws()}
        else if(c==='!'&&this.ch(1)==='='){this.i+=2;this.ws();r+=' \\neq '+this.parseTerm();this.ws()}
        else if(c==='<'&&this.ch(1)==='='){this.i+=2;this.ws();r+=' \\leq '+this.parseTerm();this.ws()}
        else if(c==='>'&&this.ch(1)==='='){this.i+=2;this.ws();r+=' \\geq '+this.parseTerm();this.ws()}
        else if(c==='+'){this.i++;this.ws();r+=' + '+this.parseTerm();this.ws()}
        else if(c==='-'){this.i++;this.ws();r+=' - '+this.parseTerm();this.ws()}
        else if(c==='='){this.i++;this.ws();r+=' = '+this.parseTerm();this.ws()}
        else if(c==='~'){this.i++;this.ws();r+=' \\approx '+this.parseTerm();this.ws()}
        else if(c==='<'){this.i++;this.ws();r+=' < '+this.parseTerm();this.ws()}
        else if(c==='>'){this.i++;this.ws();r+=' > '+this.parseTerm();this.ws()}
        else break
      }
      return r
    }

    parseTerm(){
      const parts=[];
      let atom=this.parseAtom();
      if(atom===null)return '';
      atom=this.parsePowerSub(atom);
      this.ws();
      if(!this.eof()&&this.ch()==='/'){this.i++;this.ws();atom='\\frac{'+stripParen(atom)+'}{'+this.parseParenOrAtom()+'}'}
      parts.push(atom);
      while(!this.eof()){
        this.ws();if(this.eof())break;
        const c=this.ch();
        if(['+','-',')','=','~','<','>',',',';','|'].includes(c)||(c==='!'&&this.ch(1)==='=')||(c==='='&&this.ch(1)==='>')||(c==='-'&&this.ch(1)==='>')||(c==='<'&&this.ch(1)==='=')||(c==='>'&&this.ch(1)==='=')||(c==='<'&&this.ch(1)==='='&&this.ch(2)==='>'))break;
        if(c==='*'){
          this.i++;this.ws();
          let mult=this.parseAtom();if(mult===null)break;
          mult=this.parsePowerSub(mult);this.ws();
          if(!this.eof()&&this.ch()==='/'){this.i++;this.ws();parts.push('\\cdot \\frac{'+stripParen(mult)+'}{'+this.parseParenOrAtom()+'}')}
          else parts.push('\\cdot '+mult);
          continue
        }
        const saved=this.i;
        let next=this.parseAtom();
        if(next===null||next===''){this.i=saved;break}
        next=this.parsePowerSub(next);this.ws();
        if(!this.eof()&&this.ch()==='/'){this.i++;this.ws();parts.push('\\frac{'+stripParen(next)+'}{'+this.parseParenOrAtom()+'}')}
        else parts.push(next)
      }
      return parts.join(' ')
    }

    parseParenOrAtom(){
      this.ws();
      if(!this.eof()&&this.ch()==='(')return this.px(this.readBalanced());
      let a=this.parseAtom()??'';return this.parsePowerSub(a)
    }

    parsePowerSub(base){
      this.ws();
      while(!this.eof()){
        if(this.ch()==='^'&&this.ch(1)==='('){this.i++;base=base+'^{'+this.px(this.readBalanced())+'}';this.ws()}
        else if(this.ch()==='#'&&this.ch(1)==='('){this.i++;base=base+'_{'+this.px(this.readBalanced())+'}';this.ws()}
        else if(this.ch()==='!'&&this.ch(1)!=='='){this.i++;base=base+'!';this.ws()}
        else break
      }
      return base
    }

    parseAtom(){
      this.ws();if(this.eof())return null;
      const c=this.ch();
      if(c==='-'){this.i++;const a=this.parseAtom();return a?'-'+a:'-'}
      if(c==='+'){this.i++;return this.parseAtom()}
      if(c==='('){const inner=this.readBalanced();if(inner===null)return null;return explicitParen(this.px(inner))}
      if(c==='|'&&this.ch(1)==='|'){
        this.i+=2;let acc='';
        while(!this.eof()){if(this.ch()==='|'&&this.ch(1)==='|'){this.i+=2;break}acc+=this.s[this.i++]}
        return '\\left\\|'+this.px(acc)+'\\right\\|'
      }
      if(c==='|'){
        this.i++;let acc='';
        while(!this.eof()&&this.ch()!=='|')acc+=this.s[this.i++];
        if(!this.eof())this.i++;
        return '\\left|'+this.px(acc)+'\\right|'
      }
      for(const kw of KEYWORDS){
        if(!this.s.startsWith(kw.k,this.i))continue;
        const j=this.i+kw.k.length;
        if(kw.type==='const'){this.i=j;return kw.v}
        if(kw.type==='func'||kw.type==='deco'){
          if(j<this.s.length&&this.s[j]==='('){this.i=j;return kw.fn(this.px(this.readBalanced()))}
          continue
        }
        if(kw.type==='optfunc'){
          this.i=j;
          if(!this.eof()&&this.ch()==='(')return kw.fn(this.px(this.readBalanced()));
          return kw.sym
        }
        if(kw.type==='bifunc'){
          if(j<this.s.length&&this.s[j]==='('){
            this.i=j;const inner=this.readBalanced();
            const si=inner.indexOf(';');
            const a=si>=0?this.px(inner.slice(0,si).trim()):this.px(inner.trim());
            const b=si>=0?this.px(inner.slice(si+1).trim()):'';
            return kw.fn(a,b)
          }
          continue
        }
        if(kw.type==='multifunc'){
          if(j<this.s.length&&this.s[j]==='('){
            this.i=j;return kw.fn(this.readBalanced().split(';').map(e=>this.px(e.trim())))
          }
          continue
        }
      }
      if(c==='R'){
        const saved=this.i;this.i++;const n=this.readDigits();
        if(!this.eof()&&this.ch()==='('){const L=this.px(this.readBalanced());return(!n||n==='2')?'\\sqrt{'+L+'}':'\\sqrt['+n+']{'+L+'}'}
        this.i=saved
      }
      if(c==='s'&&this.ch(1)==='('){
        this.i++;const bounds=this.readBalanced();
        if(!this.eof()&&this.ch()==='('){
          const expr=this.readBalanced();const ci=bounds.indexOf(',');
          const fL=ci>=0&&bounds.slice(0,ci).trim()?this.px(bounds.slice(0,ci).trim()):'';
          const tL=ci>=0&&bounds.slice(ci+1).trim()?this.px(bounds.slice(ci+1).trim()):'';
          return '\\sum'+(fL?'_{'+fL+'}':'')+(tL?'^{'+tL+'}':'')+' '+this.px(expr)
        }
        return 's'
      }
      if(c==='P'&&this.ch(1)==='('){
        this.i++;const bounds=this.readBalanced();
        if(!this.eof()&&this.ch()==='('){
          const expr=this.readBalanced();const ci=bounds.indexOf(',');
          const fL=ci>=0&&bounds.slice(0,ci).trim()?this.px(bounds.slice(0,ci).trim()):'';
          const tL=ci>=0&&bounds.slice(ci+1).trim()?this.px(bounds.slice(ci+1).trim()):'';
          return '\\prod'+(fL?'_{'+fL+'}':'')+(tL?'^{'+tL+'}':'')+' '+this.px(expr)
        }
        return 'P'
      }
      if(c==='S'&&this.ch(1)==='('){
        this.i++;const bounds=this.readBalanced();
        if(!this.eof()&&this.ch()==='('){
          const expr=this.readBalanced();const ci=bounds.indexOf(',');
          const fL=ci>=0&&bounds.slice(0,ci).trim()?this.px(bounds.slice(0,ci).trim()):'';
          const tL=ci>=0&&bounds.slice(ci+1).trim()?this.px(bounds.slice(ci+1).trim()):'';
          const dv=(expr.match(/[xyzt]/)||['x'])[0];
          return '\\int'+(fL?'_{'+fL+'}':'')+(tL?'^{'+tL+'}':'')+' '+this.px(expr)+' \\, d'+dv
        }
        return 'S'
      }
      if(c==='L'&&this.ch(1)==='('){
        this.i++;const tend=this.readBalanced();
        if(!this.eof()&&this.ch()==='('){
          const expr=this.readBalanced();const tL=this.px(tend);
          const dv=(expr.match(/[xyzt]/)||['x'])[0];
          return '\\lim_{'+dv+' \\to '+tL+'} '+this.px(expr)
        }
        return 'L'
      }
      if(c==='M'&&this.ch(1)==='('){
        this.i++;const dims=this.readBalanced();
        if(!this.eof()&&this.ch()==='('){
          const body=this.readBalanced();const si=dims.indexOf(';');
          const rows=parseInt(dims.slice(0,si).trim());const cols=parseInt(dims.slice(si+1).trim());
          const els=body.split(';').map(e=>this.px(e.trim()));
          let mat='\\begin{pmatrix}';
          for(let r=0;r<rows;r++){const row=[];for(let co=0;co<cols;co++)row.push(els[r*cols+co]??'0');mat+=row.join(' & ');if(r<rows-1)mat+=' \\\\ '}
          return mat+'\\end{pmatrix}'
        }
        return 'M'
      }
      if(c==='C'&&this.ch(1)==='('){
        this.i++;const inner=this.readBalanced();const si=inner.indexOf(';');
        const nL=si>=0?this.px(inner.slice(0,si).trim()):'';
        const kL=si>=0?this.px(inner.slice(si+1).trim()):'';
        return '\\binom{'+nL+'}{'+kL+'}'
      }
      if(c==='v'&&this.ch(1)==='('){
        this.i++;const els=this.readBalanced().split(';').map(e=>this.px(e.trim()));
        return '\\begin{pmatrix} '+els.join(' \\\\ ')+' \\end{pmatrix}'
      }
      if(c==='D'){
        this.i++;
        if(!this.eof()&&this.ch()==='('){
          const inner=this.readBalanced();const iL=this.px(inner);
          return isSimple(iL)?'\\Delta '+iL:'\\Delta\\left('+iL+'\\right)'
        }
        return '\\Delta'
      }
      if(/\d/.test(c)){
        let num=this.readDigits();
        if(!this.eof()&&this.ch()==='.'&&/\d/.test(this.ch(1))){this.i++;return num+'{,}'+this.readDigits()}
        if(!this.eof()&&VARS.has(this.ch()))return num+' '+this.parseVarPowerSub();
        return num
      }
      if(VARS.has(c))return this.parseVarPowerSub();
      if(c==='i'){this.i++;return '\\mathrm{i}'}
      if(/[a-zA-Z]/.test(c)){
        this.i++;let pr='';
        while(!this.eof()&&this.ch()==="'"){pr+='\\prime';this.i++}
        return pr?c+'^{'+pr+'}':c
      }
      return null
    }

    parseVarPowerSub(){
      const v=this.s[this.i++];if(this.eof())return v;
      if(this.ch()==="'"){let pr='';while(!this.eof()&&this.ch()==="'"){pr+='\\prime';this.i++}return v+'^{'+pr+'}'}
      if(/\d/.test(this.ch()))return v+'^{'+this.readDigits()+'}';
      return v
    }
  }

  function toLatex(src) {
    const s = src.trim(); if (!s) return '';
    try { return new MathParser(s).parseExpr(); }
    catch(e) { return '\\text{errore}'; }
  }

  /* ── CHEM ── */
  function isChemMode(raw) { return raw.split('\n')[0].trim().toUpperCase() === 'CHEM'; }
  function getChemLines(raw) { return raw.split('\n').slice(1).map(l => l.trim()).filter(Boolean); }

  function parseChem(src) {
    let pos = 0;
    const peek = () => pos < src.length ? src[pos] : '';
    function readBond(){const c=peek();if(c==='='){pos++;return'='}if(c==='#'){pos++;return'#'}if(c==='-')pos++;return'-'}
    function readAtom(){if(!/[A-Z]/.test(peek()))return'';let n=src[pos++];while(pos<src.length&&/[a-z]/.test(peek()))n+=src[pos++];return n}
    function readNode(bond){
      const atom=readAtom();if(!atom)return null;
      const node={atom,bond,children:[]};
      if(peek()==='('){
        pos++;
        while(pos<src.length&&peek()!==')'){const b=readBond();const child=readNode(b);if(child)node.children.push(child)}
        if(peek()===')') pos++
      }
      return node
    }
    return readNode('-')
  }

  function layoutChem(root) {
    const U=72,PAD=52,nodes=[],edges=[],taken=new Set();
    const key=(x,y)=>x+','+y;
    function place(node,gx,gy,dx,dy){
      node.gx=gx;node.gy=gy;nodes.push(node);taken.add(key(gx,gy));
      const chain=node.children.find(c=>c.atom!=='H');
      const subs=node.children.filter(c=>c!==chain);
      const perps=dx!==0?[{dx:0,dy:-1},{dx:0,dy:1},{dx:-dx,dy:0}]:[{dx:-1,dy:0},{dx:1,dy:0},{dx:0,dy:-dy}];
      const dirs=[...perps,{dx,dy}];
      if(chain){edges.push({from:node,to:chain,bond:chain.bond});place(chain,gx+dx,gy+dy,dx,dy)}
      let pi=0;
      for(const sub of subs){
        let ok=false;
        for(let t=0;t<dirs.length*3;t++){
          const d=dirs[pi++%dirs.length];const nx=gx+d.dx,ny=gy+d.dy;
          if(!taken.has(key(nx,ny))){edges.push({from:node,to:sub,bond:sub.bond});place(sub,nx,ny,d.dx,d.dy);ok=true;break}
        }
        if(!ok){const d=dirs[0];edges.push({from:node,to:sub,bond:sub.bond});place(sub,gx+d.dx,gy+d.dy,d.dx,d.dy)}
      }
    }
    place(root,0,0,1,0);
    const gxs=nodes.map(n=>n.gx),gys=nodes.map(n=>n.gy);
    const mnX=Math.min(...gxs),mnY=Math.min(...gys),mxX=Math.max(...gxs),mxY=Math.max(...gys);
    const W=(mxX-mnX)*U+PAD*2,H=(mxY-mnY)*U+PAD*2;
    for(const n of nodes){n.px=(n.gx-mnX)*U+PAD;n.py=(n.gy-mnY)*U+PAD}
    return{nodes,edges,W:Math.max(W,80),H:Math.max(H,80)}
  }

  function chemToSVG(molSrc) {
    const tree = parseChem(molSrc.trim());
    if (!tree) return '<svg width="200" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="40" fill="#0c1118"/><text x="8" y="26" font-family="monospace" font-size="12" fill="#ff4081">errore sintassi</text></svg>';
    const {nodes,edges,W,H} = layoutChem(tree);
    const BC = {'-':'#606068','=':'#5fb3a0','#':'#d4a96a'};
    const AC = {C:'#87878f',H:'#444450',O:'#c96060',N:'#5fb3a0',S:'#d4a96a',P:'#c97040',F:'#70b870',Cl:'#70b870',Br:'#a05050',I:'#8060a0'};
    const ac = a => AC[a] || '#d4a96a';
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" style="background:#0c1118;border-radius:6px;display:block">';
    for (const e of edges) {
      const x1=e.from.px,y1=e.from.py,x2=e.to.px,y2=e.to.py;
      const col=BC[e.bond]||'#606068';
      const ddx=x2-x1,ddy=y2-y1,len=Math.sqrt(ddx*ddx+ddy*ddy)||1;
      const nx=-ddy/len,ny=ddx/len;
      if(e.bond==='-'){svg+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="2"/>'}
      else if(e.bond==='='){const o=4;svg+='<line x1="'+(x1+nx*o)+'" y1="'+(y1+ny*o)+'" x2="'+(x2+nx*o)+'" y2="'+(y2+ny*o)+'" stroke="'+col+'" stroke-width="2"/><line x1="'+(x1-nx*o)+'" y1="'+(y1-ny*o)+'" x2="'+(x2-nx*o)+'" y2="'+(y2-ny*o)+'" stroke="'+col+'" stroke-width="2"/>'}
      else{const o=4.5;svg+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="2"/><line x1="'+(x1+nx*o)+'" y1="'+(y1+ny*o)+'" x2="'+(x2+nx*o)+'" y2="'+(y2+ny*o)+'" stroke="'+col+'" stroke-width="1.4"/><line x1="'+(x1-nx*o)+'" y1="'+(y1-ny*o)+'" x2="'+(x2-nx*o)+'" y2="'+(y2-ny*o)+'" stroke="'+col+'" stroke-width="1.4"/>'}
    }
    for (const n of nodes) {
      const isH=n.atom==='H';const r=isH?11:(n.atom.length>1?16:13);const fs=isH?11:(n.atom.length>1?10:14);const col=ac(n.atom);
      svg+='<circle cx="'+n.px+'" cy="'+n.py+'" r="'+r+'" fill="#0c1118"/>';
      svg+='<text x="'+n.px+'" y="'+(n.py+5)+'" text-anchor="middle" font-family="Fira Code,monospace" font-size="'+fs+'" font-weight="500" fill="'+col+'">'+n.atom+'</text>';
    }
    return svg + '</svg>';
  }

  /* ══════════════════════════════════════════════════════════
     PRE-PROCESSORE  —  Sostituisce RENDER{...} con marker TALK
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

      // Raccoglie il contenuto con parentesi graffe bilanciate
      let depth = 1, content = '';
      while (pos < src.length && depth > 0) {
        const c = src[pos++];
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
     RENDERER  —  Produce HTML da una stringa di contenuto
  ══════════════════════════════════════════════════════════ */
  function renderBlockToHTML(content) {
    if (typeof katex === 'undefined') {
      return '<div style="color:#ff4081;font-family:monospace;font-size:.8rem;padding:.5rem">KaTeX non caricato — aggiungi katex.min.js</div>';
    }

    /* ── Chimica ── */
    if (isChemMode(content)) {
      const mols = getChemLines(content);
      if (!mols.length) return '<div class="lrender-empty">CHEM — scrivi la molecola sotto</div>';
      let html = '<div class="lrender-chem">';
      for (const mol of mols) {
        html += '<div class="lrender-mol">' + chemToSVG(mol) + '</div>';
      }
      html += '</div>';
      return html;
    }

    /* ── Matematica ── */
    const lines = content.split('\n').filter(l => l.trim());
    if (!lines.length) return '<div class="lrender-empty">—</div>';

    let html = '<div class="lrender-math">';
    for (let idx = 0; idx < lines.length; idx++) {
      if (idx > 0) html += '<div class="lrender-sep"></div>';
      const line = lines[idx].trim();
      try {
        const latex = toLatex(line);
        const container = document.createElement('div');
        katex.render(latex, container, { displayMode: true, throwOnError: true });
        html += '<div class="lrender-line">' + container.innerHTML + '</div>';
      } catch(e) {
        html += '<div class="lrender-err">⚠ ' + e.message + '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  /* ── API globale ── */
  G.LINE_render_preprocess  = preprocessRender;
  G.LINE_render_html        = renderBlockToHTML;
  G.LINE_RENDER_MARKER      = RENDER_MARKER;
  G.LINE_render_to_latex    = toLatex;      // usato da ide.html per \R inline

})(typeof window !== 'undefined' ? window : global);
