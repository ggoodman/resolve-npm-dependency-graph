import { dirname, join } from 'path';

import typescript from 'rollup-plugin-typescript';

import pkg from './package.json';

export default [
    {
        input: 'src/index.ts',
        output: [
            { file: pkg.main, format: 'umd', sourceMap: true },
            { file: pkg.module, format: 'es', sourceMap: true },
        ],
        name: pkg.name,
        plugins: [
            typescript({
                typescript: require('typescript'),
            }),
        ],
    },
    {
        input: 'src/optimizer.ts',
        output: [
            {
                file: join(dirname(pkg.main), 'optimizer.js'),
                format: 'umd',
                sourceMap: true,
            },
            {
                file: join(dirname(pkg.module), 'optimizer.esm.js'),
                format: 'es',
                sourceMap: true,
            },
        ],
        name: pkg.name,
        plugins: [
            typescript({
                typescript: require('typescript'),
            }),
        ],
    },
    {
        input: 'src/npmLoader.ts',
        output: [
            {
                file: join(dirname(pkg.main), 'npmLoader.js'),
                format: 'umd',
                sourceMap: true,
            },
            {
                file: join(dirname(pkg.module), 'npmLoader.esm.js'),
                format: 'es',
                sourceMap: true,
            },
        ],
        name: pkg.name,
        plugins: [
            typescript({
                typescript: require('typescript'),
            }),
        ],
    },
    {
        input: 'src/cdnLoader.ts',
        output: [
            {
                file: join(dirname(pkg.main), 'cdnLoader.js'),
                format: 'umd',
                sourceMap: true,
            },
            {
                file: join(dirname(pkg.module), 'cdnLoader.esm.js'),
                format: 'es',
                sourceMap: true,
            },
        ],
        name: pkg.name,
        plugins: [
            typescript({
                typescript: require('typescript'),
            }),
        ],
    },
];
