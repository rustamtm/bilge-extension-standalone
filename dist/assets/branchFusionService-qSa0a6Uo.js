import{c as d,s as w,G as S,m as $}from"./index-DI4h6RxA.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=d("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=d("GitMerge",[["circle",{cx:"18",cy:"18",r:"3",key:"1xkwt0"}],["circle",{cx:"6",cy:"6",r:"3",key:"1lh9wr"}],["path",{d:"M6 21V9a9 9 0 0 0 9 9",key:"7kw0sc"}]]);class A{constructor(){this.baseUrl="https://api.github.com"}async request(t,e,r,a){const s=await fetch(`${this.baseUrl}${t}`,{method:e,headers:{Authorization:`Bearer ${r}`,Accept:"application/vnd.github.v3+json","Content-Type":"application/json"},body:a?JSON.stringify(a):void 0});if(!s.ok){const n=await s.json();throw new Error(n.message||s.statusText)}return s.json()}async getBranch(t,e,r){return this.request(`/repos/${t}/git/ref/heads/${e}`,"GET",r)}async listBranches(t,e){return this.request(`/repos/${t}/branches`,"GET",e)}async getRepoStructure(t,e,r){const s=(await this.getBranch(t,e,r)).object.sha;return this.request(`/repos/${t}/git/trees/${s}?recursive=1`,"GET",r)}async getFileContent(t,e,r,a){try{const s=await this.request(`/repos/${t}/contents/${r}?ref=${e}`,"GET",a);if(s.content&&s.encoding==="base64"){const n=atob(s.content),c=new Uint8Array(n.length);for(let o=0;o<n.length;o++)c[o]=n.charCodeAt(o);return new TextDecoder("utf-8").decode(c)}return""}catch(s){return console.warn(`Failed to fetch content for ${r}:`,s),""}}async createBranch(t,e,r,a){return this.request(`/repos/${t}/git/refs`,"POST",a,{ref:`refs/heads/${e}`,sha:r})}async pushChanges(t,e,r,a,s){let n;try{n=await this.getBranch(t,e,r)}catch(h){throw h.message==="Not Found"||h.message==="Reference does not exist"?new Error(`Branch '${e}' not found`):h}const c=n.object.sha,i=(await this.request(`/repos/${t}/git/commits/${c}`,"GET",r)).tree.sha,l=[];for(const h of s){const y=h.path.replace(/^\/home\/bilge\/project\//,"").replace(/^\//,""),T=await this.request(`/repos/${t}/git/blobs`,"POST",r,{content:h.content,encoding:"utf-8"});l.push({path:y,mode:"100644",type:"blob",sha:T.sha})}const g=await this.request(`/repos/${t}/git/trees`,"POST",r,{base_tree:i,tree:l}),p=await this.request(`/repos/${t}/git/commits`,"POST",r,{message:a,tree:g.sha,parents:[c]});return await this.request(`/repos/${t}/git/refs/heads/${e}`,"PATCH",r,{sha:p.sha,force:!1}),p}}const u=new A,f=new S({apiKey:"AIzaSyBmcf88Pcq9Z8Mb_dyL9HNOFmDcKWkgSNM",vertexai:!1});class E{async analyzeScope(t,e){if(!e)return["main","dev"];try{return(await u.listBranches(t,e)).map(a=>a.name)}catch(r){return console.error("Failed to fetch branches",r),["main","dev"]}}async indexBranch(t,e,r){if(!r)return{name:e,structure:[],keyFiles:{}};try{const s=(await u.getRepoStructure(t,e,r)).tree.map(i=>i.path),n=["package.json","firebase","config","auth","tsconfig",".env.example"],c=s.filter(i=>n.some(l=>i.toLowerCase().includes(l))).slice(0,5),o={};for(const i of c){const l=await u.getFileContent(t,e,i,r);o[i]=l}return{name:e,structure:s,keyFiles:o}}catch(a){return console.error(`Failed to index branch ${e}`,a),{name:e,structure:[],keyFiles:{}}}}async performAudit(t,e,r,a){const s=t.structure.slice(0,200).join(`
`),n=e.structure.slice(0,200).join(`
`),c=`
            You are the Lead Code Auditor (DeepSeek R1).
            Protocol: NO EMOJIS. Professional Technical Analysis only.
            GOAL: The user wants to merge features from '${t.name}' into '${e.name}'.
            User Intent: "${r}"

            CONTEXT A (Source):
            ${s}
            CONTEXT B (Target):
            ${n}

            TASK:
            1. Identify architectural discrepancies and missing files.
            2. Highlight potential conflicts.
            Output Markdown. Start with "## Drift Analysis".
        `;try{let o="";return await w([],c,i=>{o+=i,a(i)},"deepseek/deepseek-r1-turbo"),o}catch{return"Auditor is offline. Manual review required."}}async generateMergePatch(t,e,r){const a=`
            You are the Senior Implementer (Gemini 3 Pro).
            Protocol: STRICT JSON OUTPUT for files. Markdown for explanation.
            Audit Report: ${t}
            User Intent: "${e}"

            TASK:
            1. Generate the files or adapters needed to merge the features.
            2. Ensure code is high-quality and production-ready.

            OUTPUT FORMAT:
            { "explanation": "Markdown description of the patch contents...", "files": [{ "path": "...", "content": "..." }] }
        `;try{let s="";const n=await f.models.generateContentStream({model:"gemini-3-pro-preview",contents:a,config:{responseMimeType:"application/json"}});for await(const i of n){const l=i.text;l&&(s+=l,r(l))}const c=s.replace(/^```json\s*/,"").replace(/\s*```$/,""),o=JSON.parse(c);return{text:o.explanation||"Patch ready.",files:o.files||[]}}catch(s){return console.error("Patch Stream Error",s),{text:"Failed to generate patch data.",files:[]}}}async generatePMResponse(t,e){const r=`
            You are the Project Manager Agent.
            Protocol: NO EMOJIS. Professional and grounded.
            
            Strict Data Constraints:
            - THE AUDIT FOUND: ${e.audit}
            - THE IMPLEMENTER GENERATED THIS EXPLANATION: ${e.patchExplanation}
            - THE ACTUAL FILES IN THE PATCH ARE: ${e.files.join(", ")}

            TASK:
            Summarize the state of the fusion. 
            Explain EXACTLY what the implementer proposed based ONLY on the files listed above.
            If a file (like aiAgent.ts) is NOT in the "FILES IN THE PATCH" list above, DO NOT claim it is being created.
            Ask the user for permission to apply this specific patch to their local workspace.
        `,a=await f.models.generateContent({model:"gemini-3-flash-preview",contents:r});let s="The team has formulated a plan. Review the proposal below and approve if you are ready to proceed.";try{s=a.text||s}catch{}return s}async applyPatch(t){for(const e of t)await $.executeTool("write_file",{path:e.path,content:e.content})}}const v=new E;export{O as D,P as G,v as b};
