import fetch from 'cross-fetch';
import npa from 'npm-package-arg';
import Semver from 'semver';

import { NpmPackageVersionResponse } from './';

interface NpmPackageResponse {
    'dist-tags': {
        [tag: string]: string;
    };
    versions: {
        [version: string]: NpmPackageVersionResponse;
    };
    _size: number;
}

export function createLoader({ registryUrl = 'https://registry.npmjs.org' } = {}) {
    if (
        registryUrl.length &&
        registryUrl.charAt(registryUrl.length - 1) === '/'
    ) {
        registryUrl = registryUrl.slice(0, -1);
    }

    const loadPackageMetadata = async (
        spec: string
    ): Promise<NpmPackageResponse> => {
        const url = `${registryUrl}/${encodeURIComponent(spec)}`;
        const res = await fetch(url, {
            headers: {
                Accept: 'Accept: application/vnd.npm.install-v1+json',
            },
        });

        const data: NpmPackageResponse = await res.json();

        return data;
    };

    return async function resolve(
        spec: string
    ): Promise<NpmPackageVersionResponse> {
        const parsedSpec: npa.Result = npa(spec);

        switch (parsedSpec.type) {
            case 'range': {
                const entry = await loadPackageMetadata(parsedSpec.escapedName);
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
                const entry = await loadPackageMetadata(parsedSpec.escapedName);
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
                const entry = await loadPackageMetadata(parsedSpec.escapedName);
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
                throw new Error(
                    `Unknown spec for '${spec}': ${parsedSpec.type}`
                );
        }
    };
}
