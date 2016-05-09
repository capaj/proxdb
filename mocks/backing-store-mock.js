const debug = require('debug')('proxdb')

module.exports = () => {
  const store = {
    callLog: {
      put: [],
      del: []
    },
    put: (id, doc) => {
      store.callLog.put.push({id, doc})
      return Promise.resolve()
    },
    del: (id) => {
      store.callLog.del.push({id})
      return Promise.resolve()
    },
    createReadStream: () => {
      return {
        on: (evName, cb) => {
          debug(evName)
          if (evName === 'data') {
            store.stored.forEach(cb)
          } else if (evName === 'end') {
            setTimeout(cb, 2)
          }
        }
      }
    },
    stored: []
  }
  return store
}
