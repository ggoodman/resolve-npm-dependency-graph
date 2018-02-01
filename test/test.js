'use strict';

const Lab = require('lab');

const Resolver = require('../');

const lab = (exports.lab = Lab.script());

lab.test('works', { timeout: 200000 }, async () => {
    const client = new Resolver.Client();
    const pkg = await client.load('wt-cli');
    const root = client.buildOptimalTree([pkg]);

    console.log(JSON.stringify(root, null, 2));

    return pkg;
});

if (require.main === module) {
    Lab.report([lab], { output: process.stdout, progress: 2 });
}
