/* @refresh reload */
import { render } from 'solid-js/web'
import { App } from './App.js'
import './index.css'

const root = document.getElementById('app')
if (root) {
  render(() => <App />, root)
}
