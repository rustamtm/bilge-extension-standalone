import{c as Re,x as pe,m as E,y as U,z as Ie,A as Ee,E as ve,H as ie,k as Ce,G as Ne}from"./index-nioxCw3b.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=Re("Square",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]]);var De={};const Me="https://api.openai.com/v1",Le="gpt-4o",Ge=()=>(De.OPENAI_API_KEY||"").trim(),ke=async(B,P,A,e={})=>{var Te,i,f,I,C,O,k,Q,V,L,ae,ne,j,S,re;const F=e.proxyProvider||"openai",q=!!e.forceProxy||pe(),H=Ge();if(!q&&!H)throw new Error("OpenAI API Key is missing.");const D=new Set([429,503,504]),v=3,ce=500,ee=t=>new Promise(a=>setTimeout(a,t)),te=t=>{const a=ce*2**Math.max(0,t-1),x=Math.floor(Math.random()*250);return Math.min(2e4,a+x)},ue=()=>{const t=new Error("Aborted");return t.name="AbortError",t},$=t=>{var a;return((a=e.abortSignal)==null?void 0:a.aborted)===!0||(t==null?void 0:t.name)==="AbortError"||String((t==null?void 0:t.name)||"").toLowerCase().includes("abort")},me=t=>{const a=String((t==null?void 0:t.message)||t||"").toLowerCase();return a.includes("fetch failed")||a.includes("network")||a.includes("socket")||a.includes("econnreset")||a.includes("etimedout")||a.includes("timed out")||a.includes("eai_again")},de=t=>{const x=t.replace(/\r\n/g,`
`).replace(/\r/g,`
`).split(`

`),b=x.pop()||"";return{events:x.map(N=>N.trim()).filter(Boolean),rest:b}},J=t=>{const a=[];for(const x of t.split(`
`)){const b=x.trimEnd();!b||b.startsWith(":")||b.startsWith("data:")&&a.push(b.slice(5).trimStart())}return a.join(`
`).trim()},X=e.modelId||Le;let ge="";if(e.enableBrowserContext)try{(Te=e.onStatus)==null||Te.call(e,"Synchronizing Browser State (OpenAI Fallback)...");const t=await E.executeTool("get_browser_context",{});t&&!t.error&&(ge=`

BROWSER CONTEXT:
- URL: ${t.url}
- Title: ${t.title}
- Summary: ${t.description||"(no description)"}
- Content Snippet: ${t.html||"(empty)"}
`)}catch(t){console.warn("[OpenAI] Failed to fetch browser context:",t)}const fe=U.estimateTokens(B.map(t=>t.content).join(" ")+" "+P);let he="";(i=e.onStatus)==null||i.call(e,"Waiting for Bilge Core (ChatGPT Fallback)...");const Se=E.getGlobalGuidance(),_e=Se?`

