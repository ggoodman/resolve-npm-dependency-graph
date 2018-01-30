import { Client } from './client';
import { Package } from './package';

export interface ResolveOptions {}

export async function resolve(
    spec: string,
    options: ResolveOptions = {}
): Promise<Package> {
    const client = new Client(options);

    return await client.resolve(spec);
}

if (!module.parent) {
    resolve(process.argv[2]).then(
        result => console.log(JSON.stringify(result, null, 2)),
        error => console.log({ error })
    );
}
