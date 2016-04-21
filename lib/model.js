'use strict'

const debug = require('debug')('proxevabledb')
const proxevable = require('proxevable')
const joiToNulled = require('./joi-to-nulled')
const _ = require('lodash')
const backingStore = require('./backing-store')
const joi = require('joi')
const constructors = require('./constructors')
const crypto = require('crypto')
const traverse = require('traverse')
const collections = new Map()
var restoringMode = false

function privateProperty (obj, name, val) {
  Object.defineProperty(obj, name, {
    value: val,
    writable: false,
    enumerable: false,
    configurable: false
  })
}

function collection (name, schema) {
  debug(name)
  const sub = backingStore.sublevel(name)
  schema.id = joi.string().length(40).required()
  const obsMap = new Map()
  obsMap.oplog = []
  collections.set(name, obsMap)
  function putDoc (doc) {
    const toBeSaved = traverse(doc).map(function (val) {
      if (val.id && _.get(schema, this.path)._proxevabledbRefTo) {
        return val.id
      }
      return val
    })
    sub.put(doc.id, toBeSaved).then(() => {
      debug(`put ${name} ${doc.id} successfull`)
    })
  }

  const Cstr = function (data) {
    const observable = proxevable.observable(data)
    if (!data.id) {
      const shasum = crypto.createHash('sha1')
      shasum.update(JSON.stringify(data))
      observable.id = (
        new Date().toISOString()).replace(/-/g, '').replace(/\:/g, '') +
        shasum.digest('hex').substr(0, 20)
    }
    console.log('observable', observable)
    joi.assert(observable, schema)

    Object.setPrototypeOf(observable, Cstr.prototype)

    const disposer = proxevable.observe(observable, (change) => {
      const id = observable.id
      debug(`${name} ${id} change `, change)
      putDoc(observable)
    })
    const disposerPre = proxevable.preObserve(observable, (change) => {
      const coerced = joi.attempt(change.newValue, schema[change.name])
      if (coerced !== change.newValue) {
        throw new TypeError(`Expected ${schema[change.name]._type} but assigned ${joi.compile(change.newValue)._type} on property ${change.name} on object ${observable.id}`)
      }
    })

    privateProperty(observable, '_disposer', disposer)
    privateProperty(observable, '_disposerPre', disposerPre)

    obsMap.set(observable.id, observable)
    const docSub = backingStore.sublevel(name + '@' + observable.id)
    privateProperty(observable, '_sublevel', docSub)
    docSub.put(new Date() * 1, {name: 'create', data})
    debug(`created new ${name} with id ${observable.id}`)
    return observable
  }
  Object.defineProperty(Cstr, 'name', {value: name})

  Cstr.initPromise = new Promise((resolve, reject) => {
    const refProms = []
    const getAllRefs = (doc) => {
      const thisDocRefs = []
      // debug('doc', doc)
      traverse(doc).forEach(function (val) {
        const path = this.path.join('.')
        debug('check path ', path)
        const schemaForPath = _.get(schema, path)
        if (!path || !schemaForPath) {
          return
        }
        if (schemaForPath.isJoi && schemaForPath._proxevabledbRefTo) {
          debug('found ref on path ', path)
          const con = constructors[schemaForPath._proxevabledbRefTo]
          if (!con) {
            throw new Error('reference to nonexistent schema')
          }

          thisDocRefs.push(con.initPromise.then(() => {
            let populated
            if (Array.isArray(val)) {
              populated = proxevable.observable(proxevable.asFlat([]))
              val.forEach((id) => {
                return populated.push(con.getById(id))
              })
              debug('populated instances', populated)
            } else {
              populated = con.getById(val)
              debug('populated instance', populated.id)
            }
            _.set(doc, path, populated)
            debug('populated on path: ', path)
          }))
        }
      })
      const docPromise = Promise.all(thisDocRefs).then(() => {
        return doc
      })
      refProms.push(docPromise)
      return docPromise
    }
    debug('creating createReadStream for ', name)
    const stream = sub.createReadStream()
    stream.on('data', (doc) => {
      getAllRefs(doc.value).then((docWithRefs) => {
        debug(`${name} revived from backing store `, docWithRefs)
        restoringMode = true
        Cstr(docWithRefs)
        restoringMode = false
      })
    })
    stream.on('error', reject)
    stream.on('end', function () {
      console.log(refProms)
      Promise.all(refProms).then(resolve, reject)
      debug(`collection ${name} stream ended`)
    })
  })
  Cstr.all = () => obsMap.values()
  Cstr.getById = (id) => obsMap.get(id)
  Cstr.prototype = {
    remove: function () {
      this._disposer()
      this._disposerPre()
      obsMap.delete(this.id)
      const id = this.id
      sub.del(id).then(() => {
        debug(`del ${name} ${id} successfull`)
      })
    }
  }
  constructors[name] = Cstr
  return Cstr
}

module.exports = collection

collection.all = collections