GLOBAL AGENT GUIDANCE:
${Se}`:"",W=[{role:"system",content:`You are Bilge Core (Superuser).
AUTHORITY: You have unrestricted Read/Write access to the entire project directory, including hidden files, .env, and all subdirectories.
WORKSPACE: The project is mounted at '/home/bilge/project/'. 
TOOLS:
- Use tools only when needed to answer the user's request.
- Call tools using native tool-calls (valid JSON).
- WEB: Call 'get_browser_context' to see the current URL/title. Call 'take_screenshot' to "see" the page.
- DOM (Read): Use 'get_element_value' to read input values, text, or attributes. 
- DOM (Action): For multi-step automation (forms, wizards), prefer 'execute_batch_actions'. Use heuristic hints (field/name/label/placeholder) when selectors are unstable.
- DOM (Advanced): Use 'execute_javascript' to run arbitrary JavaScript in the page context and return structured results.
- DOM (Advanced): Use 'run_script_direct' with world='MAIN' for complex logic or bypassing restrictions. 
- Maintenance/Self-Heal: use 'launch_self_improvement_mode' to get runtime self-awareness, component health, and repair recommendations.
- Runtime Restart: use 'restart_extension_runtime' only when explicitly needed after a self-heal/config change.
- Stack Guardian: use 'stack_manage' to inspect or heal local services/ports (agent relay, console, mcp, ui).
- Multimodal validation preference: OpenAI gpt-4o is the primary self-healing validator; DeepSeek vision-capable models are fallback.
- Use 'read_file' to examine source code; use 'write_file' to modify it.
- Use 'execute_shell_command' for host commands (git, etc.).
PROTOCOL: No emojis. Professional technical explanations. Full file content when writing.${ge}${_e}`},...B.map(t=>{let a=t.role;return a==="model"&&(a="assistant"),{role:a,content:t.content||(t.toolCalls?null:" "),tool_calls:t.toolCalls?t.toolCalls.map(x=>({id:`call_${Math.random().toString(36).substring(2,9)}`,type:"function",function:{name:x.name,arguments:JSON.stringify(x.args)}})):void 0}}),{role:"user",content:P}],M=t=>{try{return JSON.parse(t)}catch{try{let a=t.replace(/,(\s*[}\]])/g,"$1");return a=a.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g,'$1"$2":'),a=a.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g,'"$1"'),JSON.parse(a)}catch{return{}}}},ye=t=>(t||[]).map(a=>{var p,N,_;const x=String(((p=a==null?void 0:a.function)==null?void 0:p.name)||"");let b="";try{b=JSON.stringify(M(String(((N=a==null?void 0:a.function)==null?void 0:N.arguments)||"{}")))}catch{b=String(((_=a==null?void 0:a.function)==null?void 0:_.arguments)||"")}return`${x}:${b}`}).join("|");try{let t=function(){return Math.random().toString(36).substring(2,9)};const a=E.convertToOpenAiTools(E.getLocalTools()),x=async g=>{const y=F!=="gemini",s={model:X,messages:g,stream:!0};return y&&(s.stream_options={include_usage:!0}),a.length>0&&(s.tools=a,s.tool_choice="auto"),q?Ie({provider:F,model:X,messages:g,stream:!0,stream_options:y?{include_usage:!0}:void 0,tools:a.length>0?a:void 0,tool_choice:a.length>0?"auto":void 0,abortSignal:e.abortSignal}):fetch(`${Me}/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${H}`},body:JSON.stringify(s),signal:e.abortSignal})},b=async g=>{var y,s,c;for(let l=1;l<=v;l+=1){if((y=e.abortSignal)!=null&&y.aborted)throw ue();try{const r=await x(g);if(r.ok)return r;if(D.has(r.status)&&l<v){await r.text().catch(()=>""),(s=e.onStatus)==null||s.call(e,`Transient upstream ${r.status}; retrying...`),await ee(te(l));continue}return r}catch(r){if($(r))throw r;if(me(r)&&l<v){(c=e.onStatus)==null||c.call(e,"Transient network issue; retrying..."),await ee(te(l));continue}throw r}}throw new Error("OpenAI request retries exhausted.")};let p=await b(W);if(!p.ok){const g=await p.text().catch(()=>""),y=q?`${F} proxy`:"OpenAI";throw new Error(`${y} Error (${p.status}): ${g||p.statusText}`)}const N=async g=>{if(!g.body||typeof g.body.getReader!="function")return[];const y=g.body.getReader(),s=new TextDecoder("utf-8");let c="",l=!1,r=[];const R=o=>{var m,d;const u=(d=(m=o==null?void 0:o.choices)==null?void 0:m[0])==null?void 0:d.delta;u&&(u.tool_calls&&u.tool_calls.forEach(n=>{var G,T;r[n.index]||(r[n.index]={id:n.id||`call_${t()}`,type:"function",function:{name:"",arguments:""}}),n.id&&(r[n.index].id=n.id),(G=n.function)!=null&&G.name&&(r[n.index].function.name+=n.function.name),(T=n.function)!=null&&T.arguments&&(typeof n.function.arguments=="string"?r[n.index].function.arguments+=n.function.arguments:r[n.index].function.arguments=JSON.stringify(n.function.arguments))}),typeof(u==null?void 0:u.content)=="string"&&u.content.length>0&&(he+=u.content,A(u.content)))};try{for(;!l;){const{done:o,value:u}=await y.read();if(o)break;if(!u)continue;c+=s.decode(u,{stream:!0});const m=de(c);c=m.rest;for(const d of m.events){const n=J(d);if(n){if(n==="[DONE]"){l=!0;break}try{const G=JSON.parse(n);R(G)}catch{}}}}c+=s.decode()}catch(o){if(!$(o))throw o}if(!l&&c.trim()){const o=J(c);if(o&&o!=="[DONE]")try{R(JSON.parse(o))}catch{}}return r.filter(Boolean)};let _=await N(p);const z=Math.max(0,Math.min(120,e.maxToolIterations??60));let Z=0,oe="",K=0,Y=null,w="",se=!1;for(;_.length>0&&Z<z;){Z+=1;const g=ye(_);if(g&&g===oe){Y=`Tool loop detected (${String(((I=(f=_[0])==null?void 0:f.function)==null?void 0:I.name)||"unknown_tool")})`;break}oe=g,(C=e.onToolCall)==null||C.call(e,_.map(c=>({name:c.function.name,args:M(c.function.arguments)}))),W.push({role:"assistant",content:null,tool_calls:_});let y=!1;for(const c of _){const l=M(c.function.arguments);(O=e.onStatus)==null||O.call(e,`Executing: ${c.function.name}...`);const r=await E.executeTool(c.function.name,l),R=Ee(c.function.name,r);R&&(y=!0,w=R),e.onToolResult&&e.onToolResult(c.function.name,r);let o=r;if(r&&typeof r=="object"&&r._imageData&&r._mimeType){e.onImages&&e.onImages([String(r._imageData)]);const u=typeof r._imageData=="string"?r._imageData.length:0;o={...r},delete o._imageData,o._imageOmitted=!0,o._imageBytes=u}W.push({role:"tool",tool_call_id:c.id,name:c.function.name,content:JSON.stringify(o)})}if(K=y?K+1:0,K>=5){const c=String(((Q=(k=_[0])==null?void 0:k.function)==null?void 0:Q.name)||"tool");if(!se&&ve(w)){se=!0,(V=e.onStatus)==null||V.call(e,"Detected relay/port failure. Running Stack Guardian auto-heal...");const l=await E.executeTool("stack_manage",{action:"ensure",target:"agent",auto_heal:!0,ensure_ports:!0,max_cycles:2});if(e.onToolResult&&e.onToolResult("stack_manage",l),!(l!=null&&l.error)&&((l==null?void 0:l.healthy)===!0||(l==null?void 0:l.recovered)===!0)){(L=e.onStatus)==null||L.call(e,"Stack Guardian restored services. Retrying..."),K=0;continue}const r=String((l==null?void 0:l.error)||"").trim();r&&(w=w?`${w} | stack_manage: ${r}`:`stack_manage: ${r}`)}Y=`Repeated tool errors while executing ${c}`;break}const s=await b(W);if(!s.ok){const c=await s.text().catch(()=>""),l=q?`${F} proxy`:"OpenAI";throw new Error(`${l} Error (${s.status}): ${c||s.statusText}`)}_=await N(s)}if(!((ae=e.abortSignal)!=null&&ae.aborted)){if(Y){const g=w?`
**Last tool error**: ${w}.`:"",y=`
**Next action**: ${ie(w)}`;(ne=e.onStatus)==null||ne.call(e,w?`Tool execution stopped: ${w}`:"Tool execution stopped to avoid a stuck loop."),A(`

