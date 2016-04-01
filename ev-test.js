const debug = require('debug')('model')
const mobx = require('mobx')

const toBeObserved = {
  a: []
}

const _disposer = mobx.observe(toBeObserved, (change) => {
  debug(`change `, change)
})

mobx.observe(toBeObserved.a, (change) => {
  debug(`change a`, change)
})

toBeObserved.a.push(3)
toBeObserved.a = null
