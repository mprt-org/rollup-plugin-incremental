import {init} from '@sentry/browser'

export async function render() {
    const root = document.getElementById('root')
    if (!root) {
        init()
        throw Error('Cannot find root element')
    }

    const {draw} = await import('./App')
    await draw(root)
}

void render()
