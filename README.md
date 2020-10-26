[npm]: https://img.shields.io/npm/v/@mprt/rollup-plugin-incremental
[npm-url]: https://www.npmjs.com/package/@mprt/rollup-plugin-incremental
[![npm][npm]][npm-url]

# @mprt/rollup-plugin-incremental
A Rollup plugin which makes your (development) builds much faster, by recompiling only changed modules.

## Requirements

This plugin requires Rollup v2.

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
    treeshake: false, //ATTENTION: treeshaking must be disabled!
    output: { //ATTENTION: there is must be only one output! 
        dir: 'dist',
        format: 'esm',
        preserveModules: true, //ATTENTION: preserveModules must be enabled!
        preserveModulesRoot: 'src',
    },
    plugins: [
        incremental(),  //ATTENTION: plugin very likely should be first!
                        //BTW, this plugin is noop without watch mode 
        //another plugins...
    ],
}
```
And then...
```console
rollup -cw
```

First build will take same time as usual, but second and next builds should be really fast - below a second. 

## Gotchas

- If changed file is not directly transpiles to module (ie: some babel config), then full rebuild triggered.
- Until full rebuild triggered, watched files only added and never removed!
 So sometimes rebuilds can be triggered even if file is not part of import tree.
