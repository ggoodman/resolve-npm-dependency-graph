# Resolve npm package dependency graphs in-memory

This module's basic functionality is to calculate the dependency graph of an npm module. It exposes a `Client` class that facilitates the caching and deduplication of in-memory `Package` objects.

The module also provides support for the calculation of a (relatively) optimal and deterministic dependency tree that can be thought of as the equivalent of an npm `package-lock.json` or `yarn.lock` tree via a separate entrypoint `require('resolve-npm-dependency-graph/optimize')`.

## Usage

```js
const Resolver = require('resolve-npm-dependency-graph');
const CdnLoader = require('resolve-npm-dependency-graph/npmLoader');
const Optimizer = require('resolve-npm-dependency-graph/optimizer');

const npmLoader = NpmLoader.createLoader();
const client = new Resolver.Client({ packageMetadataLoader: npmLoader });

// Load the dependency graph of npm@5 and hapi@17
const npmPkg = await client.resolve('npm@5');
const hapiPkg = await client.resolve('hapi@17');

// Now flatten the dependency graphs of these two modules into an optimized,
// deduplicated tree
const root = Optimizer.flatten([npmPkg, hapiPkg]);
```

## API

### `Client`

Represents an instance of the dependency graph client. Holds a cache of resolved `Package` instances and can be configured with a custom `packageMetadataLoader` function.

#### `new Client(options)`

Create an instance of the resolver client.

- `options` - (required) options for the resolver client having:
    - `packageInstanceCache` - (optional) a custom cache for `Package` instances that supports the `has`, `get` and `set` methods of a `Map`
    - `packageMetadataLoader` - (required) a function that will take an npm package spec like `hapi@17` the return a `Promise` that resolves to a json object having the following properties:
        - `name` - (required) the name of the module
        - `version` - (required) the version of the module
        - `dependencies` - (optional) a map of dependency names to semver ranges

An instance of the resolver client

#### `load(spec)`

Load the dependency graph for a given package spec where:

 - `spec` (required) spec for the npm package to be loaded. The types of specs supported really depend on the `packageMetadataLoader`.

Returns a `Promise` that resolves to a `Package` instance.

### `Package`

Represents an instance of a loaded package having the following properties:

- `name` - the name of the package
- `version` - the version of the package
- `dependencies` - a mapping of dependency names to required specs (`dependencies` from `package.json`)
- `children` - a `Map` of child package names to resolved `Package` instances

### `require('resolve-npm-dependency-graph/npmLoader')`

Provides a `packageMetadataLoader` based on the npm registry api. Since the registry does not (currently) support CORS, this loader is only suitable for use from the server-side.

#### `createLoader(options)`

Create an instance of the npm package metadata loader with the following optional options:

- `registryUrl` - The base url that points to an npm-compatibly registry. Defaults to `'https://registry.npmjs.org'`.

Returns a loader function.

### `require('resolve-npm-dependency-graph/cdnLoader')`

Provides a `packageMetadataLoader` based on a public npm cdn like [jsDelivr](https://www.jsDelivr.com) or [unpkg](https://unpkg.com). Both of these services should be suitable for use in a browser.

#### `createLoader(options)`

Create an instance of the npm package metadata loader with the following optional options:

- `baseUrl` - The base url that points an endpoint to which a `packageName@spec/package.json` can be appended and will resolve to the contents of the `package.json` file for the best matching version of that package. Defaults to `'https://cdn.jsdelivr.net/npm'` and is compatible with `'https://unpkg.com'`.

Returns a loader function.


### `require('resolve-npm-dependency-graph/optimizer')`

Provides a tool to build an optimized, deterministic module tree suitable for planning a `node_modules` directory structure.

#### `flatten(pkgs)`

Flatten a set of `Package` instances into a tree of `DependencyTreeNode`s where:

- `pkgs` - is an array of `Package` instances.

Returns a 'root' `DependencyTreeNode` with a dummy `pkg` property that has the tree of modules as `children`.

#### `DependencyTreeNode`

Represents a node in the flattened dependency tree and has the following properties:

- `pkg` - the instance of the `Package` at that node in the tree
- `children` - a `Map` of the names of child `DependencyTreeNode`s to their instances
- `parent` - a reference back to the node's parent
