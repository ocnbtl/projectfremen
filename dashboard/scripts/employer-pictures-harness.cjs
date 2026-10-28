const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { currentEmployerPictures } = require('../lib/modules/people/directory-presentation.ts');
const org = (id, title, extra = {}) => ({ id, title, className: 'org', profile: { photoUrl: '/api/people/photos/' + id }, ...extra });
const person = occupations => ({ className: 'person', profile: { occupations } });
const job = (organizationId, status = 'current', employer = 'Cedar') => ({ organizationId, status, employer, title: 'Designer' });
const cedar = org('cedar', 'Cedar'), former = org('former', 'Former'), archived = org('gone', 'Gone', { archivedAt: '2026-01-01' });
assert.deepEqual(currentEmployerPictures(person([job('cedar'), job('cedar'), job('former', 'past'), job('gone')]), [cedar, former, archived]), [cedar]);
assert.deepEqual(currentEmployerPictures(person([job(undefined)]), [cedar]), [cedar]);
assert.deepEqual(currentEmployerPictures(person([job(undefined)]), [cedar, org('duplicate', 'Cedar')]), []);
assert.deepEqual(currentEmployerPictures(person([job('missing')]), [cedar]), []); // Never replace a broken explicit link with a guess.
assert.deepEqual(currentEmployerPictures(person([job('cedar')]), [{...cedar, profile: {}}]), []);
assert.deepEqual(currentEmployerPictures({ className: 'person', profile: { primaryOccupation: 'Designer', primaryEmployer: ' cedar ' } }, [cedar]), [cedar]);
assert.deepEqual(currentEmployerPictures({ className: 'org', profile: { occupations: [job('cedar')] } }, [cedar]), []);
console.log('Employer pictures: current links, legacy names, duplicates, missing pictures and archived records passed.');