**System**: ${Y}.${g}${y}`)}else if(_.length>0&&Z>=z){const g=String(((S=(j=_[0])==null?void 0:j.function)==null?void 0:S.name)||"tool"),y=w?`
**Last tool error**: ${w}.`:"",s=`
**Next action**: ${ie(w)}`;(re=e.onStatus)==null||re.call(e,`Tool iteration limit reached (${z}) on ${g}.`),A(`

**System**: Reached tool-call budget (${z}) while executing ${g}.${y}${s}`)}}return U.trackTransaction(X,fe,U.estimateTokens(he))}catch(t){throw t}},Ue=async(B,P,A,e={})=>{var ce,ee,te,ue;if(!Ce.isServiceActive("gemini"))return A("ERROR: Gemini Driver is currently suspended."),{inputTokens:0,outputTokens:0,cost:0};if(pe())return(ce=e.onStatus)==null||ce.call(e,"Using Studio secure proxy (Gemini)..."),ke(B,P,A,{modelId:e.modelId,onImages:e.onImages,onToolCall:e.onToolCall,onToolResult:e.onToolResult,onStatus:e.onStatus,maxToolIterations:e.maxToolIterations,enableThinking:e.enableThinking,enableBrowserContext:e.enableBrowserContext,abortSignal:e.abortSignal,proxyProvider:"gemini",forceProxy:!0});const F="AIzaSyBmcf88Pcq9Z8Mb_dyL9HNOFmDcKWkgSNM".trim();if(!F)throw new Error("Gemini API key is missing (API_KEY/GEMINI_API_KEY).");const q=new Ne({apiKey:F,vertexai:!1});let H=0,D="",v=e.modelId||"gemini-3-flash-preview";try{let $="";if(e.enableBrowserContext)try{(ee=e.onStatus)==null||ee.call(e,"Synchronizing Browser State...");const i=await E.executeTool("get_browser_context",{});i&&!i.error&&($=`

