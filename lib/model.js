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
        const val = _.get(doc, this.path)
        if (val.id && _.get(schema, this.path)._nmDbRefTo) {
          return val.id
        }
        return val
      }
    })
    sub.put(doc.id, toBeSaved).then(() => {
      debug(`put ${name} ${doc.id} successfull`)
    })
  }

  function subscribeToChanges () {
    obsMap.disposer = obsMap.observe((change) => {
      if (change.type === 'add') {
        const doc = obsMap.get(change.name)
        putDoc(doc)
      } else if (change.type === 'delete') {
        const id = change.name
        sub.del(id).then(() => {
          debug(`del ${name} ${id} successfull`)
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
      const id = toBeObserved.id
      debug(`${name} ${id} change `, change)
      if (change.type === 'preupdate') {
        if (change.newValue !== change.oldValue) {
          const coerced = joi.attempt(change.newValue, schema[change.name])
          if (coerced !== change.newValue) {
            throw new TypeError(`Expected ${schema[change.name]._type} but assigned ${joi.compile(change.newValue)._type} on property ${change.name} on object ${id}`)
          }
        }
      } else {
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
        getAllRefs(doc.value).then((docWithRefs) => {
          debug(`${name} revived from backing store `, docWithRefs)
          Cstr(docWithRefs)
        })
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
