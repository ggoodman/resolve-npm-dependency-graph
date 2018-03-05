import fetch from 'cross-fetch';
import npa from 'npm-package-arg';
import Semver from 'semver';

import { NpmPackageVersionResponse } from './';

export function createLoader({ baseUrl = 'https://cdn.jsdelivr.net/npm' } = {}) {
    if (baseUrl.length && baseUrl.charAt(baseUrl.length - 1) === '/') {
        baseUrl = baseUrl.slice(0, -1);
    }

    return async function resolve(
        spec: string
    ): Promise<NpmPackageVersionResponse> {
        const url = `${baseUrl}/${spec}/package.json`;
        const res = await fetch(url, {
            redirect: 'follow',
        });

        return res.json();
    };
}
