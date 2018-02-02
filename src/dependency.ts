'use strict';

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
    dist: NpmPackageVersionDist;
}

export interface PackageMap {
    [name: string]: Dependency;
}

export class Dependency {
    client: Client;
    parent: null | Dependency;
    name: string;
    version: string;
    dependencies: {
        [name: string]: string;
    };
    dist: NpmPackageVersionDist;
    children: PackageMap;
    ownChildren: PackageMap;
    resolved: null | Promise<Dependency>;

    constructor(
        client: Client,
        parent: null | Dependency,
        { name, version, dependencies = {}, dist }: NpmPackageVersionResponse
    ) {
        this.client = client;
        this.parent = parent;
        this.name = name;
        this.version = version;
        this.dependencies = dependencies;
        this.dist = dist;
        this.children = {};
        this.ownChildren = {};
        this.resolved = null;
    }

    get ancestors(): Array<Dependency> {
        const ancestors = [];

        for (
            let parent: Dependency = this.parent;
            parent;
            parent = parent.parent
        ) {
            ancestors.push(parent);
        }

        return ancestors;
    }

    get path(): Array<string> {
        return this.ancestors
            .reverse()
            .map(pkg => `${pkg.name}@${pkg.version}`);
    }

    resolve() {
        if (!this.resolved) {
            this.resolved = this._resolve();
        }

        return this.resolved;
    }

    async _resolve() {
        const ownChildren = await Promise.all(
            Object.keys(this.dependencies)
                .sort()
                .map(async childName => {
                    const spec = `${childName}@${this.dependencies[childName]}`;
                    const childInfo = await this.client.loadPackageVersionMetadata(
                        spec
                    );

                    let parent: Dependency = this.parent;
                    let child: Dependency = null;
                    let lastParent: Dependency = this;

                    if (parent) {
                        findparent: do {
                            if (parent.ownChildren[childName]) {
                                if (
                                    parent.ownChildren[childName].version ===
                                    childInfo.version
                                ) {
                                    child = parent.ownChildren[childName];
                                    break findparent;
                                }
                                break findparent;
                            }
                            lastParent = parent;
                        } while ((parent = parent.parent));
                    }

                    if (child) {
                        this.children[child.name] = child;

                        return;
                    }

                    if (!child) {
                        child = new Dependency(this.client, lastParent, childInfo);

                        lastParent.ownChildren[child.name] = child;

                        return child;
                    }
                })
        );

        await Promise.all(
            ownChildren.filter(Boolean).map(child => child.resolve())
        );

        return this;
    }

    toJSON(): PackageAsJson {
        return {
            name: this.name,
            version: this.version,
            dependencies: Object.keys(this.ownChildren).reduce(
                (
                    dependencies: { [key: string]: PackageAsJson },
                    key: string
                ) => {
                    dependencies[key] = this.ownChildren[key].toJSON();

                    return dependencies;
                },
                {}
            ),
            dist: this.dist,
        };
    }
}
