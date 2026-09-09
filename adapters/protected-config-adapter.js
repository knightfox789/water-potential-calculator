import { sha256Hex } from './crypto-adapter.js';

function isFreezable(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return false;
  if(value instanceof ArrayBuffer||ArrayBuffer.isView(value)||value instanceof Blob)return false;
  return Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype;
}

export function deepFreeze(value){
  if(!isFreezable(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

async function fetchBytes(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error(`Could not load configuration: ${url}`);
  return response.arrayBuffer();
}

async function loadJson(url){
  const bytes=await fetchBytes(url);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function verifyProtectedHash(path,actualSha256,manifest){
  const entry=manifest?.protectedFiles?.find(item=>item.path===path);
  if(!entry)throw new Error(`Protected manifest does not contain ${path}.`);
  if(entry.sha256!==actualSha256)throw new Error(`Protected runtime integrity mismatch for ${path}.`);
  return true;
}

async function loadControlledJson(url,path,manifest){
  const bytes=await fetchBytes(url);
  const actual=await sha256Hex(bytes);
  verifyProtectedHash(path,actual,manifest);
  return deepFreeze(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function loadProtectedConfig(){
  const base=import.meta.url;
  const [productRaw,manifestRaw]=await Promise.all([
    loadJson(new URL('../config/product-config.json',base)),
    loadJson(new URL('../PROTECTED_CORE_MANIFEST.json',base))
  ]);
  const manifest=deepFreeze(manifestRaw);
  const product=deepFreeze(productRaw);
  const p=name=>{
    const path=`protected-core/config/${name}`;
    return loadControlledJson(new URL(`../${path}`,base),path,manifest);
  };
  const [sheetContract,inputSchema,engineContracts,mappingAliases,canonicalizationPolicy,validationRulebook,routeRegistry,routingPolicy,formulaCatalog,assurancePolicy,aggregationPolicy,auditPolicy]=await Promise.all([
    p('required-sheets-v1.1.json'),p('input-schema-v1.1.json'),p('engine-contracts-v1.json'),p('mapping-aliases-v1.1.json'),p('canonicalization-policy-v1.1.json'),p('validation-rulebook-v1.0.json'),p('route-registry-v1.1.json'),p('routing-policy-v1.0.json'),p('formula-catalog-v1.1.json'),p('assurance-policy-v1.0.json'),p('aggregation-policy-v1.0.json'),p('audit-policy-v1.0.json')
  ]);
  return deepFreeze({app:product,protectedManifest:manifest,sheetContract,inputSchema,engineContracts,mappingAliases,canonicalizationPolicy,validationRulebook,routeRegistry,routingPolicy,formulaCatalog,assurancePolicy,aggregationPolicy,auditPolicy});
}
