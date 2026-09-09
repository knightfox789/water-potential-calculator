export const CONTROLLED_TEMPLATE=Object.freeze({
  version:'HUF-SS-INPUT-v1.1',
  filename:'HUF-SS-INPUT-v1.1.xlsx',
  url:new URL('../templates/HUF-SS-INPUT-v1.1.xlsx',import.meta.url),
  manifestUrl:new URL('../templates/TEMPLATE_MANIFEST.json',import.meta.url)
});

export async function loadTemplateManifest({fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('Template manifest requires browser fetch support.');
  const response=await fetchImpl(CONTROLLED_TEMPLATE.manifestUrl);
  if(!response?.ok)throw new Error('Could not load controlled template manifest.');
  return Object.freeze(await response.json());
}
