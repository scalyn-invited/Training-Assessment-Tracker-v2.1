import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
it('documents every registered API and setup operation without replacing shared-path methods',async()=>{
 const spec=JSON.parse(await readFile('docs/openapi.json','utf8'));
 for(const file of ['apps/api/src/main.ts','apps/api/src/setup.ts']){
  const source=await readFile(file,'utf8');
  const controllers=[...source.matchAll(/@Controller\((?:'([^']*)')?\)/g)];
  expect(controllers.length).toBeGreaterThan(0);
  for(let index=0;index<controllers.length;index++){
   const controller=controllers[index],body=source.slice(controller.index!+controller[0].length,controllers[index+1]?.index??source.length);
   for(const route of body.matchAll(/@(Get|Post|Put|Delete|Patch)\((?:'([^']*)')?\)/g)){
    const path=('/'+[controller[1],route[2]].filter(Boolean).join('/')).replace(/:([A-Za-z0-9_]+)/g,'{$1}');
    expect(spec.paths[path]?.[route[1].toLowerCase()],`${file}: ${route[1]} ${path}`).toBeDefined();
   }
  }
 }
});
