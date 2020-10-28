const assert = require('assert')
const sander = require('sander')
const rollup = require('rollup')
const incremental = require('..')

const cwd = process.cwd();

function wait(ms) {
    return new Promise(fulfil => {
        setTimeout(fulfil, ms);
    });
}

function sequence(watcher, events, timeout = 300) {
    return new Promise((fulfil, reject) => {
        function go(event) {
            const next = events.shift();

            if (!next) {
                watcher.close();
                fulfil();
            } else if (typeof next === 'string') {
                watcher.once('event', event => {
                    if (event.code !== next) {
                        watcher.close();
                        if (event.code === 'ERROR') console.log(event.error);
                        reject(new Error(`Expected ${next} event, got ${event.code}`));
                    } else {
                        go(event);
                    }
                });
            } else {
                Promise.resolve()
                    .then(() => wait(timeout)) // gah, this appears to be necessary to fix random errors
                    .then(() => next(event))
                    .then(go)
                    .catch(error => {
                        watcher.close();
                        reject(error);
                    });
            }
        }

        go();
    });
}

function run(file) {
    const resolved = require.resolve(file);
    delete require.cache[resolved];
    return require(resolved).default;
}

function usual(override={}) {
    return rollup.watch({
        treeshake: false,
        input: 'test/_tmp/input/main.js',
        plugins: incremental(),
        output: {
            preserveModules: true,
            preserveModulesRoot: 'test/_tmp/input',
            dir: 'test/_tmp/output',
            format: 'cjs',
            exports: 'named',
        },
        ...override
    });
}

function sample(sampleName, overrideConfig, seq) {
    return sander.copydir('test/samples/' + sampleName).to('test/_tmp/input').then(() =>
        sequence(usual(overrideConfig), seq)
    )
}

describe('rollup-plugin-incremental', () => {
    let watcher

    beforeEach(() => {
        process.chdir(cwd)
        return sander.rimraf('test/_tmp')
    })

    afterEach(() => {
        if (watcher) {
            watcher.close()
            watcher = null
        }
    })

    it('throws with tree shake', () => {
        return sample('basic', {treeshake: true}, [
            'START',
            'BUNDLE_START',
            'ERROR',
            err => assert.deepStrictEqual(err.error.message, '"treeshake" should be "false" for incremental building')
        ])
    });

    it('throws without preserveModules', () => {
        return sample('basic', {output: {dir: 'test/_tmp/output'}}, [
            'START',
            'BUNDLE_START',
            'ERROR',
            err => assert.deepStrictEqual(err.error.message, '"preserveModules" should be "true" for incremental building')
        ])
    });

    it('throws on multi-output', () => {
        const output = [
            {preserveModules: true, dir: 'test/_tmp/output'},
            {preserveModules: true, dir: 'test/_tmp/output'}
        ]
        return sample('basic', {output}, [
            'START',
            'BUNDLE_START',
            'ERROR',
            err => assert.deepStrictEqual(err.error.message, 'Multiply outputs currently is not supported')
        ])
    });

    it('works', () => {
        let modified1;
        let modified2;
        return sample('dependencies', {}, [
            'START',
            'BUNDLE_START',
            'BUNDLE_END',
            'END',
            () => {
                assert.strictEqual(run('./_tmp/output/main.js'), 'dep1: "dep1", dep2: "dep2"');
                modified1 = sander.statSync('test/_tmp/output/dep1.js').mtimeMs;
                modified2 = sander.statSync('test/_tmp/output/dep2.js').mtimeMs;
                sander.writeFileSync(
                    'test/_tmp/input/main.js',
                    'import "./dep1.js"; import "./dep2.js"; export default 43;'
                );
            },
            'START',
            'BUNDLE_START',
            'BUNDLE_END',
            'END',
            () => {
                assert.strictEqual(run('./_tmp/output/main.js'), 43);
                assert.strictEqual(sander.statSync('test/_tmp/output/dep1.js').mtimeMs, modified1);
                assert.strictEqual(sander.statSync('test/_tmp/output/dep2.js').mtimeMs, modified2);
            }
        ]);
    });

    it('generates correct module ids', () => {
        return sample('incremental-names', {}, [
            'START',
            'BUNDLE_START',
            'BUNDLE_END',
            'END',
            () => {
                assert.strictEqual(run('./_tmp/output/main.js'), 42 + 42);
                sander.writeFileSync(
                    'test/_tmp/input/main.js',
                    'import mod from "./mod.ts"; import mod2 from "./img.png"; export default mod + mod2 + 1'
                );
            },
            'START',
            'BUNDLE_START',
            'BUNDLE_END',
            'END',
            () => {
                assert.strictEqual(run('./_tmp/output/main.js'), 42 + 42 + 1);
            }
        ]);
    });

    //TODO trigger full rebuilds

    //TODO build errors

    //TODO deep files changes

    //TODO multi chunks

    //TODO throws on duplicated

})
