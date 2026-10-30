import './style.css';
import { DEFAULT_PROMPT, DEFAULT_SCENE, TRANSFER_PROMPT, type MotionRule, type ScenePlan } from './domain.ts';
import { parsePrompt, validatePlannerResult, validateScenePlan, type PlannerResult } from './planner.ts';
import { durationFor, measureMotion, sampleMotion } from './motion.ts';
import { forgetMemory, loadMemory, makeRule, saveMemory, validateRule, type MemoryStorage } from './memory.ts';
import { renderMiniProp, renderStage } from './renderer.ts';

const paths: Record<string, string> = {
  play: '<path d="m8 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  sparkle: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3ZM20 2v4m-2-2h4"/>',
  replay: '<path d="M4 11a8 8 0 1 1 2 7M4 4v7h7"/>',
  rig: '<circle cx="12" cy="4" r="2"/><path d="M12 6v9m-7-5 7 2 7-2M7 22l5-7 5 7"/>',
  creature: '<path d="M4 12h13l3-5 2 3-3 3M5 12v8m5-8v8m5-8v8m4-8v8"/>',
  edit: '<path d="m4 16-1 5 5-1L21 7l-4-4ZM14 6l4 4"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M11 4H4v16h16v-7"/>',
  memory: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(35 12 12)"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header class="app-header">
  <a class="brand" href="./" aria-label="Morphé home"><span class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 24V9l11 13L27 9v15" stroke="#dbebc7" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="27" cy="8" r="3" fill="#d7ac62"/></svg></span><span class="wordmark">morphé</span><span class="brand-sep"></span><span class="header-note">A playground for motion that remembers.</span></a>
  <div class="header-actions"><span class="poc-tag">RESEARCH PROTOTYPE / 01</span><a class="quiet-link" href="https://github.com/nicolashedoire/morphe-motion-poc" target="_blank" rel="noopener">View source ${icon('external')}</a></div>
</header>
<main class="shell">
  <section class="intro"><div><p class="eyebrow">From a direction to a lasting lesson</p><h1>Give motion a <em>memory.</em></h1><p>Describe a scene. Teach one correction. Let it travel to a different body.</p></div><div class="intro-actions"><span class="pill" id="mode-pill"><span class="dot"></span>Local demo · no model connected</span><button class="secondary" id="export" title="Export session">${icon('download')} Export session</button></div></section>
  <div class="workspace">
    <section class="panel prompt-panel" aria-labelledby="direct-heading"><div class="panel-top"><h2 class="panel-title" id="direct-heading">Direct the scene</h2><span class="step-number">01 / PROMPT</span></div>
      <div class="panel-body"><label class="field-label" for="prompt">What should happen?</label><div class="prompt-wrap"><textarea id="prompt" maxlength="1200" spellcheck="false"></textarea><div class="prompt-footer"><span>EN / FR · supported actions</span><kbd>⌘ ↵</kbd></div></div><button id="generate" class="primary full">${icon('sparkle')} Create the scene</button>
      <div class="section-label"><span>Two bodies, one lesson</span><span>TRY IT</span></div><div class="example-list"><button class="example-card" id="example-biped"><span class="example-icon">${icon('rig')}</span><span class="example-copy"><strong>Pip & the parcel</strong><span>A two-legged beginning</span></span></button><button class="example-card" id="example-quadruped"><span class="example-icon violet">${icon('creature')}</span><span class="example-copy"><strong>Nori & the tray</strong><span>A different body. Same rule.</span></span></button></div>
      <p class="feedback" id="feedback" role="status">Start with Pip. Notice the wobble, then teach a steadier carry.</p><p class="warnings" id="warnings">Local mode uses a small EN/FR grammar. Try color, pace, box/tray, table/shelf or “keep it level”.</p></div>
      <div class="planner-control"><label for="planner">Planner</label><select id="planner"><option value="local">Local demo (no AI)</option><option value="openai" disabled>OpenAI · server key required</option></select></div>
    </section>
    <div class="stage-column"><section class="panel stage-panel" aria-label="Animated scene"><div class="stage-toolbar"><div class="stage-name"><span class="dot"></span><span id="scene-name">Pip & the parcel</span></div><div class="toolbar-buttons"><button class="toolbar-btn" id="show-rig" aria-pressed="false">${icon('rig')} Rig</button><button class="toolbar-btn" id="teach" aria-pressed="false">${icon('edit')} Teach a correction</button></div></div>
      <div class="stage" id="stage"></div>
      <div class="teaching-bar" id="teaching-bar" hidden><div class="teaching-copy"><strong>Show what “steady” means.</strong><br><span id="angle-label">Drag the orange handle, or use Level it.</span></div><div class="teaching-actions"><button class="secondary" id="level">Level it</button><button class="primary" id="remember">Remember correction</button><button class="ghost" id="cancel-teach">Cancel</button></div></div>
      <div class="transport"><div class="transport-row"><button id="play" class="play-btn" aria-label="Play scene">${icon('play')}</button><button id="restart" class="ghost restart" aria-label="Restart scene">${icon('replay')}</button><input class="scrubber" id="seek" type="range" min="0" max="1000" value="450" aria-label="Scene progress"><span class="timecode" id="timecode"></span><select class="speed" id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option></select></div><div class="phases" id="phases">${['Approach','Grasp','Carry','Place','Wave'].map((label,i)=>`<div class="phase" data-phase="${label.toLowerCase()}"><span>0${i+1}</span>${label}</div>`).join('')}</div></div></section>
      <nav class="journey" aria-label="Try the experiment"><button class="journey-step active" id="step-scene"><span class="journey-number">1</span><span class="journey-copy"><strong>Make a scene</strong><span>A prompt becomes motion</span></span></button><button class="journey-step" id="step-teach"><span class="journey-number">2</span><span class="journey-copy"><strong>Teach it once</strong><span>Turn a correction into a rule</span></span></button><button class="journey-step" id="step-transfer"><span class="journey-number">3</span><span class="journey-copy"><strong>Change the body</strong><span>Watch the lesson travel</span></span></button></nav>
      <div class="below-stage"><span>Editable SVG · procedural motion · StykAnimate IK</span><button class="ghost" id="export-svg">${icon('download')} Save frame</button></div>
    </div>
    <aside class="memory-column"><section class="panel memory-panel" aria-labelledby="memory-heading"><div class="panel-top"><h2 class="panel-title" id="memory-heading">Motion memory</h2><span class="memory-count" id="memory-count">0 RULES</span></div><div class="panel-body" id="memory-body"></div><div class="memory-footnote">Saved in this browser. A small, explicit rule — no neural model is being trained.</div></section><details class="model-note"><summary>What is this demonstrating?</summary><p>A correction belongs to the action, so a different supported body can reuse it. The motion is procedural; the optional language model only plans the scene.</p><button class="ghost" id="about">Read the prototype boundaries ${icon('arrow')}</button></details></aside>
  </div>
  <footer class="footer"><span><strong>morphé / experiment 001</strong> &nbsp; A small step toward teachable animation.</span><span><button class="ghost" id="import">Import session</button> · <a href="https://github.com/nicolashedoire/morphe-motion-poc#readme">Documentation</a> · GPL-3.0-or-later</span></footer>
</main>
<dialog class="modal" id="about-modal"><h2>A lesson that travels.</h2><p>This proof of concept stores a reusable orientation constraint for a carried object. Two authored bodies share the same semantic rule.</p><ul><li><strong>Working:</strong> bounded scene planning, procedural motion, inverse kinematics, gesture or text corrections, local persistence, transfer and export.</li><li><strong>Not implemented:</strong> neural training, physics, arbitrary rigs, arbitrary actions, video generation or learned generalization.</li><li><strong>Optional AI:</strong> a server-side OpenAI model translates language into the same limited scene vocabulary. The public demo uses the local grammar.</li></ul><p>The articulation solver is extracted from Filippo Calippo’s <a href="https://github.com/filippocalippo/StykAnimate-App">StykAnimate</a>. This project is distributed under GPL-3.0-or-later.</p><button class="primary" id="close-about">Back to the experiment</button></dialog>
<div class="toast" id="toast" role="status" hidden></div><input type="file" id="import-file" accept=".json,.morphe.json,application/json">`;

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const storage: MemoryStorage = {
  getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value), removeItem:key=>localStorage.removeItem(key),
};
let scene: ScenePlan = {...DEFAULT_SCENE};
let rule: MotionRule | null = loadMemory(storage);
let enabled = true, playing = false, progress = .5, speed = 1, teaching = false, showRig = false, teachingAngle = 0;
let drag = false, lastTime = 0, toastTimer = 0, generation = 0;
const prompt = el<HTMLTextAreaElement>('prompt');
prompt.value = DEFAULT_PROMPT;
const actorName = () => scene.actor === 'biped' ? 'Pip' : 'Nori';
const degrees = (a:number) => a * 180 / Math.PI;

function toast(message:string) {
  const node=el('toast'); node.textContent=message; node.hidden=false;
  clearTimeout(toastTimer); toastTimer=window.setTimeout(()=>node.hidden=true,3200);
}
function feedback(message:string,error=false,warnings:string[] = []) {
  el('feedback').textContent=message; el('feedback').classList.toggle('error',error);
  el('warnings').textContent=warnings.join(' ');
}
function journey(step:number) {
  ['step-scene','step-teach','step-transfer'].forEach((id,i)=>el(id).classList.toggle('active',i===step));
}
function setPlaying(value:boolean) {
  playing=value; lastTime=0;
  el('play').innerHTML=icon(playing?'pause':'play'); el('play').setAttribute('aria-label',playing?'Pause scene':'Play scene');
}
function render() {
  const frame=sampleMotion(scene,progress,rule,{enabled, ...(teaching?{teachingAngle}:{})});
  el('stage').innerHTML=renderStage(frame,scene,{teaching,showRig});
  el<HTMLInputElement>('seek').value=String(Math.round(progress*1000));
  el('timecode').textContent=`${(progress*durationFor(scene)).toFixed(1)} / ${durationFor(scene).toFixed(1)}s`;
  const order=['approach','grasp','carry','place','wave'];
  document.querySelectorAll<HTMLElement>('.phase').forEach((node,i)=>{
    node.classList.toggle('active',node.dataset.phase===frame.phase);
    node.classList.toggle('complete',i<order.indexOf(frame.phase));
    node.hidden=node.dataset.phase==='wave'&&!scene.wave;
  });
  app.dataset.actor=scene.actor; app.dataset.memory=String(Boolean(rule)); app.dataset.memoryEnabled=String(enabled);
  app.dataset.teaching=String(teaching); app.dataset.progress=String(progress);
  if(teaching) el('angle-label').textContent=`Current tilt: ${degrees(teachingAngle).toFixed(1)}°. Drag the orange handle, or use Level it.`;
}
function memoryUI() {
  const baseline=measureMotion(scene,null);
  const corrected=rule?measureMotion(scene,rule):null;
  el('memory-count').textContent=rule?'1 RULE':'0 RULES';
  const targetDegrees=rule?degrees(rule.targetAngle):0;
  const title=Math.abs(targetDegrees)<.05?'Keep the carried object level':`Carry at ${targetDegrees.toFixed(1)}°`;
  const transferred=rule && rule.taughtOn!==scene.actor;
  el('memory-body').innerHTML=`${rule?`<div class="rule-card"><div class="rule-kicker"><span>Portable constraint</span>${icon('memory')}</div><h3>${title}</h3><p>Taught on ${rule.taughtOn==='biped'?'Pip · two legs':'Nori · four legs'}<br>By ${rule.source==='gesture'?'a direct correction':'a text instruction'}</p><code>carry → carried object</code></div>${transferred?`<div class="transfer-note">${icon('sparkle')} Same lesson, new body. Applied to ${actorName()} without teaching it again.</div>`:''}<div class="memory-toggle"><span>Apply remembered rule</span><button class="switch" id="memory-toggle" role="switch" aria-label="Apply remembered rule" aria-checked="${enabled}"></button></div>`:`<div class="memory-empty"><div class="memory-orbit">${icon('memory')}</div><div><h3>One little lesson.</h3><p>Correct the wobble once.<br>Keep the lesson for what comes next.</p></div></div>`}
    <div class="comparison"><p class="small-title">A steadier carry, measured.</p><div class="comparison-grid"><div class="comparison-card"><span>Original</span>${renderMiniProp(baseline.maxTiltDegrees*Math.PI/180,'#bd9263')}<strong id="before-tilt">${baseline.maxTiltDegrees.toFixed(1)}°</strong></div><div class="comparison-card after"><span>With memory</span>${renderMiniProp(rule?rule.targetAngle:0,'#809c64')}<strong id="after-tilt">${corrected?`${corrected.maxTiltDegrees.toFixed(1)}°`:'—'}</strong></div></div><p class="metric-caption">Peak absolute tilt during carry · ${baseline.samples} samples<br>${rule?'Comparison previews the stored rule, even when disabled.':'Teach a correction to compare.'}</p></div>
    ${rule?'<button class="ghost full" id="forget" style="margin-top:12px">Forget this lesson</button>':''}`;
  el('memory-toggle')?.addEventListener('click',()=>{enabled=!enabled;memoryUI();render();toast(enabled?'Memory applied.':'Memory off. Original motion restored.');});
  el('forget')?.addEventListener('click',()=>{
    const saved=forgetMemory(storage); rule=null; enabled=true; memoryUI();render();journey(0);
    toast(saved?'Lesson forgotten.':'Cleared for this session. Browser storage could not be updated.');
  });
  app.dataset.transferred=String(Boolean(transferred));
}
function endTeaching() {
  teaching=false; drag=false; el('teaching-bar').hidden=true; el('teach').setAttribute('aria-pressed','false');
  el<HTMLInputElement>('seek').disabled=false;
}
function beginTeaching() {
  setPlaying(false); progress=.5;
  teachingAngle=sampleMotion(scene,progress,rule,{enabled}).prop.angle;
  teaching=true; el('teaching-bar').hidden=false;el('teach').setAttribute('aria-pressed','true');
  el<HTMLInputElement>('seek').disabled=true; journey(1);render();
}
function remember(angle:number,source:'gesture'|'text') {
  rule=makeRule({actor:scene.actor,source,targetAngle:Math.abs(angle)<Math.PI/90?0:angle});
  enabled=true;const saved=saveMemory(storage,rule);endTeaching();progress=.5;setPlaying(false);memoryUI();render();journey(2);
  feedback('Lesson remembered. Try Nori & the tray to see it transfer to another body.',false,['An explicit orientation rule is saved; no neural weights are updated.']);
  toast(saved?'Correction saved to motion memory.':'Correction active for this session; browser storage is unavailable.');
}
function applyResult(result:PlannerResult) {
  if(result.kind==='unsupported'){feedback(result.message,true);return;}
  if(result.kind==='correction'){remember(result.targetAngle,'text');return;}
  scene=result.plan;endTeaching();progress=0;setPlaying(true);
  el('scene-name').textContent=`${actorName()} & the ${scene.prop==='box'?'parcel':'tray'}`;
  memoryUI();render();journey(rule&&rule.taughtOn!==scene.actor?2:0);
  feedback(result.summary,false,result.warnings);
}
async function generate() {
  const request=++generation; const button=el<HTMLButtonElement>('generate');
  if(el<HTMLSelectElement>('planner').value==='local'){applyResult(parsePrompt(prompt.value,scene));return;}
  button.disabled=true;button.textContent='Planning the scene…';
  try {
    const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt.value,currentScene:scene}),signal:AbortSignal.timeout(35000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'The planner request failed.');
    if(request===generation)applyResult(validatePlannerResult(result));
  }catch(error){if(request===generation)feedback(error instanceof Error?error.message:'Could not reach the AI planner.',true,['No local fallback was substituted. Choose Local demo to continue offline.']);}
  finally{if(request===generation){button.disabled=false;button.innerHTML=`${icon('sparkle')} Create the scene`;}}
}
function example(text:string) {
  // Samples remain executable in both planning modes.
  prompt.value=text;void generate();
}
el('generate').addEventListener('click',()=>void generate());
el('example-biped').addEventListener('click',()=>example(DEFAULT_PROMPT));
el('example-quadruped').addEventListener('click',()=>example(TRANSFER_PROMPT));
el('step-scene').addEventListener('click',()=>example(DEFAULT_PROMPT));
el('step-transfer').addEventListener('click',()=>example(TRANSFER_PROMPT));
['teach','step-teach'].forEach(id=>el(id).addEventListener('click',beginTeaching));
el('level').addEventListener('click',()=>{teachingAngle=0;render();});
el('remember').addEventListener('click',()=>remember(teachingAngle,'gesture'));
el('cancel-teach').addEventListener('click',()=>{endTeaching();render();journey(rule?2:0);});
el('play').addEventListener('click',()=>{if(teaching)endTeaching();if(progress>=1)progress=0;setPlaying(!playing);render();});
el('restart').addEventListener('click',()=>{endTeaching();progress=0;setPlaying(true);render();});
el<HTMLInputElement>('seek').addEventListener('input',e=>{progress=Number((e.target as HTMLInputElement).value)/1000;setPlaying(false);render();});
el<HTMLSelectElement>('speed').addEventListener('change',e=>speed=Number((e.target as HTMLSelectElement).value));
el('show-rig').addEventListener('click',()=>{showRig=!showRig;el('show-rig').setAttribute('aria-pressed',String(showRig));render();});
const stage=el('stage');
stage.addEventListener('pointerdown',event=>{
  if(!teaching||!(event.target as Element).closest('[data-drag-handle]'))return;
  drag=true;stage.setPointerCapture(event.pointerId);event.preventDefault();
});
stage.addEventListener('pointermove',event=>{
  if(!drag||!teaching)return;
  const svg=stage.querySelector('svg')!;const matrix=svg.getScreenCTM();if(!matrix)return;
  const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  const {center}=sampleMotion(scene,progress,rule,{enabled,teachingAngle}).prop;
  const angle=Math.atan2(point.y-center.y,point.x-center.x);
  teachingAngle=Math.max(-Math.PI/6,Math.min(Math.PI/6,angle));render();
});
stage.addEventListener('pointerup',()=>drag=false);
stage.addEventListener('pointercancel',()=>drag=false);

function download(name:string,text:string,mime:string) {
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
el('export').addEventListener('click',()=>{
  download('morphe-session.morphe.json',JSON.stringify({format:'morphe-motion',version:1,scene,rule},null,2),'application/json');toast('Scene and motion memory exported.');
});
el('export-svg').addEventListener('click',()=>download('morphe-frame.svg',renderStage(sampleMotion(scene,progress,rule,{enabled,...(teaching?{teachingAngle}:{})}),scene,{showRig}),'image/svg+xml'));
el('import').addEventListener('click',()=>el<HTMLInputElement>('import-file').click());
el<HTMLInputElement>('import-file').addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  try {
    if(file.size>128_000)throw new Error('This session file is too large (128 KB maximum).');
    const value=JSON.parse(await file.text());
    if(value?.format!=='morphe-motion'||value.version!==1)throw new Error('This is not a Morphé session.');
    const next=validateScenePlan(value.scene);const nextRule=value.rule===null?null:validateRule(value.rule);
    if(value.rule!==null&&!nextRule)throw new Error('The imported memory rule is invalid.');
    ++generation;el<HTMLButtonElement>('generate').disabled=false;el('generate').innerHTML=`${icon('sparkle')} Create the scene`;
    scene=next;rule=nextRule;enabled=true;endTeaching();progress=.5;setPlaying(false);
    const saved=rule?saveMemory(storage,rule):forgetMemory(storage);prompt.value=`${scene.color} ${scene.actor} carries a ${scene.prop} to the ${scene.destination}.`;
    el('scene-name').textContent=`${actorName()} & the ${scene.prop==='box'?'parcel':'tray'}`;
    memoryUI();render();journey(rule?2:0);feedback('Session imported. The scene and its memory are ready.');
    toast(saved?'Session imported.':'Imported for this session; browser storage is unavailable.');
  }catch(error){feedback(error instanceof Error?error.message:'Invalid session file.',true);}
  finally{input.value='';}
});
const modal=el<HTMLDialogElement>('about-modal');
el('about').addEventListener('click',()=>modal.showModal());el('close-about').addEventListener('click',()=>modal.close());
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();void generate();}
  if(event.code==='Space'&&!modal.open&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes((event.target as Element).tagName)){
    event.preventDefault();el('play').click();
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
el<HTMLSelectElement>('planner').addEventListener('change',()=>{
  ++generation;el<HTMLButtonElement>('generate').disabled=false;el('generate').innerHTML=`${icon('sparkle')} Create the scene`;
  const ai=el<HTMLSelectElement>('planner').value==='openai';
  el('mode-pill').innerHTML=`<span class="dot"></span>${ai?'OpenAI planner · procedural animation':'Local demo · no model connected'}`;
  feedback(ai?'The configured language model will plan your next scene.':'Local demo selected. Prompts use the supported EN/FR grammar.');
});
async function detectAI() {
  if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;
  try {
    const response=await fetch('/api/status',{signal:AbortSignal.timeout(2500)});
    if(!response.ok)return;const status=await response.json();
    if(status.available){const option=el<HTMLSelectElement>('planner').options[1];option.disabled=false;option.textContent=`OpenAI · ${status.model}`;}
  }catch{/* Local mode is complete without a server or API key. */}
}
function tick(time:number) {
  if(playing&&!teaching){
    if(lastTime)progress=Math.min(1,progress+Math.min((time-lastTime)/1000,.1)*speed/durationFor(scene));
    lastTime=time;render();if(progress>=1)setPlaying(false);
  }
  requestAnimationFrame(tick);
}
memoryUI();render();
if(rule){journey(2);feedback('Your remembered correction is back. Change the body, or switch memory off to compare.');}
void detectAI();requestAnimationFrame(tick);
