import { nodeResolve } from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
import postcss from 'rollup-plugin-postcss'
import url from '@rollup/plugin-url'
import commonjs from '@rollup/plugin-commonjs'

import nested from 'postcss-nested'

import incremental from '..'

/**
 * @type {import('rollup').RollupOptions}
 */
const options = {
    input: 'src/index.ts',
    treeshake: false,
    preserveEntrySignatures: true,
    watch: {
        clearScreen: false,
    },
    output: {
        dir: 'dist',
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
    },
    plugins: [
        incremental(),
        nodeResolve({browser: true, extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx']}),
        commonjs(),
        postcss({
            modules: {
                generateScopedName: '[local]--[path]__[name]',
                localsConvention: 'dashes',
            },
            plugins: [
                nested(),
            ]
        }),
        url({limit: 0, include: '**/*.+(png|jpe?g|ico|gif|pdf|mp3|svg)', fileName: '[dirname][name][extname]', emitFiles: false}),
        babel({
            babelHelpers: 'bundled',
            extensions: ['.js', '.jsx', '.ts', '.tsx'],
            exclude: /node_modules/,
            presets: [
                '@babel/preset-react',
            ],
            plugins: [
                ['@babel/plugin-transform-typescript', {
                    isTSX: true,
                    allExtensions: true,
                }],
                ['@babel/plugin-proposal-decorators', {'legacy': true}],
                ['@babel/plugin-proposal-class-properties', { 'loose': true }],
            ]
        })
    ],
}

export default options
