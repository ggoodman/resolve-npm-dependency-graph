import { Package } from './package';

/**
 * Representation of a node in the package dependency graph
 */
export class DependencyNode {
    pkg: Package;
    dependents: Set<DependencyNode>;
    dependencies: Set<DependencyNode>;

    constructor(pkg: Package) {
        this.dependencies = new Set();
        this.dependents = new Set();
        this.pkg = pkg;
    }
}
