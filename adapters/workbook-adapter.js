export function validateWorkbookFile(file){if(!file)throw new Error('No workbook selected.');if(!/\.xlsx$/i.test(file.name||''))throw new Error('Only .xlsx workbooks are supported.');return true;}
export async function workbookArrayBuffer(file){validateWorkbookFile(file);return file.arrayBuffer();}
