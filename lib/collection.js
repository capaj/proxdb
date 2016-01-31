const levelPromise = require('./sublevel-promise')
const debug = require('debug')('collection')
const mobservable = require('mobservable')

module.exports = function collection (name, schema) {
  const sub = levelPromise(this.sublevel(name))
  const arr = []
  const ids = new Set()
  const obsArray = mobservable.fastArray(arr)
  obsArray.oplog = []
  function subscribeToChanges () {
    obsArray.disposer = mobservable.observe(obsArray, (change) => {
      if (change.addedCount === 1) {
        const doc = obsArray[change.index]
        debug('put', doc.id)
        sub.put(doc.id, doc).then(() => {
          debug(`put doc ${doc.id} successfull`)
        })
      } else {
        change.removed.forEach((doc) => {
          debug('del', doc)
          debug('del', doc.id)
          sub.del(doc.id).then(() => {
            debug(`del doc ${doc.id} successfull`)
          })
        })
      }
    })
  }
  subscribeToChanges()

  function stealthMode (cb) {
    obsArray.disposer()
    cb()
    subscribeToChanges()
  }

  obsArray.initPromise = new Promise((resolve, reject) => {
    const stream = sub.createReadStream()
    stream.on('data', (doc) => {
      stealthMode(() => {
        debug(`collection initialized`, doc.value)
        obsArray.push(mobservable.observable(doc.value))
      })
    })
    stream.on('error', reject)
    stream.on('end', function () {
      resolve()
      debug(`collection ${name} stream ended`)
    })
  })

  function prepareByTheSchema () {
    
  }

  var cstr = function (data) {

    obsArray.push()
  }
  cstr.name = name
  return cstr
}
