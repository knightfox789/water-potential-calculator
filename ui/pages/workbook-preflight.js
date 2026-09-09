import {downloadBlob} from '../../services/export-service.js';
import { createPreflightViewModel } from '../../views/preflight-view-model.js';

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function icon(level){return level==='error'?'!':level==='warning'?'△':'✓';}
function issueList(group){
  if(!group.items.length)return `<p class="muted compact-empty">No ${group.label.toLowerCase()}.</p>`;
  return `<ul class="preflight-issues">${group.items.map(item=>`<li class="preflight-issue ${group.tone}"><span class="issue-icon" aria-hidden="true">${icon(item.level)}</span><div><strong>${esc(item.message)}</strong><span class="issue-code">${esc(item.code)}</span></div></li>`).join('')}</ul>`;
}
function friendlyTemplate(value){const text=String(value||'');const match=text.match(/v(\d+(?:\.\d+)*)/i);return match?`Input Template v${match[1]}`:(text?'Input Template':'Not detected');}
function sheetStatus(row){if(row.missing)return '<span class="status-pill error">Missing</span>';if(!row.controlled)return '<span class="status-pill warning">Unexpected</span>';return '<span class="status-pill ready">Recognized</span>';}

export function mountWorkbookPreflight({main,controller,onBack=null,onContinue=null}={}){
  if(!main||!controller)throw new Error('Workbook Preflight requires main and controller.');
  const source=controller.getState().source||{};
  if(!source.preflight)throw new Error('Run workbook intake before opening preflight.');
  const vm=createPreflightViewModel(source.preflight);
  main.innerHTML=`
  <div class="preflight-page" data-preflight-root>
    <section class="page-heading">
      <div><span class="eyebrow">Review workbook</span><h1>Review workbook structure</h1><p class="lead">Check the sheets, dates and template version before reviewing your fields. Record-level validation follows data preparation.</p></div>
      <span class="status-pill ${vm.canContinueToMapping?'ready':'error'}">${vm.canContinueToMapping?'Ready to continue':'Fix before continuing'}</span>
    </section>

    <section class="summary-card-grid" aria-label="Workbook preflight summary">
      ${vm.cards.map(card=>`<article class="summary-card"><span>${esc(card.label)}</span><strong>${esc(card.value)}</strong><i class="summary-tone ${card.tone}" aria-hidden="true"></i></article>`).join('')}
    </section>

    <section class="card preflight-source-card">
      <div class="card-heading"><div><span class="eyebrow">Source workbook</span><h2>${esc(source.name||vm.source.fileName||'Workbook')}</h2></div>${source.synthetic?'<span class="status-pill warning">Synthetic validation data</span>':''}</div>
      <dl class="compact-meta preflight-meta"><div><dt>Template</dt><dd>${esc(friendlyTemplate(vm.template.detectedVersion))}</dd></div><div><dt>Reporting period</dt><dd>${esc(vm.reportingPeriod.label)}</dd></div><div><dt>Workbook check</dt><dd>${vm.source.shortSha256?'Complete':'Not available'}</dd></div></dl>
    </section>

    <section class="card">
      <div class="card-heading"><div><span class="eyebrow">Workbook structure</span><h2>Workbook sheet inventory</h2></div><span class="muted">${vm.sheetRows.length} listed</span></div>
      <div class="table-scroll"><table class="data-table"><caption class="sr-only">Workbook sheet inventory</caption><thead><tr><th>Sheet</th><th>Status</th><th class="numeric">Rows</th><th class="numeric">Columns</th><th class="numeric">Formulas</th></tr></thead><tbody>
      ${vm.sheetRows.map(row=>`<tr><td><strong>${esc(row.name)}</strong>${row.role?`<span class="cell-note">${esc(row.role)}</span>`:''}</td><td>${sheetStatus(row)}</td><td class="numeric">${row.rowCount}</td><td class="numeric">${row.columnCount}</td><td class="numeric">${row.formulaCellCount}</td></tr>`).join('')}
      </tbody></table></div>
    </section>

    <section class="preflight-checks" aria-label="Preflight checks">
      ${vm.groups.map(group=>`<article class="card issue-group"><div class="card-heading"><h2>${group.label}</h2><span class="status-pill ${group.tone}">${group.items.length}</span></div>${issueList(group)}</article>`).join('')}
    </section>

    <details class="card advanced-details"><summary>Technical details</summary><div class="advanced-grid"><dl class="compact-meta"><div><dt>Full SHA-256</dt><dd class="mono">${esc(vm.source.sha256||'Not available')}</dd></div><div><dt>E01 contract</dt><dd class="mono">${esc(vm.advanced.engineContractVersion||'Not available')}</dd></div><div><dt>Intake hint</dt><dd>${esc(vm.template.intakeHintStatus||'Not available')}</dd></div></dl><p class="muted">Raw workbook rows and preview values are intentionally not displayed here. Advanced detail remains intake metadata only.</p></div><button class="button secondary" data-preflight-export>Download preflight summary</button></details>

    <section class="preflight-actions"><button class="button secondary" data-back>Back to Upload</button><div><span class="muted action-note">${vm.canContinueToMapping?'Preflight is complete. Next, confirm how workbook columns match the calculator fields.':'Fix the workbook errors before continuing.'}</span><button class="button primary" data-continue ${vm.canContinueToMapping?'':'disabled aria-disabled="true"'}>Review fields</button></div></section>
  </div>`;
  main.querySelector('[data-preflight-export]').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({schema:'HUF-PREFLIGHT-SUMMARY-v1',source:vm.source,template:vm.template,reportingPeriod:vm.reportingPeriod,sheets:vm.sheetRows,checks:vm.groups,status:vm.overallStatus,synthetic:Boolean(source.synthetic)},null,2)],{type:'application/json'}),'Water_Potential_Preflight_Summary.json'));
  main.querySelector('[data-back]').addEventListener('click',()=>onBack?.());
  main.querySelector('[data-continue]').addEventListener('click',()=>{if(vm.canContinueToMapping)onContinue?.();});
}
