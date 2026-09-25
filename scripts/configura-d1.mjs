import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const nome = 'cover-lab-ai-db';
console.log(`Creo il database D1 ${nome} in Europa occidentale...`);
const uscita = execFileSync('npx', ['wrangler', 'd1', 'create', nome, '--location', 'weur'], { encoding: 'utf8' });
console.log(uscita);

const corrispondenza = uscita.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i) || uscita.match(/database_id[^0-9a-f]+([0-9a-f-]{36})/i);
if (!corrispondenza) {
  throw new Error('Non riesco a leggere automaticamente l’identificativo del database dalla risposta di Wrangler.');
}

const percorso = 'wrangler.jsonc';
let testo = readFileSync(percorso, 'utf8');
const blocco = `,\n  "d1_databases": [\n    {\n      "binding": "DB",\n      "database_name": "${nome}",\n      "database_id": "${corrispondenza[1]}"\n    }\n  ]\n`;
testo = testo.replace(/\n}\s*$/, `${blocco}}\n`);
writeFileSync(percorso, testo);
console.log('Configurazione D1 inserita in wrangler.jsonc.');
console.log('Ora eseguire: npm run db:migra');
