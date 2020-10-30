const path = require('path')

const name = 'rollup-plugin-incremental'

const SUFFIX = '?incremental-entry'

/** @type {function(string): boolean} */
const isIncrementalEntry = id => id.startsWith('\0') && id.endsWith(SUFFIX)

/** @type {function(string): (string | null)} */
function unwrap(id) {
    if (!isIncrementalEntry(id))
        return null
    return id.slice(1, id.length - SUFFIX.length)
}

/** @type {function(string): string} */
function wrap(id) {
    if (isIncrementalEntry(id))
        throw new Error('Already wrapped!')
    return '\0' + id + SUFFIX
}

/** @type {function(any): any} */
const cast = arg => arg

/** @type {import('rollup').PluginImpl}
 *  @return {import('rollup').Plugin} */
module.exports = (options = {}) => {
    /** @type {Set<string>}*/
    let invalidated = new Set()
    /** @type {Map<string, string>}*/
    let moduleToChunkMap = new Map()
    let buildProcessed = false
    /** @type {Set<string> | null}*/
    let changedModules = null

    return {
        name,
        api: {
            get incrementalBuild() {
                return !!changedModules
            },
            get changedModules() {
                return changedModules && new Set(changedModules)
            }
        },
        options(options) {
            if (!this.meta.watchMode)
                return

            buildProcessed = false
            options = {...options, cache: {modules: []}}

            changedModules = new Set(invalidated)
            invalidated.clear()

            let incrementalBuild = changedModules.size > 0

            /** @type {Record<string, string>}*/
            const entries = {}
            for (const id of changedModules) {
                const chunk = moduleToChunkMap.get(id)
                if (!chunk) {
                    incrementalBuild = false
                    break
                }
                entries[chunk] = id
            }

            if (incrementalBuild) {
                options.input = entries
            }
            else {
                moduleToChunkMap.clear()
                changedModules = null
            }

            return options
        },

        buildStart(options) {
            if (!this.meta.watchMode)
                return

            //TODO check rollup version by this.getWatchFiles
            //TODO add to peerDependencies
            //TODO add to readme

            if (options.plugins[0].name !== name)
                this.warn('This plugin must be first in "plugins", otherwise it might be bad!')

            if (options.plugins.filter(p => p.name === name).length > 1)
                this.error('This plugin must be not duplicated in "plugins"!')

            if (options.treeshake !== false)
                this.error('"treeshake" should be "false" for incremental building')

            if (!changedModules)
                return

            for (const file of moduleToChunkMap.keys())
                if (!file.startsWith('\0'))
                    this.addWatchFile(file)
        },

        watchChange(id) {
            const ctx = (/** @type {any} TODO */ (this))
            if (!ctx.meta.watchMode)
                return
            //TODO handle deleted files
            invalidated.add(id)
        },

        async resolveId(id, importer) {
            if (!this.meta.watchMode)
                return

            if (isIncrementalEntry(id))
                return id

            if (!changedModules)
                return

            if (!importer)
                return id

            const importerChunk = moduleToChunkMap.get(importer)
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
                return {
                    ...r,
                    id: chunkName || r.id,
                    external: chunkName ? true : r.external
                }
            }
        },

        load(id) {
            const spec = unwrap(id)
            if (!spec)
                return null

            const info = this.getModuleInfo(spec)
            if (!info || !info.ast)
                this.error('???')

            /** @type {import('estree').Node[]} */
            const body = cast(info.ast).body

            const hasDefault = body.some(n =>
                n.type === 'ExportDefaultDeclaration'
                || n.type === 'ExportNamedDeclaration' && n.specifiers.some(s => s.exported.name === 'default')
            )

            return `export * from "${spec}";` + (hasDefault ? `export { default } from "${spec}"` : '')
        },

        moduleParsed(info) {
            if (!this.meta.watchMode || isIncrementalEntry(info.id))
                return

            this.emitFile({
                type: 'chunk',
                id: wrap(info.id),
                preserveSignature: 'strict',
            })
        },

        buildEnd(err) {
            if (!this.meta.watchMode)
                return

            //TODO get watch files from context

            if (!err || !changedModules)
                return

            for (const id of changedModules)
                invalidated.add(id)
        },

        outputOptions(options) {
            if (!this.meta.watchMode || !changedModules)
                return

            return {...options, entryFileNames: chunk => path.basename(chunk.name)}
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
                if (chunk.type === 'asset')
                    continue
                const modulesNames = Object.keys(chunk.modules)
                if (modulesNames.length !== 1)
                    this.error('Chunk must includes exactly one module!')
                moduleToChunkMap.set(modulesNames[0], '/' + chunk.fileName)
            }
        }
    }
}
