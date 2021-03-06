import { Client, NpmPackageVersionDist, NpmPackageVersionResponse } from './';

export interface PackageAsJson {
    name: string;
    version: string;
    dependencies: {
        [key: string]: PackageAsJson;
    };
}

/**
 * Representation of a node in the package dependency graph
 */
export class Package {
    name: string;
    version: string;
    dependencies: {
        [name: string]: string;
    };
    dist: NpmPackageVersionDist;
    children: Map<string, Package>;
    raw: NpmPackageVersionResponse;

    constructor(pkgInfo: NpmPackageVersionResponse) {
        this.name = pkgInfo.name;
        this.version = pkgInfo.version;
        this.dependencies = pkgInfo.dependencies;
        this.dist = pkgInfo.dist;
        this.children = new Map();
        this.raw = pkgInfo;
    }

    get id(): string {
        return `${this.name}@${this.version}`;
    }

    toJSON(seen = new Set()): PackageAsJson {
        const dependencies: {
            [key: string]: PackageAsJson;
        } = {};

        seen.add(this);

        this.children.forEach(child => {
            if (seen.has(child)) {
                // Prevent infinite recursion
                dependencies[child.name] = {
                    name: child.name,
                    version: child.version,
                    dependencies: {},
                };
            } else {
                dependencies[child.name] = child.toJSON(seen);
            }
        });

        return {
            name: this.name,
            version: this.version,
            dependencies,
        };
    }
}
