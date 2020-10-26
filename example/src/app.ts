import {observable, action, computed} from 'mobx'

export class Store {
    @observable count = 0

    @computed
    get doubleCount() {
        return this.count * 23
    }

    @action
    inc() {
        this.count++
    }
}

const app = new Store()

export default app
