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
  const nulledObj = joiToNulled(schema)
  schema.id = joi.string().length(40).required()
  const obsMap = mobservable.map()
  obsMap.oplog = []

  function putDoc (doc) {
    const toBeSaved = traverse(_.cloneDeep(nulledObj)).map(function (node) {
      if (node === null) {
        return _.get(doc, this.path)
      }
    })
    sub.put(doc.id, toBeSaved).then(() => {
      debug(`put doc ${doc.id} successfull`)
    })
  }

  function subscribeToChanges () {
    obsMap.disposer = obsMap.observe((change) => {
      if (change.type === 'add') {
        const doc = obsMap.get(change.name)
        putDoc(doc)
      } else if (change.type === 'delete') {
        const id = change.name
        debug('del', id)
        sub.del(id).then(() => {
          debug(`del doc ${id} successfull`)
        })
      }
    })
  }
  subscribeToChanges()

  function stealthMode (cb) {
    obsMap.disposer()
    cb()
    subscribeToChanges()
  }
  const Cstr = function (data) {
    let toBeObserved = _.cloneDeep(nulledObj)
    toBeObserved = _.merge(toBeObserved, data)
    if (!data.id) {
      const shasum = crypto.createHash('sha1')
      shasum.update(JSON.stringify(data))
      toBeObserved.id = (
        new Date().toISOString()).replace(/-/g, '').replace(/\:/g, '') +
        shasum.digest('hex').substr(0, 20)
    }
    joi.assert(toBeObserved, schema)
    mobservable.observable(toBeObserved)
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
        putDoc(toBeObserved)
      }
    })
    obsMap.set(toBeObserved.id, toBeObserved)
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
  Cstr.all = () => obsMap.values()
  Cstr.getById = (id) => obsMap.get(id)
  Cstr.prototype = {
    remove: function () {
      this._disposer()
      obsMap.delete(this.id)
    }
  }
  constructors[name] = Cstr
  return Cstr
}
