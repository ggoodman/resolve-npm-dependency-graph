//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

const UnpkgLoader = require('../dist/cdnLoader');
const Resolver = require('../');

const lab = (exports.lab = Lab.script());

lab.describe('the cdn loader', () => {
    const npmLoader = UnpkgLoader.createLoader();
    const client = new Resolver.Client({ packageMetadataLoader: npmLoader });

    lab.test('works for a simple package', async () => {
        const pkg = await client.load('webtask-test-module-1@1');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal('webtask-test-module-1');
        expect(pkg.version).to.equal('1.0.0');
        expect(pkg.children.size).to.equal(0);
    });

    lab.test('works for hapi', { timeout: 20000 }, async () => {
        const pkg = await client.load('hapi@17');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal('hapi');
        expect(pkg.children.size).to.be.greaterThan(0);
    });

    lab.describe('using unpkg', () => {
        const npmLoader = UnpkgLoader.createLoader({ baseUrl: 'https://unpkg.com' });
        const client = new Resolver.Client({ packageMetadataLoader: npmLoader });

        lab.test('works for a simple package', async () => {
            const pkg = await client.load('webtask-test-module-1@1');

            expect(pkg).to.be.an.instanceOf(Resolver.Package);
            expect(pkg.name).to.equal('webtask-test-module-1');
            expect(pkg.version).to.equal('1.0.0');
            expect(pkg.children.size).to.equal(0);
        });

        lab.test('works for hapi', { timeout: 20000 }, async () => {
            const pkg = await client.load('hapi@17');

            expect(pkg).to.be.an.instanceOf(Resolver.Package);
            expect(pkg.name).to.equal('hapi');
            expect(pkg.children.size).to.be.greaterThan(0);
        });
    });
});

if (require.main === module) {
    Lab.report([lab], { output: process.stdout, progress: 2 });
}
