'use strict'

const debug = require('debug')('collection')
const mobservable = require('mobservable')
const joiToNulled = require('./joi-to-nulled')
const _ = require('lodash')
const backingStore = require('./backing-store')
const joi = require('joi')
const constructors = require('./constructors')
const crypto = require('crypto')
const traverse = require('traverse')

module.exports = function collection (name, schema) {
  const sub = backingStore.sublevel(name)
  const idMap = new Map()
  const nulledObj = joiToNulled(schema)
  schema.id = joi.string().length(40).required()
  const obsArray = mobservable.fastArray([])
  obsArray.oplog = []

  function subscribeToChanges () {
    obsArray.disposer = mobservable.observe(obsArray, (change) => {
      if (change.addedCount === 1) {
        const doc = obsArray[change.index]
        debug('put', doc.id)
        doc.save()
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
    Object.setPrototypeOf(toBeObserved, Cstr.prototype)

    toBeObserved._disposer = mobservable.observe(toBeObserved, (change) => {
      const nV = change.object[change.name]
      if (nV !== change.oldValue) {
        const coerced = joi.attempt(nV, schema[change.name])
        const id = toBeObserved.id
        if (coerced !== nV) {
          throw new TypeError(`Expected ${schema[change.name]._type} but assigned ${joi.compile(nV)._type} on property ${change.name} on object ${id}`)
        }
        debug(`${name} ${id} change `, change, nV)
        toBeObserved.save()
      }
    })
    idMap.set(toBeObserved.id, toBeObserved)
    obsArray.push(toBeObserved)
    debug(`created new ${name} with id ${toBeObserved.id}`)
    return toBeObserved
  }
  Object.defineProperty(Cstr, 'name', {value: name})

  Cstr.initPromise = new Promise((resolve, reject) => {
    const refProms = []
    const getAllRefs = (doc) => {
      // if we have a ref to nonexistent collection, just throw an error
    }
    const stream = sub.createReadStream()
    stream.on('data', (doc) => {
      stealthMode(() => {
        getAllRefs(doc.value)
        Cstr(doc.value)
        debug(`${name} revived from backing store `, doc.value)
      })
    })
    stream.on('error', reject)
    stream.on('end', function () {
      Promise.all(refProms).then(resolve)
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
    },
    save: function () {
      const self = this
      const toBeSaved = traverse(_.cloneDeep(nulledObj)).map(function (node) {
        if (node === null) {
          return _.get(self, this.path)
        }
      })
      sub.put(this.id, toBeSaved).then(() => {
        debug(`put doc ${this.id} successfull`)
      })
    }
  }
  constructors[name] = Cstr
  return Cstr
}
