import Database from 'better-sqlite3';
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildAnswerKey } from '../answer-key/build.js';
import { removeOwnedTemp } from '../shared/files.js';
import { validate } from '../validator/rules.js';
import { buildDataset } from './build.js';
import { loadConfig, parseConfig, type GeneratorConfig } from './config.js';
import { writeDataset } from './writer.js';

export function generate(input: GeneratorConfig, dbPath: string) {
  const config=parseConfig(input), destination=resolve(dbPath), directory=dirname(destination);
  const names=[basename(destination),'answer_key.json','validation.json','generator.config.json'];
  if (new Set(names).size!==names.length) throw new Error('Database filename conflicts with an artifact filename');
  for (const name of names) if (existsSync(join(directory,name))) {
    throw new Error('Existing generation is preserved: '+join(directory,name)+'. Choose a new --out-dir.');
  }
  const staging=mkdtempSync(join(tmpdir(),'shopfloor-generate-'));
  const published: string[]=[];
  try {
    const data=buildDataset(config);
    const database=new Database(join(staging,basename(destination)));
    let report;
    try {
      writeDataset(database,data.tables);
      report=validate(database,config);
      if (!report.passed) throw new Error('Generated data failed validation: '+JSON.stringify(report.rules.filter(r => !r.passed)));
    } finally { database.close(); }
    const answerKey=buildAnswerKey(config,data);
    const serialize=(value: unknown) => JSON.stringify(value,(_key,item: unknown) => {
      if (typeof item==='number' && !Number.isFinite(item)) throw new Error('Non-finite number in generated artifact');
      return item;
    },2)+'\n';
    writeFileSync(join(staging,'answer_key.json'),serialize(answerKey));
    writeFileSync(join(staging,'validation.json'),serialize(report));
    writeFileSync(join(staging,'generator.config.json'),serialize(config));
    mkdirSync(directory,{recursive:true});
    for (const name of names) {
      const target=join(directory,name);
      copyFileSync(join(staging,name),target,constants.COPYFILE_EXCL);
      published.push(target);
    }
    return {datasetVersion:answerKey.datasetVersion,dbPath:destination,answerKeyPath:join(directory,'answer_key.json'),report};
  } catch (error) {
    for (const path of published) unlinkSync(path); // only files successfully created by this invocation
    throw error;
  } finally { removeOwnedTemp(staging); }
}

function main(): void {
  const {values}=parseArgs({options:{config:{type:'string'},'out-dir':{type:'string'},help:{type:'boolean'}}});
  if (values.help) {
    console.log('Usage: npm run generate -- [--config path] [--out-dir directory]\nExisting generation files are never overwritten.');
    return;
  }
  const configPath=values.config ?? fileURLToPath(new URL('../../config/generator.config.json',import.meta.url));
  const output=values['out-dir'] ?? fileURLToPath(new URL('../../data',import.meta.url));
  const result=generate(loadConfig(configPath),join(output,'production.db'));
  console.log('Dataset: '+result.datasetVersion);
  console.log('Database: '+result.dbPath);
  console.log('Answer key: '+result.answerKeyPath);
  console.log('Rows: '+Object.values(result.report.rowCounts).reduce((a,b) => a+b,0));
  for (const rule of result.report.rules) console.log(rule.id+' '+(rule.passed?'PASS':'FAIL')+' '+rule.name);
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; }
}
