import fs from 'node:fs/promises';import vm from 'node:vm';import {DOMParser} from '@xmldom/xmldom';
import {createProtectedPipelineAdapter} from '../../pipeline/pipeline-adapter.js';
globalThis.DOMParser=DOMParser;
vm.runInThisContext(await fs.readFile(new URL('../../vendor/jszip/jszip.min.js',import.meta.url),'utf8'));
export async function createFixtureAdapter(){
 const names={sheetContract:'required-sheets-v1.1',inputSchema:'input-schema-v1.1',engineContracts:'engine-contracts-v1',mappingAliases:'mapping-aliases-v1.1',canonicalizationPolicy:'canonicalization-policy-v1.1',validationRulebook:'validation-rulebook-v1.0',routeRegistry:'route-registry-v1.1',routingPolicy:'routing-policy-v1.0',formulaCatalog:'formula-catalog-v1.1',assurancePolicy:'assurance-policy-v1.0',aggregationPolicy:'aggregation-policy-v1.0',auditPolicy:'audit-policy-v1.0'};
 const config={app:JSON.parse(await fs.readFile(new URL('../../config/product-config.json',import.meta.url),'utf8'))};
 for(const [k,n] of Object.entries(names))config[k]=JSON.parse(await fs.readFile(new URL(`../../protected-core/config/${n}.json`,import.meta.url),'utf8'));
 return createProtectedPipelineAdapter(config);
}
export async function runFixture(name='nonleap/GOLDEN_E2E_NONLEAP_FY2024-25.xlsx'){
 const a=await createFixtureAdapter(),bytes=await fs.readFile(new URL('../../samples/'+name,import.meta.url));
 await a.runIntake(new File([bytes],name.split('/').pop()));await a.buildMapping();await a.confirmAllSuggested();await a.confirmMapping();for(const stage of ['E03','E04','E05','E06','E07','E08','E09'])await a.runStage(stage);return a;
}
