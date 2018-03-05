//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

const CdnLoader = require('../dist/cdnLoader');
const Optimizer = require('../dist/optimizer');
const Resolver = require('../');

const lab = (exports.lab = Lab.script({
    cli: {
        globals: [
            '__extends',
            '__assign',
            '__rest',
            '__decorate',
            '__param',
            '__metadata',
            '__awaiter',
            '__generator',
            '__exportStar',
            '__values',
            '__read',
            '__spread',
            '__await',
            '__asyncGenerator',
            '__asyncDelegator',
            '__asyncValues',
            '__makeTemplateObject',
            '__importStar',
            '__importDefault',
        ],
    },
}));

lab.describe('graph flattening (optimization)', () => {
    lab.test('will lift child modules to the root', async () => {
        const mockPackages = {
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
            },
            'parent@1.0.0': {
                name: 'parent',
                version: '1.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const parent = await client.load('parent@1.0.0');
        const root = Optimizer.flatten([parent]);

        expect(root.parent).to.be.null();
        expect(root.children.size).to.equal(2);

        const parentNode = root.children.get('parent');
        expect(parentNode.children.size).to.equal(0);
        expect(parentNode.pkg).to.equal(parent);

        const childNode = root.children.get('child');
        expect(childNode.children.size).to.equal(0);
        expect(childNode.pkg).to.equal(parent.children.get('child'));
    });

    lab.test('will not lift conflicting grand-children', async () => {
        const mockPackages = {
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
                dependencies: {
                    parent: '2.0.0',
                },
            },
            'parent@1.0.0': {
                name: 'parent',
                version: '1.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
            'parent@2.0.0': {
                name: 'parent',
                version: '2.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const parent = await client.load('parent@1.0.0');
        const root = Optimizer.flatten([parent]);

        expect(root.parent).to.be.null();
        expect(root.children.size).to.equal(2);

        const parentNode = root.children.get('parent');
        expect(parentNode.children.size).to.equal(0);
        expect(parentNode.pkg).to.equal(parent);

        const childNode = root.children.get('child');
        expect(childNode.children.size).to.equal(1);
        expect(childNode.pkg).to.equal(parent.children.get('child'));

        const grandChildNode = childNode.children.get('parent');
        expect(grandChildNode.children.size).to.equal(0);
        expect(grandChildNode.pkg.version).to.equal('2.0.0');
    });

    lab.test('supports adding the same package twice', async () => {
        const mockPackages = {
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
                dependencies: {
                    parent: '2.0.0',
                },
            },
            'parent@1.0.0': {
                name: 'parent',
                version: '1.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
            'parent@2.0.0': {
                name: 'parent',
                version: '2.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const parent = await client.load('parent@1.0.0');
        const root = Optimizer.flatten([parent, parent]);

        expect(root.parent).to.be.null();
        expect(root.children.size).to.equal(2);

        const parentNode = root.children.get('parent');
        expect(parentNode.children.size).to.equal(0);
        expect(parentNode.pkg).to.equal(parent);

        const childNode = root.children.get('child');
        expect(childNode.children.size).to.equal(1);
        expect(childNode.pkg).to.equal(parent.children.get('child'));

        const grandChildNode = childNode.children.get('parent');
        expect(grandChildNode.children.size).to.equal(0);
        expect(grandChildNode.pkg.version).to.equal('2.0.0');
    });

    lab.describe('works with packages loaded from the npm registry', () => {
        const npmLoader = CdnLoader.createLoader();
        const client = new Resolver.Client({ packageMetadataLoader: npmLoader });

        lab.test('will flatten npm@5 beside hapi@17', { timeout: 20000 }, async () => {
            const [npm, hapi] = await Promise.all([client.load('npm@5'), client.load('hapi@17')]);
            const root = Optimizer.flatten([npm, hapi]);

            expect(root.children.size).to.be.greaterThan(2);
        });
    });
});
