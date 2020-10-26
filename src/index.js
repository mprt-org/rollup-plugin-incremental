const path = require('path')

const name = 'rollup-plugin-incremental'

module.exports = () => {
    let invalidated = new Set()
    let moduleToChunkMap = new Map()
    let incrementalBuild = false
    let buildProcessed = false
    /**
     * @type {import('rollup').Plugin}
     */
    const plugin = {
        name,
        options(options) {
            if (!this.meta.watchMode)
                return

            options = {...options, cache: {modules: []}}

            const ids = [...invalidated]
            invalidated.clear()

            incrementalBuild = ids.length > 0 && !ids.some(id => !moduleToChunkMap.has(id))
            buildProcessed = false

            if (incrementalBuild) {
                options.input = {}
                for (const id of ids)
                    options.input[path.basename(moduleToChunkMap.get(id))] = id
            }
            else
                moduleToChunkMap.clear()

            return options
        },

        buildStart(options) {
            if (!this.meta.watchMode)
                return

            if (options.plugins[0].name !== name)
                this.warn('This plugin must be first in "plugins", otherwise it might be bad!')

            if (options.plugins.filter(p => p.name === name).length > 1)
                this.error('This plugin must be not duplicated in "plugins"!')

            if (options.treeshake !== false)
                this.error('"treeshake" should be "false" for incremental building')

            if (!incrementalBuild)
                return

            for (const file of moduleToChunkMap.keys())
                if (!file.startsWith('\0'))
                    this.addWatchFile(file)
        },

        watchChange(id) {
            if (!this.meta.watchMode)
                return
            invalidated.add(id)
        },

        async resolveId(id, importer) {
            if (!this.meta.watchMode || !incrementalBuild)
                return

            const importerChunk = importer && moduleToChunkMap.get(importer)
            if (!importerChunk)
                return

            const r = await this.resolve(id, importer, {skipSelf: true})
            if (r) {
                let chunkName = moduleToChunkMap.get(r.id)
                if (chunkName) {
                    chunkName = path.relative(path.dirname(importerChunk), chunkName)
                    if (!chunkName.startsWith('.'))
                        chunkName = './' + chunkName
                }
                return {...r, id: chunkName || r.id, external: chunkName ? true : r.external}
            }
        },

        outputOptions(options) {
            if (!this.meta.watchMode || !incrementalBuild)
                return

            return {...options, entryFileNames: '[name]'}
        },

        generateBundle(options, bundle) {
            if (!this.meta.watchMode)
                return

            if (!options.preserveModules)
                this.error('"preserveModules" should be "true" for incremental building')

            if (buildProcessed)
                this.error('Multiply outputs currently is not supported')

            buildProcessed = true

            for (const chunk of Object.values(bundle)) {
                const modulesNames = Object.keys(chunk.modules)
                if (modulesNames.length > 1)
                    this.error('Chunk includes more than one module!')
                moduleToChunkMap.set(modulesNames[0], '/' + chunk.fileName)
            }
        }
    }
    return plugin
}
