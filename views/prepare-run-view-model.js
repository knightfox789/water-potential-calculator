export function createPreparationViewModel(summary){
 if(summary?.engine!=='E03')throw new Error('A completed preparation summary is required.');
 const s=summary.stats;
 return Object.freeze({cards:[['Records prepared',s.recordCount],['Unit conversions',s.convertedCount],['Blanks preserved',s.blankCount],['Zeros preserved',s.zeroCount],['Type issues',s.typeErrorCount],['Unit issues',s.unitErrorCount]],tables:summary.tableInventory,diagnostics:summary.diagnostics,summary});
}
