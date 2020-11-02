const path = require('path')

const name = 'rollup-plugin-incremental'

const SUFFIX = '?incremental-entry.js'

/** @arg id {string}
 *  @return {boolean} */
const isIncrementalEntry = id => id.startsWith('\0') && id.endsWith(SUFFIX)

/** @arg id {string}
 *  @return {null | string} */
function unwrap(id) {
    if (!isIncrementalEntry(id))
        return null
    return id.slice(1, id.length - SUFFIX.length)
}

/** @arg id {string}
 *  @return {string} */
function wrap(id) {
    if (isIncrementalEntry(id))
        throw new Error('Already wrapped!')
    return '\0' + id + SUFFIX
}

/** @return {import('rollup').Plugin} */
module.exports = () => {
    /** @type {Set<string>}*/
    let invalidated = new Set()
    /** @type {Map<string, string>}*/
    let moduleToChunkMap = new Map()
    let buildProcessed = false
    /** @type {Set<string> | null}*/
    let changedModules = null
    /** @type {Map<string, string>}*/
    let incEntries = new Map()
    /** @type {Array<string>}*/
    let prevWatched = []

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
                incEntries.clear()
                changedModules = null
            }

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

            if (!changedModules)
                return

            for (const file of prevWatched)
                this.addWatchFile(file)
        },

        watchChange(id) {
            if (!this.meta.watchMode)
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

            if (isIncrementalEntry(importer)) {
                return {id, external: true}
            }
            if (changedModules.has(importer)) {
                const r = await this.resolve(id, importer, {skipSelf: true})
                if (r && incEntries.has(r.id))
                    return wrap(r.id)
                return r
            }
        },

        load(id) {
            const spec = unwrap(id)
            if (!spec)
                return null

            let code = incEntries.get(spec)
            if (!code) {
                const info = this.getModuleInfo(spec)
                if (!info || !info.ast)
                    this.error('???')

                if (!('syntheticNamedExports' in info))
                    this.error('Update rollup to v2.33.1 or above!')

                let sne = info.syntheticNamedExports || null
                if (sne === true)
                    sne = 'default'

                code = [
                    `import * as sne from "${spec}"`,
                    sne
                        ? `import {${sne}} from "${spec}"; export const __incSne = {...${sne}, ...sne}`
                        : 'export const __incSne = {...sne}',
                ].filter(Boolean).join('\n')
            }
            return {code, syntheticNamedExports: changedModules ? '__incSne' : false}
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

            prevWatched = this.getWatchFiles()

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
                const moduleName = modulesNames[0]
                moduleToChunkMap.set(moduleName, '/' + chunk.fileName)

                const incModule = unwrap(moduleName)
                if (incModule && !incEntries.has(incModule))
                    incEntries.set(incModule, chunk.code)
            }
        }
    }
}
