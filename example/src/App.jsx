import React, {createElement} from 'react'
import { render } from 'react-dom'

import './variables.css'

import Hello from './components/Hello'


class RootScreen extends React.Component {
    render() {
        return (
            <Hello />
        )
    }
}


export function draw(root) {
    return new Promise(ok => render(createElement(RootScreen), root, ok))
}