BROWSER CONTEXT:
- URL: ${i.url}
- Title: ${i.title}
- Summary: ${i.description||"(no description)"}
- Content Snippet: ${i.html||"(empty)"}
`)}catch(i){console.warn("[Gemini] Failed to fetch browser context:",i)}(te=e.onStatus)==null||te.call(e,"Waiting for Bilge Core...");const me=i=>{const f=String((i==null?void 0:i.message)||i||"").toLowerCase(),I=/rate limit|429|overloaded|temporarily unavailable|deadline exceeded|503|504/i.test(f),C=/context length|too many tokens|maximum context|token limit/i.test(f),O=/GenerateContentRequest\.tools|function_declar|functionDeclarations|INVALID_ARGUMENT/i.test(f),k=/quota|blocked|exceeded/i.test(f);return{isRetryable:I,isContextLimit:C,isToolsError:O,isQuotaError:k,msg:f}},J=(i=>{const f=[i];return i==="gemini-3-pro-preview"&&f.push("gemini-3-flash-preview"),f.includes("gemini-3-flash-preview")||f.push("gemini-3-flash-preview"),f})(e.modelId||"gemini-3-flash-preview");H=U.estimateTokens(B.map(i=>i.content).join(" ")+" "+P);const X=B.filter(i=>i.role==="system").map(i=>i.content).join(`

`),ge=e.enableThinking?`

THINKING MODE:
- You may reason freely in your own style.
- <think> tags are optional; use them only when natural.
- Keep reasoning useful and safe (never include secrets).
`:"",fe=E.getGlobalGuidance(),he=fe?`

GLOBAL AGENT GUIDANCE:
${fe}`:"",Se=i=>({systemInstruction:`You are Bilge Core. You have a LIVE WINDOW into the repo via <SystemContext>. Treat files there as CURRENT. NO EMOJIS.
TOOLS:
- Use tools only when needed.
- Call tools via native function calls only (valid JSON).
WEB:
- Call 'get_browser_context' first to see the current page.
- Call 'take_screenshot' to see what the user sees.
DOM (Read):
- Use 'get_element_value' to read inputs, text, or attributes.
DOM (Action):
- For multi-step automation (forms, wizards), prefer 'execute_batch_actions'. Use heuristic hints (field/name/label/placeholder) when selectors are unstable.
   DOM (Advanced):
   - Use 'execute_javascript' to run arbitrary JavaScript in the page context and return structured results.
   - Use 'run_script_direct' with world='MAIN' for complex logic or bypassing restrictions.
   - Maintenance/Self-Heal: Use 'launch_self_improvement_mode' to get runtime self-awareness, component health, and repair recommendations.
   - Runtime Restart: use 'restart_extension_runtime' only when explicitly needed after a self-heal/config change.
   - Stack Guardian: use 'stack_manage' to inspect or heal local services/ports (agent relay, console, mcp, ui).
