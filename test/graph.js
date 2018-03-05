//@ts-check

'use strict';

const { expect } = require('code');
const Lab = require('lab');

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

lab.describe('loading a dependency graph', () => {
    lab.test('works for a single mock package', async () => {
        const mockPackages = {
            parent: {
                name: 'parent',
                version: '1.0.0',
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const pkg = await client.load('parent');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal(mockPackages.parent.name);
        expect(pkg.version).to.equal(mockPackages.parent.version);
        expect(pkg.children.size).to.equal(0);
    });

    lab.test('will return the same Package instance for two specs that resolve to the same version', async () => {
        const mockPackages = {
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
            },
            'child@1.x': {
                name: 'child',
                version: '1.0.0',
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const a = await client.load('child@1.0.0');
        const b = await client.load('child@1.x');

        expect(a).to.equal(b);
    });

    lab.test('works for a simple, parent-child relationship', async () => {
        const mockPackages = {
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
            },
            parent: {
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
        const pkg = await client.load('parent');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal(mockPackages.parent.name);
        expect(pkg.version).to.equal(mockPackages.parent.version);
        expect(pkg.children.size).to.equal(1);

        const child = pkg.children.get('child');

        expect(child).to.be.an.instanceOf(Resolver.Package);
        expect(child.name).to.equal(mockPackages['child@1.0.0'].name);
        expect(child.version).to.equal(mockPackages['child@1.0.0'].version);
        expect(child.children.size).to.equal(0);
    });

    lab.test('works when the parent specifies a range', async () => {
        const mockPackages = {
            'child@1.x': {
                name: 'child',
                version: '1.0.0',
            },
            parent: {
                name: 'parent',
                version: '1.0.0',
                dependencies: {
                    child: '1.x',
                },
            },
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const pkg = await client.load('parent');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal(mockPackages.parent.name);
        expect(pkg.version).to.equal(mockPackages.parent.version);
        expect(pkg.children.size).to.equal(1);

        const child = pkg.children.get('child');

        expect(child).to.be.an.instanceOf(Resolver.Package);
        expect(child.name).to.equal(mockPackages['child@1.x'].name);
        expect(child.version).to.equal(mockPackages['child@1.x'].version);
        expect(child.children.size).to.equal(0);
    });

    lab.test('fails when the module is not available', async () => {
        const mockPackages = {};
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });

        let pkg;

        try {
            pkg = await client.load('parent');
        } catch (error) {
            expect(error).to.be.an.error(/Not found/);
        }

        expect(pkg).to.not.exist();
    });

    lab.test('works when there is a circular dependency', async () => {
        const mockPackages = {
            'parent@1.0.0': {
                name: 'parent',
                version: '1.0.0',
                dependencies: {
                    child: '1.0.0',
                },
            },
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
                dependencies: {
                    parent: '1.0.0',
                },
            }
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const pkg = await client.load('parent@1.0.0');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal(mockPackages['parent@1.0.0'].name);
        expect(pkg.version).to.equal(mockPackages['parent@1.0.0'].version);
        expect(pkg.children.size).to.equal(1);

        const child = pkg.children.get('child');

        expect(child).to.be.an.instanceOf(Resolver.Package);
        expect(child.name).to.equal(mockPackages['child@1.0.0'].name);
        expect(child.version).to.equal(mockPackages['child@1.0.0'].version);
        expect(child.children.size).to.equal(1);

        const parent = child.children.get('parent');

        expect(parent).to.equal(pkg);
    });

    lab.test('works when children require different versions of an indirect dependent', async () => {
        const mockPackages = {
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
            },
            'child@1.0.0': {
                name: 'child',
                version: '1.0.0',
                dependencies: {
                    parent: '2.0.0',
                },
            }
        };
        const client = new Resolver.Client({
            packageMetadataLoader(spec) {
                if (mockPackages[spec]) return mockPackages[spec];

                throw new Error('Not found');
            },
        });
        const pkg = await client.load('parent@1.0.0');

        expect(pkg).to.be.an.instanceOf(Resolver.Package);
        expect(pkg.name).to.equal(mockPackages['parent@1.0.0'].name);
        expect(pkg.version).to.equal(mockPackages['parent@1.0.0'].version);
        expect(pkg.children.size).to.equal(1);

        const child = pkg.children.get('child');

        expect(child).to.be.an.instanceOf(Resolver.Package);
        expect(child.name).to.equal(mockPackages['child@1.0.0'].name);
        expect(child.version).to.equal(mockPackages['child@1.0.0'].version);
        expect(child.children.size).to.equal(1);

        const grandChild = child.children.get('parent');

        expect(grandChild).to.be.an.instanceOf(Resolver.Package);
        expect(grandChild.name).to.equal(mockPackages['parent@2.0.0'].name);
        expect(grandChild.version).to.equal(mockPackages['parent@2.0.0'].version);
        expect(grandChild.children.size).to.equal(0);
    });
});
