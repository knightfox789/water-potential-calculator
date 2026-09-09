export function createCorrectionOverlay(){
 const items=[];
 return Object.freeze({
   add(correction){const entry=Object.freeze({...correction,id:correction.id||`COR-${items.length+1}`});items.push(entry);return entry;},
   list:()=>Object.freeze([...items]),
   clear(){items.length=0;}
 });
}
