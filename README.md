[npm]: https://img.shields.io/npm/v/@mprt/rollup-plugin-incremental
[npm-url]: https://www.npmjs.com/package/@mprt/rollup-plugin-incremental
[![npm][npm]][npm-url]

# @mprt/rollup-plugin-incremental
A Rollup plugin which makes your (development) builds much faster, by recompiling only changed modules.

## Requirements

This plugin requires at least rollup@2.33.1

## Install

Using yarn or npm:

```console
yarn add -D @mprt/rollup-plugin-incremental

npm install @mprt/rollup-plugin-incremental --save-dev
```

## Usage

```js
//some imports ...
import incremental from '@mprt/rollup-plugin-incremental'

export default {
    input: 'src/index.js',
    //ATTENTION: treeshaking must be disabled!
    treeshake: false,
    //ATTENTION: there is must be only one output! 
    output: {
        dir: 'dist',
        format: 'esm',
        //ATTENTION: preserveModules must be enabled!
        preserveModules: true,
        preserveModulesRoot: 'src',
        //ATTENTION: minifyInternalExports must be disabled!
        minifyInternalExports: false,
    },
    plugins: [
        //ATTENTION: plugin very likely should be first!
        //BTW, this plugin is noop without watch mode 
        incremental(),  
        
        //another plugins...
        
        //ATTENTION: this fixes issues with syntheticNamedExports in commonjs modules
        //it should be last 
        incremental.fixSNE(),
    ],
}
```
And then...
```console
rollup -cw
```

There is simple typical ts, react and mobx web app in example folder.

First build will take same time as usual, but second and next builds should be really fast - below a second. 

## Gotchas

- If changed file is not directly transpiles to module (ie: some babel config), then full rebuild triggered.
- If error occurs during incremental build, all changed modules will be rebuild again on next build
- Currently it works by replacing `input` option on incremental builds, so it cannot work with another plugins which
works with `input`, i.e. multi-entry plugin

## Inter-plugin API

This plugin exposes next [API](https://rollupjs.org/guide/en/#direct-plugin-communication):

```ts
interface IncrementalAPI {
    /** Is current (or last, if there is no current) build is incremental? */
    readonly incrementalBuild: boolean 
    /** Ids of changed modules, which triggers incremental build. Null if build is not incremental */
    readonly changedModules: null | Set<string>
}
```
