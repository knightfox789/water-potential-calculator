import { createMappingReviewViewModel } from '../../views/mapping-review-view-model.js';
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function methodLabel(method){return ({'exact-field-id':'Exact field ID','normalized-header':'Header match','alias':'Alias','fuzzy':'Fuzzy suggestion','manual':'Manual','unmapped':'Unmapped'}[method]||method||'—');}
function fieldSource(row){return row.sourceHeader===null?'Not mapped':`“${esc(row.sourceHeader)}”`+`${row.sourceSheet?` · ${esc(row.sourceSheet)}`:''}`;}
function summaryCard(label,value,tone='neutral'){return `<article class="mapping-summary-card ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;}
function statusPill(status){return `<span class="status-pill ${status.tone}">${esc(status.label)}</span>`;}
function sourceOptions(catalog,currentSheet,currentIndex){
  const options=['<option value="">Leave unmapped</option>'];
  for(const sheet of catalog){for(const col of sheet.headers||[]){const value=`${encodeURIComponent(sheet.name)}::${col.index}`;const selected=sheet.name===currentSheet&&Number(col.index)===Number(currentIndex)?' selected':'';options.push(`<option value="${esc(value)}"${selected}>${esc(sheet.name)} — ${esc(col.header)}</option>`);}}
  return options.join('');
}
function sheetOptions(catalog,current){return ['<option value="">No source sheet</option>',...catalog.map(s=>`<option value="${esc(s.name)}"${s.name===current?' selected':''}>${esc(s.name)}</option>`)].join('');}
function drawerHtml(row,vm){
  const suggestions=(row.suggestions||[]).map(s=>`<li><strong>${esc(s.header)}</strong><span>${esc(Math.round(Number(s.score||0)*100))}% confidence · column ${esc(Number(s.columnIndex)+1)}</span></li>`).join('')||'<li class="muted">No automatic suggestions available.</li>';
  return `<aside class="mapping-drawer" data-mapping-drawer aria-label="Field review detail"><div class="drawer-head"><div><span class="eyebrow">Calculator field</span><h2>${esc(row.controlledField)}</h2><p class="mono">${esc(row.fieldId)}</p></div><button class="button secondary compact-button" data-close-drawer>Close</button></div>
    <dl class="compact-meta drawer-meta"><div><dt>Expected sheet</dt><dd>${esc(row.expectedSheet)}</dd></div><div><dt>Data type</dt><dd>${esc(row.dataType||'—')}</dd></div><div><dt>Unit / format</dt><dd>${esc(row.unitFormat||'Not specified')}</dd></div><div><dt>Requirement</dt><dd>${esc(row.requirementClass||'—')}</dd></div><div><dt>Method</dt><dd class="mono">${esc(row.method||'—')}</dd></div><div><dt>Confidence</dt><dd>${esc(row.confidenceLabel)}</dd></div><div><dt>Current source</dt><dd>${fieldSource(row)}</dd></div></dl>
    <div class="drawer-section"><h3>Candidate source fields</h3><ul class="candidate-list">${suggestions}</ul></div>
    <div class="drawer-section"><h3>Choose source</h3><label class="field-label" for="mapping-source-select">Source field</label><select id="mapping-source-select" class="mapping-select" data-field-source>${sourceOptions(vm.sourceCatalog,row.sourceSheet,row.sourceColumnIndex)}</select><div class="drawer-actions"><button class="button primary" data-apply-field data-field-id="${esc(row.fieldId)}">Apply source</button>${row.needsConfirmation&&!row.confirmed&&row.sourceHeader!==null?`<button class="button secondary" data-confirm-field data-field-id="${esc(row.fieldId)}">Confirm suggestion</button>`:''}</div></div>
    <div class="drawer-section privacy-note"><strong>Workbook values are kept private on this screen.</strong><p class="muted">Only column names and match confidence are shown here. Row values are not copied into this review screen.</p></div>
  </aside>`;
}

export async function confirmMappingReview({controller,onConfirmed=null}={}){
  if(!controller?.confirmMapping)throw new Error('Field review is not available in this session.');
  const final=await controller.confirmMapping();
  await onConfirmed?.(final);
  return final;
}

export async function mountMappingReview({main,controller,onBack=null,onConfirmed=null}={}){
  if(!main||!controller)throw new Error('Mapping Review requires main and controller.');
  let filter='attention';let activeFieldId=null;let busy=false;let metadata=[];
  try{metadata=await controller.mappingMetadata();}catch{metadata=[];}
  async function ensureMapping(){const current=controller.getState().mapping?.snapshot;if(current)return current;return controller.mappingPreview();}
  let mapping=await ensureMapping();
  async function act(fn){if(busy)return;busy=true;try{mapping=await fn();activeFieldId=null;render();}catch(error){render(error.message);}finally{busy=false;}}
  function render(errorMessage=''){
    const vm=createMappingReviewViewModel(mapping,metadata,filter);const active=activeFieldId?vm.fields.find(x=>x.fieldId===activeFieldId):null;
    const sheetAttention=vm.sheets.filter(x=>x.status.attention);
    main.innerHTML=`<div class="mapping-page" data-mapping-root>
      <section class="page-heading"><div><span class="eyebrow">Prepare Data · Field Review</span><h1>Review workbook fields</h1><p class="lead">Most fields are matched automatically. Review only the items that need attention, then continue.</p></div><span class="status-pill ${vm.canConfirm?'ready':'warning'}">${vm.canConfirm?'Ready to continue':`${vm.summary.blocking} blocking / pending`}</span></section>
      ${errorMessage?`<div class="mapping-alert error-text" role="alert">${esc(errorMessage)}</div>`:''}
      <section class="mapping-summary-grid" aria-label="Mapping summary">
        ${summaryCard('Mapped automatically',vm.summary.mappedAutomatically,'ready')}
        ${summaryCard('Needs confirmation',vm.summary.needsConfirmation,vm.summary.needsConfirmation?'warning':'ready')}
        ${summaryCard('Conflicts',vm.summary.conflicts,vm.summary.conflicts?'error':'ready')}
        ${summaryCard('Unmapped required',vm.summary.unmappedRequired,vm.summary.unmappedRequired?'error':'ready')}
      </section>
      ${sheetAttention.length?`<section class="card"><div class="card-heading"><div><span class="eyebrow">Sheet review</span><h2>Sheet confirmations needing attention</h2></div><span class="status-pill warning">${sheetAttention.length}</span></div><div class="sheet-mapping-list">${sheetAttention.map(s=>`<div class="sheet-mapping-row"><div><strong>${esc(s.expectedSheet)}</strong><span class="cell-note">${esc(s.method)} · ${esc(s.confidenceLabel)}</span></div><select class="mapping-select" aria-label="Source sheet for ${esc(s.expectedSheet)}" data-sheet-select="${esc(s.expectedSheet)}">${sheetOptions(vm.sourceCatalog,s.sourceSheet)}</select><div class="row-actions"><button class="button secondary compact-button" data-apply-sheet="${esc(s.expectedSheet)}">Apply</button>${s.sourceSheet&&s.needsConfirmation&&!s.confirmed?`<button class="button primary compact-button" data-confirm-sheet="${esc(s.expectedSheet)}">Confirm</button>`:''}</div></div>`).join('')}</div></section>`:''}
      <section class="card mapping-table-card"><div class="mapping-tabs" role="tablist" aria-label="Field review filters">${vm.filters.map(t=>`<button type="button" class="mapping-tab" data-filter="${t.id}" aria-selected="${filter===t.id}">${esc(t.label)} <span>${t.count}</span></button>`).join('')}</div>
        <div class="table-scroll"><table class="data-table mapping-table"><caption class="sr-only">Calculator field mapping review</caption><thead><tr><th>Calculator field</th><th>Source</th><th>Method</th>${filter==='advanced'?'<th>Confidence</th><th>Requirement</th>':''}<th>Status</th><th></th></tr></thead><tbody>
        ${vm.rows.length?vm.rows.map(row=>`<tr class="mapping-row ${row.status.attention?'attention':''}"><td><strong>${esc(row.controlledField)}</strong><span class="cell-note mono">${esc(row.fieldId)} · ${esc(row.expectedSheet)}</span></td><td>${fieldSource(row)}</td><td>${esc(methodLabel(row.method))}${filter==='advanced'?`<span class="cell-note mono">${esc(row.method)}</span>`:''}</td>${filter==='advanced'?`<td>${esc(row.confidenceLabel)}</td><td>${esc(row.requirementClass)}</td>`:''}<td>${statusPill(row.status)}</td><td class="numeric"><button class="button secondary compact-button" data-open-field="${esc(row.fieldId)}">Review</button></td></tr>`).join(''):`<tr><td colspan="${filter==='advanced'?7:5}" class="muted">No fields in this view.</td></tr>`}
        </tbody></table></div>
      </section>
      <details class="card advanced-details"><summary>Technical matching details</summary><div class="advanced-grid"><dl class="compact-meta"><div><dt>Matching engine</dt><dd class="mono">${esc(vm.engineContractVersion||'—')}</dd></div><div><dt>Schema</dt><dd class="mono">${esc(vm.schemaVersion||'—')}</dd></div><div><dt>Source session</dt><dd class="mono">${esc(vm.sourceSessionId||'—')}</dd></div><div><dt>Review status</dt><dd class="mono">${esc(vm.status)}</dd></div></dl><ul class="mapping-notes">${vm.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div></details>
      <section class="preflight-actions"><button class="button secondary" data-back-mapping>Back to workbook check</button><div><span class="muted action-note">${vm.canConfirm?`All required field matches are resolved. ${vm.summary.unmappedOptional?`${vm.summary.unmappedOptional} optional field(s) are blank and will remain blank.`:''}`:'Resolve the highlighted required fields before continuing.'}</span><button class="button primary" data-finalize-mapping ${vm.canConfirm?'':'disabled aria-disabled="true"'}>Confirm fields &amp; continue</button></div></section>
      ${active?drawerHtml(active,vm):''}
    </div>`;
    main.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;activeFieldId=null;render();}));
    main.querySelectorAll('[data-open-field]').forEach(b=>b.addEventListener('click',()=>{activeFieldId=b.dataset.openField;render();}));
    main.querySelector('[data-close-drawer]')?.addEventListener('click',()=>{activeFieldId=null;render();});
    main.querySelectorAll('[data-confirm-field]').forEach(b=>b.addEventListener('click',()=>act(()=>controller.confirmFieldMapping(b.dataset.fieldId,true))));
    main.querySelectorAll('[data-apply-sheet]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.applySheet;const select=main.querySelector(`[data-sheet-select="${CSS.escape(id)}"]`);act(()=>controller.updateSheetMapping(id,select.value||null));}));
    main.querySelectorAll('[data-confirm-sheet]').forEach(b=>b.addEventListener('click',()=>act(()=>controller.confirmSheetMapping(b.dataset.confirmSheet,true))));
    main.querySelector('[data-apply-field]')?.addEventListener('click',()=>{const id=main.querySelector('[data-apply-field]').dataset.fieldId;const value=main.querySelector('[data-field-source]').value;if(!value){act(()=>controller.updateFieldMapping(id,'',null));return;}const [sheetEncoded,indexText]=value.split('::');act(()=>controller.updateFieldMapping(id,decodeURIComponent(sheetEncoded),Number(indexText)));});
    main.querySelector('[data-back-mapping]').addEventListener('click',()=>onBack?.());
    main.querySelector('[data-finalize-mapping]').addEventListener('click',async()=>{
      if(!vm.canConfirm||busy)return;
      busy=true;
      try{await confirmMappingReview({controller,onConfirmed});}
      catch(error){render(error.message);}
      finally{busy=false;}
    });
    main.focus();
  }
  render();
  return ()=>{};
}
