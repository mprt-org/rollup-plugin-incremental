declare module '*.module.css' {
    const cont: { [key: string]: string }
    export default cont
}

declare module '*.png' {
    const path: string
    export default path
}
