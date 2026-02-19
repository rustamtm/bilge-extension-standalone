import{c as C,k as v,G as j,m as E,r as w,j as n,e as D,X as A}from"./index-nioxCw3b.js";import{f as k,C as L,M as I,r as z}from"./index-B1pO6E6u.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=C("ArrowDown",[["path",{d:"M12 5v14",key:"s699le"}],["path",{d:"m19 12-7 7-7-7",key:"1idqje"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const M=C("ArrowUp",[["path",{d:"m5 12 7-7 7 7",key:"hav0vg"}],["path",{d:"M12 19V5",key:"x0mq9r"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=C("FileCode",[["path",{d:"M10 12.5 8 15l2 2.5",key:"1tg20x"}],["path",{d:"m14 12.5 2 2.5-2 2.5",key:"yinavb"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",key:"1mlx9k"}]]),S=new j({apiKey:"AIzaSyBmcf88Pcq9Z8Mb_dyL9HNOFmDcKWkgSNM",vertexai:!1});class U{async neuralSearch(e,o){var g;if(!v.isServiceActive("knowledge"))return{documents:[],synthesis:"The Librarian (Knowledge Service) is currently suspended. Enable it in the Infrastructure Hub to access neural search.",optimizationLog:["SERVICE_STOPPED"]};const d=e.toLowerCase().split(/\s+/).filter(s=>s.length>2),a=o.map(s=>{let h=0;const m=s.title.toLowerCase(),f=s.content.toLowerCase(),t=s.tags.map(i=>i.toLowerCase());return m.includes(e.toLowerCase())&&(h+=10),f.includes(e.toLowerCase())&&(h+=5),d.forEach(i=>{m.includes(i)&&(h+=3),t.some(x=>x.includes(i))&&(h+=4);const l=(f.match(new RegExp(i,"g"))||[]).length;h+=Math.min(l,5)*.5}),{doc:s,score:h}}).filter(s=>s.score>0).sort((s,h)=>h.score-s.score).slice(0,8).map(s=>s.doc);if(a.length===0)return{documents:[],synthesis:"No relevant documents found in the neural index.",optimizationLog:[]};const r=a.map(s=>`[ID:${s.id}] Title: ${s.title}
Tags: ${s.tags.join(", ")}
Content Preview: ${s.content.substring(0,300)}...`).join(`

`),c=`
        You are an Adaptive Knowledge Engine.
        USER QUERY: "${e}"

        CANDIDATE DOCUMENTS:
        ${r}

        TASK:
        1. Analyze the relevance of each document to the query (0.0 to 1.0).
        2. Synthesize a direct answer to the query using ONLY these documents.
        3. Suggest ONE new "optimization tag" for the most relevant document.

        OUTPUT JSON format:
        {
            "rankings": [ {"id": "docId", "relevance": 0.95} ],
            "synthesis": "Markdown answer here...",
            "optimization": { "targetDocId": "docId", "newTag": "string", "reason": "string" }
        }
    `;try{const h=((await S.models.generateContent({model:"gemini-3-flash-preview",contents:c,config:{responseMimeType:"application/json"}})).text||"{}").replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/\s*```$/,""),m=JSON.parse(h),f=a.map(i=>{var x;const l=(x=m.rankings)==null?void 0:x.find(y=>y.id===i.id);return{...i,relevanceScore:l?l.relevance:.1}}).sort((i,l)=>(l.relevanceScore||0)-(i.relevanceScore||0)),t=[];if((g=m.optimization)!=null&&g.targetDocId){const i=f.find(l=>l.id===m.optimization.targetDocId);i&&(t.push(`Target: ${i.title}`),t.push(`Analysis: ${m.optimization.reason||"Gap detected"}`),t.push(`ACTION: Injecting learned tag #${m.optimization.newTag}`))}return{documents:f,synthesis:m.synthesis||"Could not Pleasure synthesis.",optimizationLog:t}}catch{return{documents:a,synthesis:"Neural engine error.",optimizationLog:["FAIL"]}}}async autoOrganizeChat(e){if(!v.isServiceActive("knowledge")||e.length===0)return null;try{const o=e.map(s=>`${s.role.toUpperCase()}: ${s.content}`).join(`

`),d=`
        You are The Librarian. Your task is to extract NEW TECHNICAL FINDINGS from this chat.
        DO NOT provide a general summary. Focus on:
        - Specific architectural decisions.
        - Code patterns or snippets identified.
        - Strategic goals defined by the user.

        Return JSON format: 
        { 
            "title": "Short Tech Title", 
            "summary": "Deep technical documentation in Markdown...", 
            "tags": ["tech-tag-1", "tech-tag-2"], 
            "category": "Engineering|Research|Ops" 
        }

        Chat Transcript:
        ${o.substring(0,15e3)}
      `,p=await S.models.generateContent({model:"gemini-3-flash-preview",contents:d,config:{responseMimeType:"application/json"}});let a="{}";try{a=p.text||"{}"}catch{}const r=a.replace(/^```json\s*/,"").replace(/\s*```$/,""),c=JSON.parse(r),g={title:c.title||"Untitled Session",content:c.summary||"No summary available.",tags:c.tags||[],category:c.category||"General",type:"md",size:`${(o.length/1024).toFixed(1)} KB`,status:"indexed",updated:new Date().toISOString()};return await k.addKnowledge(g),{id:"temp",...g}}catch(o){throw o}}async processRawInput(e){if(!v.isServiceActive("knowledge"))throw new Error("Knowledge Service Suspended");try{const o=`Categorize raw note. Return JSON: { "title": string, "category": string, "tags": string[] }

Text: "${e.substring(0,5e3)}"`,d=await S.models.generateContent({model:"gemini-3-flash-preview",contents:o,config:{responseMimeType:"application/json"}});let p="{}";try{p=d.text||"{}"}catch{}const a=p.replace(/^```json\s*/,"").replace(/\s*```$/,""),r=JSON.parse(a);return{title:r.title||"Unsorted Note",content:e,tags:r.tags||["unsorted"],category:r.category||"General",type:"txt",size:`${(e.length/1024).toFixed(1)} KB`,status:"indexed",updated:new Date().toISOString()}}catch{return{title:"Raw Ingest",content:e,tags:["raw"],category:"General",type:"txt",size:"0.1 KB",status:"indexed",updated:new Date().toISOString()}}}}const H=new U,R=500;class F{constructor(){this.logs=[],this.listeners=[],this.activeTrace=null,this.log("system","Kernel","Telemetry Service initialized.")}startNeuralSession(e){this.activeTrace={sessionId:`NS-${Math.random().toString(36).substring(2,9).toUpperCase()}`,cycleCount:0,startTime:Date.now()},this.log("cortex","Neural",`>>> START NEURAL SESSION: ${e}`,{trace:this.activeTrace})}incrementCycle(e){this.activeTrace&&(this.activeTrace.cycleCount++,this.activeTrace.lastAction=e,this.log("cortex","Neural",`Cycle ${this.activeTrace.cycleCount} initialized: ${e}`,{trace:this.activeTrace}))}endNeuralSession(){if(!this.activeTrace)return;const e=Date.now()-this.activeTrace.startTime;this.log("cortex","Neural",`<<< END NEURAL SESSION: Completed in ${this.activeTrace.cycleCount} cycles`,{duration:e}),this.activeTrace=null}log(e,o,d,p,a){if(!v.isServiceActive("telemetry")&&o!=="Kernel")return;const r={id:Math.random().toString(36).substring(2,11),timestamp:Date.now(),type:e,source:o,message:d,metadata:p,duration:a,trace:this.activeTrace?{...this.activeTrace}:void 0};this.logs.unshift(r),this.logs.length>R&&this.logs.pop(),this.notifyListeners(),E.executeTool("system_log",{message:`[${o}] ${d}`,type:r.type,metadata:{...r.metadata,trace:r.trace}}),k.logTelemetry(r)}getLogs(){return this.logs}subscribe(e){return this.listeners.push(e),e(this.logs),()=>{this.listeners=this.listeners.filter(o=>o!==e)}}notifyListeners(){this.listeners.forEach(e=>e(this.logs))}getCortexStats(){const e=this.logs.filter(a=>a.type==="cortex"),o=e.length;if(o===0)return{avgConfidence:0,hitRate:0,totalDecisions:0};const d=e.reduce((a,r)=>{var c;return a+(((c=r.metadata)==null?void 0:c.confidence)||0)},0),p=e.filter(a=>{var r;return(((r=a.metadata)==null?void 0:r.confidence)||0)>.7}).length;return{avgConfidence:d/o,hitRate:p/o,totalDecisions:o}}}const P=new F;function J({content:u,language:e,isVisible:o,onClose:d}){const[p,a]=w.useState(!1),r=w.useRef(null),[c,g]=w.useState({canUp:!1,canDown:!1}),s=w.useMemo(()=>{const t=String(e||"").trim().toLowerCase();return t==="markdown"||t==="md"},[e]);if(w.useEffect(()=>{const t=r.current;t&&t.scrollTo({top:0})},[u,e]),w.useEffect(()=>{const t=r.current;if(!t)return;let i=0;const l=()=>{i&&cancelAnimationFrame(i),i=requestAnimationFrame(()=>{const x=t.scrollTop,y=Math.max(0,t.scrollHeight-t.clientHeight),T=x>240,N=y-x>240;g(b=>b.canUp===T&&b.canDown===N?b:{canUp:T,canDown:N})})};return l(),t.addEventListener("scroll",l,{passive:!0}),window.addEventListener("resize",l),()=>{t.removeEventListener("scroll",l),window.removeEventListener("resize",l),i&&cancelAnimationFrame(i)}},[u,e]),!o)return null;const h=()=>{navigator.clipboard.writeText(u),a(!0),setTimeout(()=>a(!1),2e3)},m=()=>{var t;(t=r.current)==null||t.scrollTo({top:0,behavior:"smooth"})},f=()=>{const t=r.current;t&&t.scrollTo({top:t.scrollHeight,behavior:"smooth"})};return n.jsxs("div",{className:"w-full h-full bg-surface flex flex-col shadow-2xl animate-slide-in relative z-20 md:border-l md:border-border",children:[n.jsxs("div",{className:"h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-md",children:[n.jsxs("div",{className:"flex items-center gap-3",children:[n.jsx("div",{className:"text-secondary",children:n.jsx(O,{className:"w-4 h-4"})}),n.jsx("span",{className:"text-xs font-semibold uppercase tracking-wide text-secondary",children:e||"TEXT"})]}),n.jsxs("div",{className:"flex gap-2",children:[n.jsx("button",{onClick:h,className:"p-1.5 hover:bg-black/5 rounded-md transition-colors text-secondary hover:text-primary",title:"Copy to Clipboard",children:p?n.jsx(D,{className:"w-4 h-4 text-green-600"}):n.jsx(L,{className:"w-4 h-4"})}),n.jsx("button",{onClick:d,className:"p-1.5 hover:bg-black/5 rounded-md transition-colors text-secondary hover:text-primary",children:n.jsx(A,{className:"w-4 h-4"})})]})]}),n.jsx("div",{ref:r,className:"flex-1 overflow-auto bg-white dark:bg-[#0b0b0c]",children:s?n.jsx("div",{className:"p-4 md:p-8",children:n.jsx("div",{className:"prose prose-sm max-w-none prose-headings:scroll-mt-20 dark:prose-invert prose-code:text-pink-600 dark:prose-code:text-pink-400",children:n.jsx(I,{remarkPlugins:[z],children:u})})}):n.jsx("pre",{className:"p-4 md:p-8 text-[12px] sm:text-sm font-mono leading-relaxed text-[#1D1D1F] dark:text-[#f5f5f7] whitespace-pre",children:n.jsx("code",{children:u})})}),(c.canUp||c.canDown)&&n.jsxs("div",{className:"absolute right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2",children:[c.canUp&&n.jsx("button",{type:"button",onClick:m,className:"w-10 h-10 rounded-full bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur border border-border/60 shadow-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-white dark:hover:bg-[#2C2C2E] transition-colors",title:"Scroll to top","aria-label":"Scroll to top",children:n.jsx(M,{className:"w-4 h-4"})}),c.canDown&&n.jsx("button",{type:"button",onClick:f,className:"w-10 h-10 rounded-full bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur border border-border/60 shadow-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-white dark:hover:bg-[#2C2C2E] transition-colors",title:"Scroll to bottom","aria-label":"Scroll to bottom",children:n.jsx($,{className:"w-4 h-4"})})]})]})}export{M as A,O as F,$ as a,J as b,H as k,P as t};
