import { nodeResolve } from '@rollup/plugin-node-resolve'
import babel from '@rollup/plugin-babel'
import postcss from 'rollup-plugin-postcss'
import url from '@rollup/plugin-url'
import commonjs from '@rollup/plugin-commonjs'
import serve from 'rollup-plugin-serve'

import nested from 'postcss-nested'

import fs from 'fs'

import incremental from '..'

/**
 * @type {import('rollup').RollupOptions}
 */
const options = {
    input: 'src/index.ts',
    treeshake: false,
    preserveEntrySignatures: 'strict',
    watch: {
        clearScreen: false,
    },
    output: {
        dir: 'dist',
        format: 'esm',
        preserveModules: true,
        preserveModulesRoot: 'src',
        minifyInternalExports: false,
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
        url({limit: 0, include: '**/*.+(png|jpe?g|ico|gif|pdf|mp3|svg)'}),
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
        }),
        serve({
            contentBase: 'dist',
            historyApiFallback: '/index.html',
            mimeTypes: {
                'application/javascript': ['js_commonjs-proxy', 'mjs_commonjs-proxy']
            }
        }),
        {
            buildStart() {
                this.emitFile({
                    type: 'asset',
                    source: fs.readFileSync(__dirname + '/src/index.html'),
                    fileName: 'index.html'
                })
            }
        },
        incremental.fixSNE(),
    ],
}

export default options
