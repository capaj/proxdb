'use strict'

const debug = require('debug')('collection')
const mobservable = require('mobservable')
const joiToNulled = require('./joi-to-nulled')
const _ = require('lodash')
const sublevel = require('./sublevel-init')
const joi = require('joi')

const crypto = require('crypto')

module.exports = function collection (name, schema) {
  const sub = sublevel(name)
  const idMap = new Map()
  schema.id = joi.string().length(40).required()
  const obsArray = mobservable.fastArray([])
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
  const nulledObj = joiToNulled(schema)
  const Cstr = function (data) {
    let toBeObserved = _.cloneDeep(nulledObj)
    toBeObserved = _.merge(toBeObserved, data)
    if (!data.id) {
      const shasum = crypto.createHash('sha1')
      shasum.update(JSON.stringify(data))
      toBeObserved.id = shasum.digest('hex')
    }
    joi.assert(toBeObserved, schema)
    toBeObserved = mobservable.observable(toBeObserved)

    toBeObserved._disposer = mobservable.observe(toBeObserved, (change) => {
      const nV = change.object[change.name]
      if (nV !== change.oldValue) {
        const coerced = joi.attempt(nV, schema[change.name])
        const id = toBeObserved.id
        if (coerced !== nV) {
          throw new TypeError(`Expected ${schema[change.name]._type} but assigned ${joi.compile(nV)._type} on property ${change.name} on object ${id}`)
        }
        debug(`${name} ${id} change `, change, nV)
        sub.put(id, toBeObserved).then(() => {
          debug(`put doc ${id} successfull`)
        })
      }
    })
    idMap.set(toBeObserved.id, toBeObserved)
    obsArray.push(toBeObserved)
    debug(`created new ${name} with id ${toBeObserved.id}`)
    return toBeObserved
  }
  Object.defineProperty(Cstr, 'name', {value: name})

  Cstr.initPromise = new Promise((resolve, reject) => {
    const stream = sub.createReadStream()
    stream.on('data', (doc) => {
      stealthMode(() => {
        debug(`collection initialized`, doc.value)
        Cstr(doc.value)
      })
    })
    stream.on('error', reject)
    stream.on('end', function () {
      resolve()
      debug(`collection ${name} stream ended`)
    })
  })
  Cstr.all = obsArray
  Cstr.getById = (id) => idMap.get(id)
  Cstr.prototype = {
    remove: function () {
      this._disposer()
      idMap.delete(this.id)
      obsArray.splice(obsArray.indexOf(this), 1)
    }
  }

  return Cstr
}
