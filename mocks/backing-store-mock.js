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
      on: (evName) => {

      }
    }
  }
}

module.exports = store
