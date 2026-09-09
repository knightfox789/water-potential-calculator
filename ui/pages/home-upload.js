import { CONTROLLED_TEMPLATE } from '../../services/template-service.js';

function formatBytes(bytes){
  if(!Number.isFinite(bytes))return 'Unknown size';
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(2)} MB`;
}
function shortHash(value){return value?`${value.slice(0,10)}…${value.slice(-6)}`:'Not available';}
function setBusy(root,busy,label='Working…'){
  root.querySelectorAll('button,input').forEach(el=>{if(el.dataset.keepEnabled!=='true')el.disabled=busy;});
  const status=root.querySelector('[data-upload-status]');if(status&&busy)status.textContent=label;
}

export function mountHomeUpload({main,controller,templateManifest=null,pipelineMode='unavailable',onReview=null}={}){
  if(!main||!controller)throw new Error('Home Upload requires main and controller.');
  main.innerHTML=`
  <div class="upload-page launch-page" data-upload-root>
    <section class="launch-hero">
      <div class="launch-copy">
        <span class="eyebrow">Field-ready water analysis</span>
        <h1>Turn structure data into clear water-potential insights.</h1>
        <p class="launch-lead">Upload an input workbook, review data quality, calculate water potential and participation, explore structures and geographies, and generate decision-ready reports.</p>
        <div class="launch-actions"><button class="button primary hero-upload" data-hero-upload>Upload workbook</button><a class="button secondary" data-hero-template download="${CONTROLLED_TEMPLATE.filename}">Download input template</a></div>
        <div class="trust-row"><span>✓ Browser-local processing</span><span>✓ Verified calculation engine</span><span>✓ Management & technical reports</span></div>
      </div>
      <div class="launch-visual" aria-label="Five step analysis workflow">
        <div class="flow-step"><b>1</b><span>Upload</span><small>Input workbook</small></div>
        <div class="flow-arrow">→</div><div class="flow-step"><b>2</b><span>Check</span><small>Data quality</small></div>
        <div class="flow-arrow">→</div><div class="flow-step"><b>3</b><span>Calculate</span><small>Water & participation</small></div>
        <div class="flow-arrow">→</div><div class="flow-step"><b>4</b><span>Explore</span><small>Structures & geography</small></div>
        <div class="flow-arrow">→</div><div class="flow-step"><b>5</b><span>Report</span><small>Decision-ready outputs</small></div>
      </div>
    </section>

    <section class="capability-grid" aria-label="Calculator capabilities">
      <article class="capability-card"><span class="capability-icon">◫</span><h2>Water potential</h2><p>See calculated water contribution by KPI, structure type and geography.</p></article>
      <article class="capability-card"><span class="capability-icon">⌁</span><h2>Structure intelligence</h2><p>Understand method, water behaviour, result, evidence and review needs for each structure.</p></article>
      <article class="capability-card"><span class="capability-icon">▤</span><h2>Programme insights</h2><p>Compare districts, blocks, villages, calculation methods and result status without changing calculation truth.</p></article>
      <article class="capability-card"><span class="capability-icon">⇩</span><h2>Professional reports</h2><p>Download clean management and technical reports plus specialist technical evidence when required.</p></article>
    </section>

    <section class="upload-grid" aria-label="Workbook selection">
      <div class="card upload-card">
        <div><span class="eyebrow">Start analysis</span><h2>Upload input workbook</h2><p class="muted">Supported format: <strong>.xlsx</strong>. Your project data stays in this browser.</p></div>
        <label class="drop-zone" data-drop-zone tabindex="0">
          <input class="sr-only" data-file-input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
          <span class="drop-icon" aria-hidden="true">⇧</span><strong>Drag & drop workbook here</strong><span>or choose a file from this device</span><span class="button secondary">Choose workbook</span>
        </label>
        <div class="upload-status muted" data-upload-status aria-live="polite">No workbook selected.</div>
      </div>

      <div class="card template-card">
        <div class="card-heading"><div><span class="eyebrow">Input template</span><h2>Template v1.1</h2></div><span class="status-pill neutral">Ready to use</span></div>
        <p>Use the blank template for new data collection. It contains the required sheets, field names and lookup values, with no hidden KPI formulas.</p>
        <a class="button secondary" data-template-link download="${CONTROLLED_TEMPLATE.filename}">Download input template</a>
        <details><summary>Technical template details</summary><dl class="compact-meta"><div><dt>Internal version</dt><dd>${templateManifest?.templateVersion||CONTROLLED_TEMPLATE.version}</dd></div><div><dt>File check</dt><dd class="mono">${shortHash(templateManifest?.sha256)}</dd></div></dl></details>
      </div>
    </section>

    <section class="card sample-card">
      <div class="card-heading"><div><span class="eyebrow">Try the calculator</span><h2>Load sample data</h2></div><span class="status-pill warning">Demo only</span></div>
      <p class="muted">Use a sample to explore the workflow. Sample results are clearly marked and are not project reporting data.</p>
      <div class="sample-actions"><button class="button secondary" data-sample="leap">Leap-year sample</button><button class="button secondary" data-sample="nonleap">Non-leap sample</button></div>
    </section>

    <section class="card selected-card" data-selected-card hidden aria-live="polite">
      <div class="card-heading"><div><span class="eyebrow">Selected workbook</span><h2 data-selected-name></h2></div><span class="status-pill" data-selected-kind></span></div>
      <div class="selected-file-grid"><dl class="compact-meta"><div><dt>Size</dt><dd data-selected-size></dd></div><div><dt>File check</dt><dd class="mono" data-selected-hash></dd></div><div><dt>Source</dt><dd data-selected-source></dd></div><div><dt>Processing</dt><dd>Local browser</dd></div></dl><div class="selected-actions"><button class="button secondary" data-clear>Clear workbook</button><button class="button primary" data-review>Check workbook</button></div></div>
      <p class="synthetic-notice" data-synthetic hidden><strong>Sample validation data.</strong> Use this only to explore the calculator.</p>
    </section>

    <section class="privacy-panel"><strong>Your data stays private</strong><span>The workbook is processed locally in this browser. It is not sent to an application server or placed in the page URL.</span></section>

    <footer class="launch-footer"><span>Water Potential Calculator</span><span>Developed by <strong>Kaushal Gadariya</strong> · Soil and Water Conservation Engineer</span><span><a data-profile="portfolio" target="_blank" rel="noopener">Portfolio</a> · <a data-profile="linkedin" target="_blank" rel="noopener">LinkedIn</a></span></footer>
  </div>`;

  const root=main.querySelector('[data-upload-root]'),input=root.querySelector('[data-file-input]'),drop=root.querySelector('[data-drop-zone]'),status=root.querySelector('[data-upload-status]'),selectedCard=root.querySelector('[data-selected-card]'),templateLink=root.querySelector('[data-template-link]'),heroTemplate=root.querySelector('[data-hero-template]');
  templateLink.href=CONTROLLED_TEMPLATE.url.href;heroTemplate.href=CONTROLLED_TEMPLATE.url.href;root.querySelector('[data-hero-upload]').onclick=()=>input.click();
  const profileLinks={portfolio:['https:','','knightfox789.github.io','kaushal-gadariya-portfolio',''].join('/'),linkedin:['https:','','www.linkedin.com','in','kaushal-gadariya-670221b1',''].join('/')};root.querySelectorAll('[data-profile]').forEach(a=>a.href=profileLinks[a.dataset.profile]);
  async function choose(file,options={}){if(!file)return;setBusy(root,true,'Reading workbook…');status.classList.remove('error-text');try{await controller.selectWorkbook(file,options);status.textContent='Workbook selected. Check it before calculation.';}catch(error){status.textContent=error.message;status.classList.add('error-text');}finally{setBusy(root,false);}}
  input.addEventListener('change',()=>choose(input.files?.[0]));drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});for(const name of ['dragenter','dragover'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('drag-active');});for(const name of ['dragleave','drop'])drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('drag-active');});drop.addEventListener('drop',event=>choose(event.dataTransfer?.files?.[0]));
  root.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',async()=>{setBusy(root,true,'Loading sample…');status.classList.remove('error-text');try{await controller.loadSample(button.dataset.sample);status.textContent='Sample selected. Check workbook to continue.';}catch(error){status.textContent=error.message;status.classList.add('error-text');}finally{setBusy(root,false);}}));
  root.querySelector('[data-clear]').addEventListener('click',async()=>{setBusy(root,true,'Clearing workbook…');await controller.clearWorkbook();status.textContent='No workbook selected.';input.value='';setBusy(root,false);});
  root.querySelector('[data-review]').addEventListener('click',async()=>{setBusy(root,true,'Checking workbook…');status.classList.remove('error-text');try{await controller.reviewSelectedWorkbook();status.textContent='Workbook check complete.';onReview?.();}catch(error){status.textContent=error.message;status.classList.add('error-text');}finally{setBusy(root,false);}});
  const unsubscribe=controller.subscribe(state=>{const source=state.source||{},selected=Boolean(source.name);selectedCard.hidden=!selected;if(!selected)return;root.querySelector('[data-selected-name]').textContent=source.name;root.querySelector('[data-selected-size]').textContent=formatBytes(source.size);root.querySelector('[data-selected-hash]').textContent=shortHash(source.sha256);root.querySelector('[data-selected-source]').textContent=source.synthetic?'Sample workbook':'Local workbook';const kind=root.querySelector('[data-selected-kind]');kind.textContent=source.synthetic?'Sample':'Ready';kind.className=`status-pill ${source.synthetic?'warning':'ready'}`;root.querySelector('[data-synthetic]').hidden=!source.synthetic;});
  return ()=>unsubscribe?.();
}
