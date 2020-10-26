import React from 'react'
import {observer} from 'mobx-react'

import app from '../../app'

import Button from '../../components/Button/index'

import logo from '../../assets/logo.png'

import S from './styles.module.css'

@observer
export default class Hello extends React.Component {
    render() {
        return <>
            <img src={logo} width={100} height={100} />
            <div className={S.hello}>Hello! <span>{app.count}</span> {app.doubleCount}</div>
            <Button/>
        </>
    }
}
