import React from 'react'
import {observer} from 'mobx-react'

import app from '../../app'

import S from './styles.module.css'

@observer
export default class Button extends React.Component {
    render() {
        return <>
            <button className={S.hello2} onClick={() => app.inc()}>Increment</button>
        </>
    }
}
