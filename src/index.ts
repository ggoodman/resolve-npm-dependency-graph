import { Package, PackageAsJson } from './package';

export { Package };

export interface Cache<K, V> {
    has: (key: K) => boolean,
    get: (key: K) => V,
    set: (key: K, value: V) => any,
}

export type NpmPackageInstanceCache = Cache<string, Package>;

export type NpmPackageLoadCache = Cache<Package, Promise<Package>>;

export type NpmPackageMetadataLoader = (
    spec: string
) => Promise<NpmPackageVersionResponse>;

export interface NpmPackageVersionDist {
    integrity: string;
    shasum: string;
    tarball: string;
}

export interface NpmPackageVersionResponse {
    name: string;
    version: string;
    dependencies?: { [name: string]: string };
    dist?: NpmPackageVersionDist;
}

export class Client {
    packageLoadCache: NpmPackageLoadCache;
    packageMetadataLoader: NpmPackageMetadataLoader;
    packageInstanceCache: NpmPackageInstanceCache;

    constructor({
        packageInstanceCache = new Map(),
        packageMetadataLoader,
    }: {
        packageInstanceCache?: NpmPackageInstanceCache,
        packageMetadataLoader: NpmPackageMetadataLoader;
    }) {
        this.packageInstanceCache = new Map();
        this.packageMetadataLoader = packageMetadataLoader;
        this.packageLoadCache = new WeakMap();
    }

    async load(spec: string): Promise<Package> {
        const start = Date.now();
        const pkg = await this.createPackageInstance(spec);
        const result = await this.loadPackage(pkg);

        return result;
    }

    private async createPackageInstance(spec: string): Promise<Package> {
        const packageInfo = await this.loadPackageMetadata(spec);
        const normalizedSpec = `${packageInfo.name}@${packageInfo.version}`;

        if (!this.packageInstanceCache.has(normalizedSpec)) {
            const pkg = new Package(packageInfo);

            this.packageInstanceCache.set(normalizedSpec, pkg);
        }

        return this.packageInstanceCache.get(normalizedSpec);
    }

    private async loadPackageMetadata(
        spec: string
    ): Promise<NpmPackageVersionResponse> {
        return await this.packageMetadataLoader(spec);
    }

    private async loadPackage(pkg: Package): Promise<Package> {
        const loadChild = async (childName: string) => {
            const childSpec = pkg.dependencies[childName];
            const child = await this.createPackageInstance(
                `${childName}@${childSpec}`
            );

            pkg.children.set(childName, child);

            if (!this.packageLoadCache.has(child))
                return this.loadPackage(child);
        };

        if (!this.packageLoadCache.has(pkg)) {
            this.packageLoadCache.set(
                pkg,
                pkg.dependencies
                    ? Promise.all(
                          Object.keys(pkg.dependencies)
                              .map(loadChild)
                              .filter(Boolean)
                      ).then(
                          () => pkg,
                          error => {
                              throw new Error(
                                  `Error loading '${
                                      pkg.id
                                  }' because: ${JSON.stringify(error.message)}`
                              );
                          }
                      )
                    : Promise.resolve(pkg)
            );
        }

        return await this.packageLoadCache.get(pkg);
    }
}
