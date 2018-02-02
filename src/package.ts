import {
    Client,
    NpmPackageVersionDist,
    NpmPackageVersionResponse,
} from './client';

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

    constructor({
        name,
        version,
        dependencies = {},
        dist,
    }: NpmPackageVersionResponse) {
        this.name = name;
        this.version = version;
        this.dependencies = dependencies;
        this.dist = dist;
        this.children = new Map();
    }

    get id(): string {
        return `${this.name}@${this.version}`;
    }

    toJSON(): PackageAsJson {
        const dependencies: {
            [key: string]: PackageAsJson;
        } = {};

        this.children.forEach(child => {
            dependencies[child.name] = child.toJSON();
        });

        return {
            name: this.name,
            version: this.version,
            dependencies,
        };
    }
}
