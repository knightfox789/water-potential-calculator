/**
 * Controlled .xlsx reader for Engine 1.
 *
 * This parser intentionally reads only the workbook structures required by the HUF
 * controlled template: workbook relationships, worksheets, shared strings and number
 * formats needed to recover dates. The ZIP container is read by locally-vendored JSZip.
 * No workbook bytes leave the browser.
 */

function requireJSZip() {
  const JSZip = globalThis.JSZip;
  if (!JSZip) throw new Error('Local XLSX ZIP parser did not load. Refresh the page and try again.');
  return JSZip;
}

function parseXml(text, label) {
  const normalizedText = String(text ?? '').replace(/^\uFEFF/, '');
  const doc = new DOMParser().parseFromString(normalizedText, 'application/xml');
  const parserError = nodesByLocalName(doc, 'parsererror')[0];
  if (parserError) throw new Error(`Invalid XML in ${label}.`);
  return doc;
}

function nodesByLocalName(root, localName) {
  return [...root.getElementsByTagName('*')].filter(node => node.localName === localName);
}

function firstByLocalName(root, localName) {
  return nodesByLocalName(root, localName)[0] ?? null;
}

function normalizeZipPath(target) {
  const clean = String(target ?? '').replace(/^\//, '');
  if (clean.startsWith('xl/')) return clean;
  return `xl/${clean.replace(/^\.\//, '')}`;
}

function columnIndexFromRef(ref = '') {
  const letters = String(ref).match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? '';
  let value = 0;
  for (const ch of letters) value = value * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function rowNumberFromRef(ref = '') {
  return Number.parseInt(String(ref).match(/\d+/)?.[0] ?? '0', 10) || 0;
}

function textOfSharedString(si) {
  return nodesByLocalName(si, 't').map(node => node.textContent ?? '').join('');
}

async function readSharedStrings(zip) {
  const file = zip.file('xl/sharedStrings.xml');
  if (!file) return [];
  const doc = parseXml(await file.async('text'), 'sharedStrings.xml');
  return nodesByLocalName(doc, 'si').map(textOfSharedString);
}

const BUILTIN_DATE_FORMAT_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58
]);

function looksLikeDateFormat(formatCode = '') {
  const cleaned = String(formatCode)
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase();
  return /(^|[^a-z])[ymdhis]+([^a-z]|$)/.test(cleaned) && /[ymd]/.test(cleaned);
}

async function readDateStyleIndexes(zip) {
  const file = zip.file('xl/styles.xml');
  if (!file) return new Set();
  const doc = parseXml(await file.async('text'), 'styles.xml');
  const custom = new Map();
  for (const fmt of nodesByLocalName(doc, 'numFmt')) {
    custom.set(Number(fmt.getAttribute('numFmtId')), fmt.getAttribute('formatCode') ?? '');
  }
  const cellXfs = nodesByLocalName(doc, 'cellXfs')[0];
  const dateStyles = new Set();
  if (!cellXfs) return dateStyles;
  const xfs = [...cellXfs.childNodes].filter(node => node.nodeType === 1 && node.localName === 'xf');
  xfs.forEach((xf, index) => {
    const numFmtId = Number(xf.getAttribute('numFmtId') ?? 0);
    if (BUILTIN_DATE_FORMAT_IDS.has(numFmtId) || looksLikeDateFormat(custom.get(numFmtId))) dateStyles.add(index);
  });
  return dateStyles;
}

function excelSerialToIso(serial, date1904 = false) {
  if (!Number.isFinite(serial)) return serial;
  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = epoch + wholeDays * 86400000 + Math.round(fraction * 86400000);
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return serial;
  if (Math.abs(fraction) < 1e-10) return date.toISOString().slice(0, 10);
  return date.toISOString();
}

function parseCellValue(cell, sharedStrings, dateStyles, date1904) {
  const type = cell.getAttribute('t') ?? 'n';
  const styleIndex = Number(cell.getAttribute('s') ?? -1);
  const v = firstByLocalName(cell, 'v')?.textContent ?? null;

  if (type === 'inlineStr') return firstByLocalName(cell, 'is')?.textContent ?? '';
  if (type === 's') return sharedStrings[Number(v)] ?? '';
  if (type === 'str') return v ?? '';
  if (type === 'b') return v === '1';
  if (type === 'e') return v ? `#ERROR:${v}` : '#ERROR';
  if (v === null || v === '') return null;

  const number = Number(v);
  if (!Number.isFinite(number)) return v;
  if (dateStyles.has(styleIndex)) return excelSerialToIso(number, date1904);
  return number;
}

