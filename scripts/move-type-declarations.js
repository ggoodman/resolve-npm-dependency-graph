const Sander = require('sander');
const Glob = require('glob');

for (const file of Glob.sync('src/**/*.js')) {
    Sander.unlinkSync(file);
}

Sander.rimrafSync('types');
for (const file of Glob.sync('src/**/!(cross-fetch).d.ts')) {
    Sander.renameSync(file).to(file.replace(/^src/, 'types'));
}
