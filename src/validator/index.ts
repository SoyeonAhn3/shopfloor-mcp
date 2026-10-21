import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig } from '../generator/config.js';
import { validate } from './rules.js';
export { validate } from './rules.js';
export type { ValidationReport, RuleResult } from './types.js';

function main(): void {
  const {values}=parseArgs({options:{db:{type:'string'},config:{type:'string'},json:{type:'boolean'},help:{type:'boolean'}}});
  if (values.help) { console.log('Usage: npm run validate -- [--db path] [--config path] [--json]'); return; }
  const path=resolve(values.db ?? fileURLToPath(new URL('../../data/production.db',import.meta.url)));
  const snapshot=join(dirname(path),'generator.config.json');
  const config=loadConfig(values.config ?? (existsSync(snapshot) ? snapshot : fileURLToPath(new URL('../../config/generator.config.json',import.meta.url))));
  const db=new Database(path,{readonly:true,fileMustExist:true});
  try {
    const report=validate(db,config);
    const answerPath=join(dirname(path),'answer_key.json');
    if (!existsSync(answerPath)) report.integrityErrors.push('Missing answer_key.json for this generation');
    else {
      const key=JSON.parse(readFileSync(answerPath,'utf8')) as {datasetVersion?:unknown};
      if (key.datasetVersion!==report.datasetVersion) report.integrityErrors.push('DB and answer key belong to different generations');
    }
    report.passed=report.passed && report.integrityErrors.length===0;
    if (values.json) console.log(JSON.stringify(report,null,2));
    else {
      console.log('Dataset: '+report.datasetVersion);
      for (const rule of report.rules) {
        console.log(rule.id+' '+(rule.passed?'PASS':'FAIL')+' '+rule.name+' ('+rule.checked+' checks)');
        for (const example of rule.examples) console.log('  '+example);
      }
      for (const error of report.integrityErrors) console.error(error);
    }
    if (!report.passed) process.exitCode=1;
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; }
}
