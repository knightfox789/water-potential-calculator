import { createSourceSessionId } from '../core/id.js';
import { sha256Hex } from '../core/hash.js';
import { readControlledXlsx } from '../services/xlsx-lite.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function summarizeControl(sheet) {
  if (!sheet) return null;
  const first = sheet.records[0];
  if (!first) return null;
  const map = Object.fromEntries(sheet.headers.map((header, index) => [clean(header), first.values[index] ?? null]));
  const keys = [
    'Template Version','Project ID','Project Name','PIA / Implementing Agency',
    'Reporting Start Date','Reporting End Date','Monsoon Regime','Configured Cutoff Date',
    'Default Timing Route','Formula Catalog Version','Capacity Catalog Version',
    'DDW / Runoff Method','Default Area Calculation Method','Prepared By'
  ];
  return Object.fromEntries(keys.map(key => [key, map[key] ?? null]));
}

function makeTemplateHint(parsedSheets, contract) {
  const actual = new Set(parsedSheets.map(sheet => sheet.name));
  const expected = contract.sheets.map(sheet => sheet.name);
  const missing = expected.filter(name => !actual.has(name));
  const extra = [...actual].filter(name => !expected.includes(name));
  return {
    status: missing.length === 0 ? (extra.length ? 'controlled-template-plus-extra-sheets' : 'controlled-template-structure-match') : 'controlled-template-structure-partial',
    expectedSheetCount: expected.length,
    recognizedSheetCount: expected.filter(name => actual.has(name)).length,
    missingSheets: missing,
    extraSheets: extra,
    note: 'This is an intake/template hint only. Design 4 validation is not executed by Engine 1.'
  };
}

function summarizeSheets(parsedSheets, contract) {
  const roleByName = new Map(contract.sheets.map(item => [item.name, item.role]));
  return parsedSheets.map(sheet => ({
    name: sheet.name,
    expectedRoleHint: roleByName.get(sheet.name) ?? 'unknown',
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    formulaCellCount: sheet.formulaCellCount,
    headerCount: sheet.headers.filter(value => clean(value)).length,
    headers: sheet.headers,
    previewRows: sheet.previewRows
  }));
}

export async function runEngine01({ file, config }, { store, bus } = {}) {
  if (!(file instanceof File)) throw new TypeError('Engine 1 requires a browser File object.');
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Engine 1 currently accepts controlled .xlsx workbooks only.');
  if (!config?.sheetContract) throw new Error('Engine 1 configuration is not loaded.');

  store?.setLifecycle('intake_processing');
  store?.patch({ error: null });
  bus?.emit('intake:started', { fileName: file.name, fileSize: file.size });

  try {
    const originalBuffer = await file.arrayBuffer();
    const immutableBytes = new Uint8Array(originalBuffer.slice(0));
    const [sha256, parsed] = await Promise.all([
      sha256Hex(originalBuffer),
      readControlledXlsx(originalBuffer)
    ]);

    const sourceSessionId = createSourceSessionId();
    const immutableWorkbook = deepFreeze(parsed.workbook);
    const immutableSheets = deepFreeze(parsed.sheets);
    const sheetInventory = summarizeSheets(parsed.sheets, config.sheetContract);
    const controlSheet = parsed.sheets.find(sheet => sheet.name === '01_Control') ?? null;
    const templateHint = makeTemplateHint(parsed.sheets, config.sheetContract);
    const summary = {
      engine: 'E01',
      engineContractVersion: 'E01-v0.1.0',
      sourceSessionId,
      sourceWorkbook: {
        fileName: file.name,
        byteLength: file.size,
        lastModified: file.lastModified || null,
        sha256
      },
      parser: parsed.parser,
      workbook: parsed.workbook,
      templateHint,
      controlMetadataHint: summarizeControl(controlSheet),
      sheetInventory,
      intakeNotes: [
        'Workbook bytes and parsed rows remain in browser memory only.',
        'Missing values remain null; Engine 1 does not convert blanks to zero.',
        'Template recognition is informational only; readiness validation belongs to Engine 4.',
        'No KPI routing or calculation is performed in Engine 1.'
      ],
      status: 'intake_complete'
    };

    // Raw source truth is deliberately absent from public state/URLs/export.
    const write = store?.patchFrom ? store.patchFrom.bind(store, 'source') : store?.patch?.bind(store);
    write?.({
      lifecycle: 'intake_complete',
      session: { sourceSessionId, status: 'intake_complete' },
      intake: summary,
      raw: Object.freeze({
        sourceSessionId,
        sourceWorkbookSha256: sha256,
        bytes: immutableBytes,
        workbook: immutableWorkbook,
        sheets: immutableSheets,
        byteLength: immutableBytes.byteLength,
        getBytesCopy: () => immutableBytes.slice().buffer
      })
    });
    bus?.emit('intake:completed', { summary });
    return { engine: 'E01', status: 'complete', summary };
  } catch (error) {
    store?.patch({ lifecycle: 'blocked_error', error: { engine: 'E01', message: error.message } });
    bus?.emit('intake:failed', { message: error.message });
    throw error;
  }
}