function rowIsNonEmpty(values = []) {
  return values.some(value => value !== null && value !== undefined && String(value).trim() !== '');
}

async function parseWorksheet(zip, sheet, sharedStrings, dateStyles, date1904) {
  const file = zip.file(sheet.path);
  if (!file) throw new Error(`Worksheet XML is missing for ${sheet.name}.`);
  const doc = parseXml(await file.async('text'), sheet.path);
  const cellNodes = nodesByLocalName(doc, 'c');
  const rowMap = new Map();
  let maxColumn = 0;
  let formulaCellCount = 0;

  for (const cell of cellNodes) {
    const ref = cell.getAttribute('r') ?? '';
    const rowNumber = rowNumberFromRef(ref);
    if (!rowNumber) continue;
    const columnIndex = columnIndexFromRef(ref);
    maxColumn = Math.max(maxColumn, columnIndex + 1);
    const row = rowMap.get(rowNumber) ?? [];
    row[columnIndex] = parseCellValue(cell, sharedStrings, dateStyles, date1904);
    rowMap.set(rowNumber, row);
    if (firstByLocalName(cell, 'f')) formulaCellCount += 1;
  }

  const headerValues = rowMap.get(1) ?? [];
  const headers = Array.from({ length: maxColumn }, (_, index) => headerValues[index] ?? '');
  const records = [...rowMap.entries()]
    .filter(([rowNumber, values]) => rowNumber > 1 && rowIsNonEmpty(values))
    .sort((a, b) => a[0] - b[0])
    .map(([sourceRowNumber, values]) => ({
      sourceRowNumber,
      values: Array.from({ length: maxColumn }, (_, index) => values[index] ?? null)
    }));

  return {
    name: sheet.name,
    sheetIndex: sheet.sheetIndex,
    path: sheet.path,
    headers,
    records,
    rowCount: records.length,
    columnCount: maxColumn,
    formulaCellCount,
    nonEmptyCellCount: cellNodes.length,
    previewRows: records.slice(0, 3)
  };
}

async function workbookSheetDefinitions(zip) {
  const workbookFile = zip.file('xl/workbook.xml');
  const relsFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relsFile) throw new Error('The file is not a supported .xlsx workbook: workbook metadata is missing.');

  const workbookDoc = parseXml(await workbookFile.async('text'), 'workbook.xml');
  const relsDoc = parseXml(await relsFile.async('text'), 'workbook.xml.rels');
  const rels = new Map(nodesByLocalName(relsDoc, 'Relationship').map(rel => [
    rel.getAttribute('Id'), normalizeZipPath(rel.getAttribute('Target'))
  ]));

  const workbookPr = nodesByLocalName(workbookDoc, 'workbookPr')[0];
  const date1904 = workbookPr?.getAttribute('date1904') === '1' || workbookPr?.getAttribute('date1904') === 'true';

  const sheets = nodesByLocalName(workbookDoc, 'sheet').map((sheet, sheetIndex) => {
    const relationshipId = sheet.getAttribute('r:id')
      ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    return {
      sheetIndex,
      name: sheet.getAttribute('name') ?? `Sheet${sheetIndex + 1}`,
      relationshipId,
      path: rels.get(relationshipId)
    };
  });

  if (sheets.some(sheet => !sheet.path)) throw new Error('One or more worksheet relationships could not be resolved.');
  return { sheets, date1904 };
}

export async function readControlledXlsx(arrayBuffer) {
  const JSZip = requireJSZip();
  let zip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (error) {
    throw new Error(`The workbook could not be opened as a valid .xlsx ZIP package. ${error.message}`);
  }

  const [{ sheets: definitions, date1904 }, sharedStrings, dateStyles] = await Promise.all([
    workbookSheetDefinitions(zip),
    readSharedStrings(zip),
    readDateStyleIndexes(zip)
  ]);

  const sheets = [];
  for (const definition of definitions) {
    sheets.push(await parseWorksheet(zip, definition, sharedStrings, dateStyles, date1904));
  }

  return {
    parser: { name: 'HUF XLSX Lite', zip: 'JSZip local vendor', version: '0.1.0' },
    workbook: {
      sheetCount: sheets.length,
      sheetNames: sheets.map(sheet => sheet.name),
      dateSystem: date1904 ? '1904' : '1900'
    },
    sheets
  };
}
