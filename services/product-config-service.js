function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

export const PRODUCT_CONFIG_URL=new URL('../config/product-config.json',import.meta.url);

export async function loadProductConfig({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('Product configuration requires browser fetch support.');
  const response=await fetchImpl(PRODUCT_CONFIG_URL,{cache:'no-store'});
  if(!response?.ok)throw new Error('Could not load governed product configuration.');
  return deepFreeze(await response.json());
}

export function resolveSupportedTemplateVersion(productConfig,templateManifest){
  const designVersion=productConfig?.designVersions?.inputSchema||null;
  const controlledVersion=productConfig?.controlledTemplate?.version||null;
  const manifestVersion=templateManifest?.templateVersion||null;
  const versions=[designVersion,controlledVersion,manifestVersion].filter(Boolean);
  if(versions.length!==3)throw new Error('Governed template-version configuration is incomplete.');
  if(new Set(versions).size!==1){
    throw new Error(`Governed template-version configuration disagrees: inputSchema=${designVersion}, controlledTemplate=${controlledVersion}, templateManifest=${manifestVersion}.`);
  }
  return designVersion;
}
