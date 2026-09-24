import { readdir, readFile, writeFile } from 'node:fs/promises';
const files = await readdir('fixtures/kdbx');
const fixtureData: Record<string, string> = {};
for (const file of files.filter((file) => /\.(kdbx|key|keyx)$/.test(file))) fixtureData[file] = (await readFile(`fixtures/kdbx/${file}`)).toString('base64');
await writeFile('fixtures/native-poc.json', JSON.stringify(fixtureData));
