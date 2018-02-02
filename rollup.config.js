import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript';
import pkg from './package.json';

export default {
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
        // sourcemaps(),
    ],
};
