import { Client } from './client';
import { Dependency } from './dependency';

export interface ResolveOptions {}

export { Client };

export async function resolve(
    spec: string,
    options: ResolveOptions = {}
): Promise<Dependency> {
    const client = new Client(options);

    return await client.resolve(spec);
}

if (!module.parent) {
    resolve(process.argv[2]).then(
        result => console.log(JSON.stringify(result, null, 2)),
        error => console.log({ error })
    );
}
