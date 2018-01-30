'use strict';

const Lab = require('lab');

const Client = require('../');

const lab = (exports.lab = Lab.script());

lab.test('works', { timeout: 200000 }, async () => {
    const tree = await Client.resolve('wt-cli');

    console.dir(tree.toJSON(), { showHidden: false, depth: Infinity, colors: true });

    return tree;
});

if (require.main === module) {
    Lab.report([lab], { output: process.stdout, progress: 2 });
}