- Multimodal validation preference: OpenAI gpt-4o is the primary self-healing validator; DeepSeek vision-capable models are fallback.
${e.enableFullExecutionMode?"ROOT MODE ACTIVE.":""} ${e.enableAutoGit?"Authorized to use git via execute_shell_command.":""}${$}${X?`

CORE SYSTEM CONTEXT:
${X}`:""}${he}${ge}`}),_e=async(i,f,I={})=>{var x,b,p,N,_,z,Z,oe,K,Y,w,se,g,y;const C=[];!I.disableFunctionTools&&f.length>0&&C.push(...E.convertToGeminiTools(f));const O=Se(i);C.length>0&&(O.tools=C),e.abortSignal&&(O.abortSignal=e.abortSignal);const k=q.chats.create({model:i,history:B.filter(s=>s.role!=="system").map(s=>({role:s.role==="user"?"user":"model",parts:[{text:s.content}]})),config:O}),Q=s=>{if(!s)return{};if(typeof s=="object")return s;if(typeof s=="string"){const c=s.trim();if(!c)return{};try{return JSON.parse(c)}catch{return{_raw:c}}}return{_raw:String(s)}},V=async s=>{var o,u,m,d;const c=await k.sendMessageStream({message:s}),l=[];for await(const n of c){if((o=e.abortSignal)!=null&&o.aborted)break;const T=(d=(m=(u=n.candidates)==null?void 0:u[0])==null?void 0:m.content)==null?void 0:d.parts;if(!(!T||!Array.isArray(T)))for(const h of T)typeof(h==null?void 0:h.text)=="string"&&h.text&&(D+=h.text,A(h.text)),h!=null&&h.functionCall&&l.push(h.functionCall),h!=null&&h.inlineData&&e.onImages&&e.onImages([h.inlineData.data||""])}if(l.length===0&&D.includes("Action:")){const n=D.split(`
`),G=new Set((e.mcpTools||[]).map(T=>T.name));for(let T=0;T<n.length;T++){const h=n[T].trim(),xe=h.match(/^Action:\s*(?:call\s+)?`?([a-zA-Z0-9_-]+)`?/i);if(xe&&G.has(xe[1])){const Oe=xe[1];let le={};const we=h.substring(xe[0].length).trim();if(we.startsWith("{"))try{le=JSON.parse(we)}catch{}else if(T+1<n.length){const be=n[T+1].trim(),$e=be.match(/^(?:Action Input|Args):\s*(.*)/i);if($e)try{le=JSON.parse($e[1])}catch{const Ae=be.match(/\{.*\}/);if(Ae)try{le=JSON.parse(Ae[0])}catch{}}else if(be.startsWith("{"))try{le=JSON.parse(be)}catch{}}l.push({name:Oe,args:le})}}}const r=new Set,R=[];for(const n of l){const G=String((n==null?void 0:n.name)||"");let T="";try{T=JSON.stringify((n==null?void 0:n.args)??{})}catch{T=String((n==null?void 0:n.args)??"")}const h=`${G}:${T}`;r.has(h)||(r.add(h),R.push(n))}return{functionCalls:R}},L=Math.max(0,Math.min(500,e.maxToolIterations??500));let ae=0,ne="",j=0,S="",re=!1,t=P;e.imageData&&(t=[{text:P},{inlineData:{mimeType:e.imageMimeType||"image/png",data:e.imageData}}]);let a=t;for(;;){if((x=e.abortSignal)!=null&&x.aborted)return;const{functionCalls:s}=await V(a);if((b=e.abortSignal)!=null&&b.aborted||s.length===0)return;const c=s.map(o=>`${o.name}:${JSON.stringify(o.args)}`).join("|");if(c===ne){console.warn(`[Gemini] Loop detected: identical tool call repeated (${c}). Breaking loop.`);const o=S?`
**Last tool error**: ${S}.`:"",u=`
**Next action**: ${ie(S)}`;A(`

**System**: Tool loop detected (${(p=s[0])==null?void 0:p.name}).${o}${u}`);return}if(ne=c,ae+=1,ae>L){const o=String(((N=s[0])==null?void 0:N.name)||"tool"),u=S?`
**Last tool error**: ${S}.`:"",m=`
**Next action**: ${ie(S)}`;(_=e.onStatus)==null||_.call(e,`Tool iteration limit reached (${L}) on ${o}.`),A(`

