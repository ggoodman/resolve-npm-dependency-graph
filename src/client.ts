/* eslint no-control-regex:0 no-useless-escape:0 */
'use strict';

import { Agent as HttpsAgent } from 'https';

import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as AsyncCache from 'async-cache';
import npa from 'npm-package-arg';
import * as Semver from 'semver';

import { Package } from './package';

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

export class Client {
    httpClient: AxiosInstance;
    lru: AsyncCache.Cache<NpmPackageResponse>;
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

    async resolve(spec: string): Promise<Package> {
        const versionInfo = await this.loadPackageVersionMetadata(spec);
        const root = new Package(this, null, versionInfo);

        await root.resolve();

        console.log(this.stats);

        return root;
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
