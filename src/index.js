const path = require('path')

const name = 'rollup-plugin-incremental'

const SUFFIX = '?sne-proxy.js'

const stubId = '\0incremental-stub'

/** @arg id {string}
 *  @return {boolean} */
const isSneProxy = id => id.startsWith('\0') && id.endsWith(SUFFIX)

/** @arg id {string}
 *  @return {null | string} */
function unwrap(id) {
    if (!isSneProxy(id))
        return null
    return id.slice(1, id.length - SUFFIX.length)
}

/** @arg id {string}
 *  @return {string} */
function wrap(id) {
    if (isSneProxy(id))
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
    /** @type {Map<string, {sne: true | string, hasDefault: boolean, path: string}>}*/
    let knownSneModules = new Map()
    /** @type {Map<string, Set<string>>}*/
    let importers = new Map()
    /** @type {Map<string, Set<string>>}*/
    let imported = new Map()
    /** @type {Array<string>}*/
    let prevWatched = []

    /** @type {Map<string, true>}*/
    let resolveNow = new Map()
    let fakeBuild = false

    /** @type {(id: string) => boolean}*/
    const hasImporters = id => {
        const imp = importers.get(id)
        return !!imp && imp.size > 0
    }

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

            fakeBuild = false

            /** @type {Record<string, string>}*/
            const entries = {}
            for (const id of changedModules) {
                const chunk = moduleToChunkMap.get(id)
                if (!chunk) {
                    incrementalBuild = false
                    break
                }
                if (hasImporters(id))
                    entries[chunk] = id
            }

            if (incrementalBuild) {
                if (!Object.keys(entries).length) {
                    console.log('Nothing to recompile, run fake build')
                    fakeBuild = true
                }

                options.input = entries
            }
            else {
                moduleToChunkMap.clear()
                knownSneModules.clear()
                importers.clear()
                imported.clear()
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

            for (const file of prevWatched) {
                if (hasImporters(file))
                    this.addWatchFile(file)
                else
                    moduleToChunkMap.delete(file)
            }
            if (fakeBuild)
                this.emitFile({type: 'chunk', id: stubId})
        },

        watchChange(id, {event}) {
            if (!this.meta.watchMode)
                return
            if (event === 'delete') {
                const imp = importers.get(id) || []
                console.log('File deleted:', id)
                moduleToChunkMap.delete(id)
                console.log('Invalidate importers:', imp)
                for (const importer of imp)
                    invalidated.add(importer)
            }
            else
                invalidated.add(id)
        },

        async resolveId(id, importer) {
            if (!this.meta.watchMode || resolveNow.get(id + '___' + importer))
                return

            if (isSneProxy(id))
                return id

            if (!changedModules)
                return

            if (!importer)
                return id

            if (isSneProxy(importer))
                return {id, external: true}

            const importerChunk = moduleToChunkMap.get(importer)
            if (!importerChunk)
                return

            //todo file a bug about recursive skipSelf
            resolveNow.set(id + '___' + importer, true)
            const r = await this.resolve(id, importer, {skipSelf: true})
            resolveNow.delete(id + '___' + importer)
            if (!r)
                this.error(`Could not resolve '${id}' from '${importer}'`)

            if (knownSneModules.has(r.id))
                return wrap(r.id)

            let chunkName = moduleToChunkMap.get(r.id)
            if (chunkName) {
                chunkName = path.relative(path.dirname(importerChunk), chunkName)
                if (!chunkName.startsWith('.'))
                    chunkName = './' + chunkName
            } else
                console.log('New file added:', r.id)
            return {
                ...r,
                id: chunkName || r.id,
                external: chunkName ? true : r.external
            }
        },

        load(id) {
            if (id === stubId)
                return ''
            const moduleName = unwrap(id)
            if (!moduleName)
                return
            const m = knownSneModules.get(moduleName)
            if (!m)
                throw new Error('Impossible 2!')

            //todo file a bug about external SNE
            const code = [
                m.hasDefault ? `import D from '${m.path}'\nconst d = D\nexport default d` : '',
                `import * as I from '${m.path}'`,
                `export const __incSNE = {...${typeof m.sne === 'string' ? 'I.' + m.sne : 'D'}, ...I}`,
            ].join('\n')

            return {code, syntheticNamedExports: '__incSNE'}
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

            return {
                ...options,
                //TODO better filenames for sne proxies, maybe based on generations
                entryFileNames: chunk => chunk.isEntry ? path.basename(chunk.name) : (chunk.name + '.js')
            }
        },

        generateBundle(options, bundle) {
            if (!this.meta.watchMode)
                return

            if (!options.preserveModules)
                this.error('"preserveModules" should be "true" for incremental building')

            if (options.minifyInternalExports)
                this.error('"minifyInternalExports" should be "false" for incremental building')

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
                if (isSneProxy(moduleName))
                    continue

                moduleToChunkMap.set(moduleName, '/' + chunk.fileName)

                const m = this.getModuleInfo(moduleName)
                if (!m)
                    throw new Error('Impossible!')

                if (m.syntheticNamedExports) {
                    knownSneModules.set(moduleName, {
                        hasDefault: chunk.exports.includes('default'),
                        sne: m.syntheticNamedExports,
                        path: '../' + chunk.fileName,
                    })
                }

                if (!changedModules) {
                    const imp = new Set(m.importers)
                    if (chunk.isEntry)
                        imp.add('ENTRY')
                    importers.set(m.id, imp)
                    imported.set(m.id, new Set(m.importedIds))
                } else {
                    const prev = imported.get(m.id) || new Set()
                    const next = new Set(m.importedIds)
                    for (const id of prev) {
                        const imp = importers.get(id)
                        imp && imp.delete(m.id)
                    }
                    for (const id of next) {
                        const imp = importers.get(id)
                        imp && imp.add(m.id)
                    }
                    imported.set(m.id, next)
                }
            }
        },
    }
}

//todo file a bug about sne export exclusion
/** @returns {import('rollup').Plugin} */
module.exports.fixSNE = () => ({
    name: name + '-fix-sne',
    transform(code, id) {
        const info = this.getModuleInfo(id)
        if (!info)
            return null

        if (info.syntheticNamedExports === 'default')
            return {code, syntheticNamedExports: true}

        if (typeof info.syntheticNamedExports === 'string') {
            let name = ''
            /** @type {any}*/
            const t = this.parse(code)
            /** @type {import('estree').Program}*/
            const ast = t
            for (const v of ast.body) {
                if (v.type === 'ExportNamedDeclaration') {
                    const e = v.specifiers.find(s => s.exported.name === info.syntheticNamedExports)
                    if (e) {
                        name = e.local.name
                    }
                }
            }
            if (name)
                return {
                    code: code + '\nexport const __stubSNE = ' + name,
                    syntheticNamedExports: '__stubSNE',
                }
        }
        return null
    },
})