**System**: Reached tool-call budget (${L}) while executing ${o}.${u}${m}`);return}(z=e.onToolCall)==null||z.call(e,s.map(o=>({name:o.name,args:Q(o.args)})));const l=[],r=[];let R=!1;for(const o of s){if((Z=e.abortSignal)!=null&&Z.aborted)break;const u=Q(o.args);(oe=e.onStatus)==null||oe.call(e,`Executing: ${o.name}...`);const m=await E.executeTool(o.name,u),d=Ee(o.name,m);d&&(R=!0,S=d),e.onToolResult&&e.onToolResult(o.name,m),(K=e.onStatus)==null||K.call(e,"Analyzing response...");let n=m;m&&typeof m=="object"&&m._imageData&&m._mimeType&&(e.onImages&&e.onImages([m._imageData]),r.push({inlineData:{mimeType:m._mimeType,data:m._imageData}}),n={...m},delete n._imageData,delete n._mimeType),l.push({functionResponse:{name:o.name,response:{result:n}}})}if((Y=e.abortSignal)!=null&&Y.aborted)return;if(j=R?j+1:0,j>=5){const o=String(((w=s[0])==null?void 0:w.name)||"tool");if(!re&&ve(S)){re=!0,(se=e.onStatus)==null||se.call(e,"Detected relay/port failure. Running Stack Guardian auto-heal...");const d=await E.executeTool("stack_manage",{action:"ensure",target:"agent",auto_heal:!0,ensure_ports:!0,max_cycles:2});if(e.onToolResult&&e.onToolResult("stack_manage",d),!(d!=null&&d.error)&&((d==null?void 0:d.healthy)===!0||(d==null?void 0:d.recovered)===!0)){(g=e.onStatus)==null||g.call(e,"Stack Guardian restored services. Retrying..."),j=0;continue}const n=String((d==null?void 0:d.error)||"").trim();n&&(S=S?`${S} | stack_manage: ${n}`:`stack_manage: ${n}`)}const u=S?`
**Last tool error**: ${S}.`:"",m=`
**Next action**: ${ie(S)}`;(y=e.onStatus)==null||y.call(e,S?`Tool execution stopped: ${S}`:"Tool execution stopped to avoid a stuck loop."),A(`

**System**: Repeated tool errors while executing ${o}.${u}${m}`);return}a=[...l,...r]}},W=[{label:"full",tools:e.mcpTools||[]},{label:"local",tools:E.getLocalTools()},{label:"no-tools",tools:[],disableFunctionTools:!0}];let M=null,ye=0;const Te=6;for(let i=0;i<J.length;i++){v=J[i];for(let f=0;f<W.length&&(ye++,!(ye>Te));f++){const I=W[f],C=D.length;try{return await _e(v,I.tools,{disableFunctionTools:I.disableFunctionTools}),M=null,U.trackTransaction(v,H,U.estimateTokens(D))}catch(O){M=O;const k=me(O);if(D.length>C)break;if(k.isQuotaError)return console.warn(`[Gemini] Quota exceeded on ${v}. Falling back to ChatGPT (OpenAI)...`),A(`

*System: Gemini quota exceeded. Engaging ChatGPT fallback...*

`),ke(B,P,A,{...e,onStatus:V=>{var L;return(L=e.onStatus)==null?void 0:L.call(e,`${V} (Fallback)`)}});if(k.isContextLimit||k.isToolsError){console.warn(`[Gemini] ${k.isContextLimit?"Context":"Tools"} issue with ${v}/${I.label}. Retrying with next tier...`);continue}if(k.isRetryable){if(i<J.length-1){console.warn(`[Gemini] Rate limit/Overload on ${v}. Falling back to ${J[i+1]}...`);break}continue}break}}if(!M)break}if(M)throw M;return{inputTokens:0,outputTokens:0,cost:0}}catch($){if(((ue=e.abortSignal)==null?void 0:ue.aborted)||($==null?void 0:$.name)==="AbortError"||String(($==null?void 0:$.name)||"").toLowerCase().includes("abort")){const de=U.estimateTokens(D);return U.trackTransaction(v,H,de)}throw new Error($.message||"Failed to generate response")}};export{Pe as S,Ue as s};
