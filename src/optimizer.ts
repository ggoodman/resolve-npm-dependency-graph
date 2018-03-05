import { Package, PackageAsJson } from './package';

export class DependencyTreeNode {
    children: Map<String, DependencyTreeNode>;
    parent: DependencyTreeNode | null;
    pkg: Package;

    constructor(pkg: Package) {
        this.children = new Map();
        this.parent = null;
        this.pkg = pkg;
    }

    addChild(child: DependencyTreeNode): DependencyTreeNode {
        this.children.set(child.pkg.name, child);

        return this;
    }

    toJSON(): PackageAsJson {
        const dependencies: {
            [key: string]: PackageAsJson;
        } = {};

        for (const childName of Array.from(this.children.keys()).sort()) {
            const child = this.children.get(childName);
            dependencies[child.pkg.name] = child.toJSON();
        }

        return {
            name: this.pkg.name,
            version: this.pkg.version,
            dependencies,
        };
    }
}

export function flatten(pkgs: Package[]): DependencyTreeNode {
    const pkgNodes: Map<Package, DependencyTreeNode> = new Map();
    const rootPkg = new Package({
        name: '!root',
        version: '0.0.0',
        dependencies: {},
        dist: {
            integrity: '',
            shasum: '',
            tarball: '',
        },
    });
    const edges = calculatePackageDuplication(pkgs);
    const root = new DependencyTreeNode(rootPkg);
    const queue: Array<{
        pkg: Package;
        parent?: Package;
        score: number;
    }> = [];
    const seen: Set<Package> = new Set();
    const addToQueue = (pkg: Package, parent?: Package) => {
        if (seen.has(pkg)) return;
        seen.add(pkg);

        const score = edges.get(pkg) || 0;
        const entry = { parent, pkg, score };

        for (let i = 0; i < queue.length; i++) {
            if (
                queue[i].score < score ||
                (queue[i].score === score && queue[i].pkg.id < pkg.id)
            ) {
                queue.splice(i, 0, entry);
                return;
            }
        }

        queue.push(entry);
    };

    pkgs.forEach(pkg => addToQueue(pkg, rootPkg));

    pkgNodes.set(rootPkg, root);

    while (queue.length) {
        const { parent, pkg } = queue.shift();

        // The package has already been added
        if (pkgNodes.has(pkg)) continue;

        Array.from(pkg.children.keys()).forEach(childName => {
            const child = pkg.children.get(childName);

            addToQueue(child, pkg);
        });

        const pkgNode = new DependencyTreeNode(pkg);

        let conflict = false;
        let lastParentNode = root;
        let parentNode = pkgNodes.get(parent);

        pkgNodes.set(pkg, pkgNode);

        pkgNode.parent = parentNode;

        while (parentNode) {
            if (
                (parentNode.pkg.name === pkg.name && parentNode.pkg !== pkg) ||
                (parentNode.pkg.children.has(pkg.name) &&
                    parentNode.pkg.children.get(pkg.name) !== pkg)
            ) {
                break;
            }

            lastParentNode = parentNode;
            parentNode = parentNode.parent;
        }

        lastParentNode.addChild(pkgNode);
    }

    return root;
}

function calculatePackageDependencyEdges(
    pkgs: Package[]
): Map<Package, Set<Package>> {
    const dependencies: Map<Package, Set<Package>> = new Map();
    const queue: Package[] = Array.from(pkgs);
    const seen: Set<Package> = new Set();

    // Calculate the edges in the dependency graph
    while (queue.length) {
        const pkg = queue.shift();

        seen.add(pkg);

        if (!dependencies.has(pkg)) {
            dependencies.set(pkg, new Set());
        }

        for (const child of pkg.children.values()) {
            if (!dependencies.has(child)) {
                dependencies.set(child, new Set());
            }

            dependencies.get(child).add(pkg);

            if (!seen.has(child)) {
                queue.push(child);
            }
        }
    }

    return dependencies;
}

function calculatePackageDuplication(pkgs: Package[]): Map<Package, number> {
    const dependencies = calculatePackageDependencyEdges(pkgs);
    const duplication: Map<Package, number> = new Map();
    const seen: Set<Package> = new Set();

    const visitNode = (pkg: Package): number => {
        if (seen.has(pkg)) return duplication.get(pkg) || 0;

        seen.add(pkg);

        // The score for a package is at least the number of
        // different packages that depend on it
        let sum = dependencies.get(pkg).size;

        for (const child of pkg.children.values()) {
            sum += visitNode(child);
        }

        duplication.set(pkg, sum);

        return sum;
    };

    pkgs.forEach(visitNode);

    return duplication;
}
