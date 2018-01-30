/* eslint no-control-regex:0 no-useless-escape:0 */
'use strict';

import Assert from 'assert';
import { Agent as HttpsAgent } from 'https';

import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import AsyncCache from 'async-cache';
import npa from 'npm-package-arg';
import Semver from 'semver';

import { Dependency } from './dependency';
import { Package, PackageAsJson } from './package';

/*
    Cache-Control   = 1#cache-directive
    cache-directive = token [ "=" ( token / quoted-string ) ]
    token           = [^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+
    quoted-string   = "(?:[^"\\]|\\.)*"
*/

//                                          1: directive                                        =   2: token                                              3: quoted-string
const CACHE_CONTROL_RX = /(?:^|(?:\s*\,\s*))([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)(?:\=(?:([^\x00-\x20\(\)<>@\,;\:\\"\/\[\]\?\=\{\}\x7F]+)|(?:\"((?:[^"\\]|\\.)*)\")))?/g;

export interface NpmPackageResponse {
    'dist-tags': {
        [tag: string]: string;
    };
    versions: {
        [version: string]: NpmPackageVersionResponse;
    };
    _size: number;
}

export interface NpmPackageVersionDist {
    integrity: string;
    shasum: string;
    tarball: string;
}

export interface NpmPackageVersionResponse {
    name: string;
    version: string;
    dependencies?: { [name: string]: string };
    dist: NpmPackageVersionDist;
}

interface BestPath {
    path: Array<Package>;
    score: number;
}

export class Client {
    httpClient: AxiosInstance;
    packageLoadCache: Map<string, Promise<Package>>;
    lru: AsyncCache.Cache<NpmPackageResponse>;
    packageInstanceCache: Map<string, Package>;
    stats: {
        maxRequestTime: number;
        minRequestTime: number;
        totalRequestTime: number;
        readonly cacheHits: number;
        cacheMisses: number;
        cacheRequests: number;
    };

    constructor({ max = 1024 * 1024 * 2, maxAge = 5000 } = {}) {
        this.httpClient = Axios.create({
            baseURL: 'https://registry.npmjs.org',
            headers: {
                Accept: 'Accept: application/vnd.npm.install-v1+json',
            },
            httpsAgent: new HttpsAgent({ keepAlive: true }),
            responseType: 'json',
            timeout: 2000,
        });
        this.packageInstanceCache = new Map();
        this.packageLoadCache = new Map();
        this.lru = new AsyncCache({
            length: entry => entry._size,
            load: (key, cb) => {
                const start = Date.now();

                this.stats.cacheMisses += 1;

                this.httpClient
                    .get(`/${encodeURIComponent(key)}`)
                    .then((response: AxiosResponse) => {
                        const data: NpmPackageResponse = response.data;
                        const cacheControl = parseCacheControl(
                            response.headers['cache-control']
                        );
                        const length = parseInt(
                            response.headers['content-length']
                        );

                        const requestTime = Date.now() - start;

                        if (requestTime > this.stats.maxRequestTime)
                            this.stats.maxRequestTime = requestTime;

                        if (requestTime < this.stats.minRequestTime)
                            this.stats.minRequestTime = requestTime;

                        this.stats.totalRequestTime += requestTime;

                        return cb(null, data, cacheControl['max-age']);
                    })
                    .catch((error: Error) => cb(error, undefined));
            },
            max,
            maxAge,
        });
        this.stats = {
            get cacheHits(): number {
                return this.cacheRequests - this.cacheMisses;
            },
            cacheMisses: 0,
            cacheRequests: 0,
            maxRequestTime: 0,
            minRequestTime: Infinity,
            totalRequestTime: 0,
        };
    }

    loadPackageMetadata(packageName: string): Promise<NpmPackageResponse> {
        return new Promise((resolve, reject) => {
            this.stats.cacheRequests++;

            this.lru.get(
                packageName,
                (error, result) => (error ? reject(error) : resolve(result))
            );
        });
    }

    async loadPackageVersionMetadata(
        spec: string
    ): Promise<NpmPackageVersionResponse> {
        const parsedSpec: npa.Result = npa(spec);

        switch (parsedSpec.type) {
            case 'range': {
                const entry = await this.loadPackageMetadata(
                    parsedSpec.escapedName
                );
                const versions = Object.keys(entry.versions);
                const version = Semver.maxSatisfying(
                    versions,
                    parsedSpec.fetchSpec
                );

                if (!version) {
                    throw new Error(
                        `Impossible to satisfy the range dependency '${
                            parsedSpec.raw
                        }'`
                    );
                }

                return entry.versions[version];
            }
            case 'tag': {
                const entry = await this.loadPackageMetadata(
                    parsedSpec.escapedName
                );
                const distTags = entry['dist-tags'];
                const version = distTags[parsedSpec.fetchSpec];

                if (!version) {
                    throw new Error(
                        `Impossible to satisfy the range dependency '${
                            parsedSpec.raw
                        }'`
                    );
                }

                if (!entry.versions[version]) {
                    throw new Error(
                        `Inconsistent package dist-tags for '${parsedSpec.raw}'`
                    );
                }

                return entry.versions[version];
            }
            case 'version': {
                const entry = await this.loadPackageMetadata(
                    parsedSpec.escapedName
                );
                const version = parsedSpec.fetchSpec;

                if (!entry.versions[version]) {
                    throw new Error(
                        `Impossible to satisfy the version dependency '${
                            parsedSpec.raw
                        }'`
                    );
                }

                return entry.versions[version];
            }
            default:
                throw new Error(`Unknown spec type: ${parsedSpec.type}`);
        }
    }

    async createPackageInstance(spec: string): Promise<Package> {
        const packageInfo = await this.loadPackageVersionMetadata(spec);
        const normalizedSpec = `${packageInfo.name}@${packageInfo.version}`;

        if (!this.packageInstanceCache.has(normalizedSpec)) {
            const pkg = new Package(packageInfo);

            Assert.equal(pkg.id, normalizedSpec);

            this.packageInstanceCache.set(normalizedSpec, pkg);
        }

        return this.packageInstanceCache.get(normalizedSpec);
    }

    async load(spec: string): Promise<Package> {
        const start = Date.now();
        const pkg = await this.createPackageInstance(spec);
        const result = await this._loadPackage(pkg);

        return result;
    }

    private async _loadPackage(pkg: Package): Promise<Package> {
        if (!this.packageLoadCache.has(pkg.id)) {
            this.packageLoadCache.set(
                pkg.id,
                (async () => {
                    await Promise.all(
                        Object.keys(pkg.dependencies)
                            .map(async childName => {
                                const childSpec = pkg.dependencies[childName];
                                const child = await this.createPackageInstance(
                                    `${childName}@${childSpec}`
                                );

                                pkg.children.set(childName, child);

                                if (!this.packageLoadCache.has(child.id))
                                    return this._loadPackage(child);
                            })
                            .filter(Boolean)
                    );

                    return pkg;
                })()
            );
        }

        return await this.packageLoadCache.get(pkg.id);
    }

    buildOptimalTree(pkgs: [Package]): Array<DependencyTreeNode> {
        const requiredPackages: Set<Package> = new Set();
        const dependentGraph: Map<Package, Set<Package>> = new Map();
        const dependentCounts: Map<Package, number> = new Map();
        const packageSortPredicate = (a: Package, b: Package): number => {
            const dependentsA = dependentGraph.get(a);
            const dependentsB = dependentGraph.get(b);
            const dependentsDelta =
                (dependentsB ? dependentsB.size : 0) -
                (dependentsA ? dependentsA.size : 0);

            if (dependentsDelta) return dependentsDelta;
            return a.id > b.id ? -1 : 1;
        };
        const visitPackage = (pkg: Package) => {
            requiredPackages.add(pkg);

            pkg.children.forEach(child => {
                if (!dependentGraph.has(child)) {
                    dependentCounts.set(child, 0);
                    dependentGraph.set(child, new Set());
                }

                dependentCounts.set(child, dependentCounts.get(child) + 1);
                dependentGraph.get(child).add(pkg);

                if (!requiredPackages.has(child)) {
                    visitPackage(child);
                }
            });
        };

        pkgs.forEach(visitPackage);

        const optimalPaths: Map<Package, BestPath> = new Map();
        const calculateOptimalPath = (
            pkg: Package,
            path: BestPath
        ): Array<QueueItem> => {
            const bestPath = optimalPaths.get(pkg);

            if (!bestPath || bestPath.score < path.score) {
                optimalPaths.set(pkg, path);

                return Array.from(pkg.children.values()).map(
                    (child: Package) => {
                        return {
                            path: path.path.concat(child),
                            score:
                                path.score + dependentCounts.get(child)
                                    ? dependentCounts.get(child)
                                    : 0,
                            pkg: child,
                        };
                    }
                );
            }

            return [];
        };

        interface QueueItem {
            path: Array<Package>;
            score: number;
            pkg: Package;
        }

        const queue: Array<QueueItem> = pkgs.map(pkg => {
            return {
                path: [],
                score: 0,
                pkg,
            };
        });

        while (queue.length) {
            const item = queue.shift();
            const childPath: BestPath = {
                score: item.score + (dependentCounts.get(item.pkg) || 0),
                path: item.path.concat(item.pkg),
            };

            queue.push.apply(queue, calculateOptimalPath(item.pkg, childPath));
        }

        const root = new DependencyTreeNodeType(null, null, null);
        const sortedByDependencies = Array.from(requiredPackages.values()).sort(
            packageSortPredicate
        );

        pkgs.forEach(pkg => {
            root.addPackage(pkg, optimalPaths);
        });

        sortedByDependencies.forEach(pkg => {
            root.addPackage(pkg, optimalPaths);
        });

        return Array.from(root.children);
    }

    async resolve(spec: string): Promise<Dependency> {
        const versionInfo = await this.loadPackageVersionMetadata(spec);
        const root = new Dependency(this, null, versionInfo);

        await root.resolve();

        console.log(this.stats);

        return root;
    }
}

export interface DependencyTreeNode {
    children: Set<DependencyTreeNode>;
    parent: DependencyTreeNode | null;
    pkg: Package;
    root: DependencyTreeNode | null;
}

class DependencyTreeNodeType implements DependencyTreeNode {
    children: Set<DependencyTreeNodeType>;
    parent: DependencyTreeNodeType | null;
    pkg: Package;
    root: DependencyTreeNodeType | null;

    constructor(
        root: DependencyTreeNodeType,
        parent: DependencyTreeNodeType,
        pkg: Package
    ) {
        this.children = new Set();
        this.parent = parent;
        this.pkg = pkg;
        this.root = root;
    }

    addPackage(
        pkg: Package,
        optimalPaths: Map<Package, BestPath>
    ): DependencyTreeNodeType {
        let conflict = false;

        for (let child of this.children) {
            if (child.pkg === pkg) return child;
            if (child.pkg.name === pkg.name) {
                conflict = true;
                break;
            }
        }

        if (!conflict) {
            const child = new DependencyTreeNodeType(this.root, this, pkg);

            this.children.add(child);

            return child;
        }

        const bestPath = optimalPaths.get(pkg).path;
        const parentNode = this.addPackage(bestPath[0], optimalPaths);

        return parentNode.addPackage(pkg, optimalPaths);
    }

    toJSON(): PackageAsJson {
        const dependencies: {
            [key: string]: PackageAsJson;
        } = {};

        this.children.forEach(child => {
            dependencies[child.pkg.name] = child.toJSON();
        });

        return {
            name: this.pkg.name,
            version: this.pkg.version,
            dependencies,
        };
    }
}

function parseCacheControl(field: string): null | { 'max-age': number } {
    const header: any = {};
    const error = field.replace(CACHE_CONTROL_RX, ($0, $1, $2, $3) => {
        const value = $2 || $3;
        header[$1] = value ? value.toLowerCase() : true;
        return '';
    });

    if (header['max-age']) {
        try {
            const maxAge = parseInt(header['max-age'], 10);
            if (isNaN(maxAge)) {
                return null;
            }

            header['max-age'] = maxAge;
        } catch (err) {
            // Do nothing
        }
    }

    return error ? null : header;
}
