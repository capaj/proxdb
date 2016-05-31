'use strict'

const debug = require('debug')('proxdb')
const proxevable = require('proxevable')
const Weakee = require('./weakee')
const _ = require('lodash')
const backingStore = require('./backing-store')
const joi = require('joi')
const constructors = require('./constructors')
const crypto = require('crypto')
const traverse = require('traverse')
const collections = new Map()
const disposers = new WeakMap()
const constructorsMap = new WeakMap()
let restoringMode = false
const toBeResolvedDocs = new Map() //holds callbacks to be called when we load a doc
const docPromises = new Map() // holds promises

function collection (name, schema) {
  const sub = backingStore.sublevel(name)
  const waitingForRefs = new Set()
  schema.id = joi.string().length(40).required()
  const obsMap = new Map()
  const refs = []
  traverse(schema).forEach(function (node) {
    if (node && node._proxDbRefTo) {
      refs.push({path: this.path, ref: node._proxDbRefTo})
    }
  })

  collections.set(name, obsMap)
  function putDoc (doc) {
    const toBeSaved = _.cloneDeep(doc)
    refs.forEach((ref) => {
      const val = _.get(doc, ref.path)
      if (val) {
        _.set(toBeSaved, ref.path, val.id)
      }
    })
    delete toBeSaved.id
    sub.put(doc.id, toBeSaved).then(() => {
      debug(`put ${name} ${doc.id} successfull`)
    })
  }

  const Cstr = function (data) {
    refs.forEach((ref) => {
      const val = _.get(data, ref.path)
      if (val) {
        const schemaOnPath = _.get(schema, ref.path)
        const schemaCons = schemaOnPath._proxDbRefTo
        const valueCons = constructorsMap.get(val)
        if (val.id && valueCons !== constructors[schemaCons]) {
          throw new Error(`Type ${valueCons.name} cannot be in a field ${ref.path} where a type must be ${schemaCons}`)
        }
      }
    })

    const observable = proxevable.observable(data)
    constructorsMap.set(observable, Cstr)
    if (!data.id) {
      const shasum = crypto.createHash('sha1')
      shasum.update(JSON.stringify(data))
      const now = new Date().toISOString()
      const sha = shasum.digest('hex').substr(0, 20)
      const id = now.replace(/-/g, '').replace(/\:/g, '') + sha
      observable.id = id
      debug(`a new id generated: ${id}`)
    }
    joi.assert(observable, schema)

    Object.setPrototypeOf(observable, Cstr.prototype)

    const disposerPre = proxevable.preObserve(observable, (change) => {
      debug('will try to validate: ', change.newValue)
      let coerced
      try {
        coerced = joi.attempt(change.newValue, schema[change.name])
      } catch (err) {
        const validationError = new TypeError(`Expected ${schema[change.name]._type} but assigned ${change.newValue} of type ${joi.compile(change.newValue)._type} to property "${change.name}" on ${name} ${observable.id}`)
        validationError.joiError = err
        throw validationError
      }
      if (coerced !== change.newValue) {
        throw new TypeError(`Expected ${schema[change.name]._type} but assigned ${joi.compile(change.newValue)._type} to property ${change.name} on object ${observable.id}`)
      }
    })

    const disposer = proxevable.observe(observable, (change) => {
      const id = observable.id
      Cstr.emitter.emit('change', change)
      debug(`${name} ${id} change `, change)
      putDoc(observable)
    })

    disposers.set(observable, [disposer, disposerPre])
    if (!restoringMode) {
      putDoc(observable)
    }
    obsMap.set(observable.id, observable)
    Cstr.emitter.emit('create', observable)
    debug(`created new ${name} with id ${observable.id}`)
    return observable
  }
  Object.defineProperty(Cstr, 'name', {value: name})
  const refProms = [] // all promises for all documents in this model

  const getAllRefs = (doc) => {
    const thisDocRefs = []  // promises for this model only
    debug('getting refs for', doc)
    refs.forEach((ref) => {
      const con = constructors[ref.ref]
      if (!con) {
        throw new Error('reference to nonexistent schema')
      }
      const val = _.get(doc, ref.path)
      debug('path', ref.path, val)
      if (Array.isArray(val)) {
        id.forEach((id, i) => {
          thisDocRefs.push(con.resolveDoc(id).then((resolvedDoc) => {
            val[i] = resolvedDoc
          }))
        })
      } else {
        thisDocRefs.push(con.resolveDoc(val).then((resolvedDoc) => {
          _.set(doc, ref.path, resolvedDoc)
        }))
      }
    })

    const docPromise = Promise.all(thisDocRefs).then(() => {
      debug(`populated doc ${doc.id}`)
      return doc
    })
    refProms.push(docPromise)
    return docPromise
  }

  Cstr.emitter = new Weakee()
  Cstr.initPromise = new Promise((resolve, reject) => {
    debug('creating createReadStream for ', name)
    const stream = sub.createReadStream()
    stream.on('data', (record) => {
      const {key} = record
      waitingForRefs.add(key)
      getAllRefs(record.value).then((docWithRefs) => {
        waitingForRefs.delete(key)
        docWithRefs.id = key
        debug(`${name} revived from backing store `, docWithRefs)
        restoringMode = true
        Cstr(docWithRefs)
        restoringMode = false
      })
    }).on('close', function () {
      Promise.all(refProms).then(resolve, reject)
      debug(`collection ${name} stream closed`)
    }).on('error', reject)
  })
  Cstr.all = () => Array.from(obsMap.values())
  Cstr.query = (fn, debounceTimeout) => {
    const query = new Weakee()
    if (debounceTimeout) {
      query.run = _.debounce(() => {
        query.prevResult = query.result
        query.result = fn(_(Cstr.all()))
        query.emit('ran')
      }, debounceTimeout)
      query.result = fn(_(Cstr.all()))
    } else {
      query.run = () => {
        query.prevResult = query.result
        query.result = fn(_(Cstr.all()))
        query.emit('ran')
      }
      query.run()
    }

    query.query = fn
    Cstr.initPromise.then(query.run)
    Cstr.emitter.on('create', query.run)
    Cstr.emitter.on('remove', query.run)
    Cstr.emitter.on('change', query.run)
    query.stop = () => {
      Cstr.emitter.off('create', query.run)
      Cstr.emitter.off('remove', query.run)
      Cstr.emitter.off('change', query.run)
    }
    return query
  }
  Cstr.map = obsMap
  Cstr.resolveDoc = (id) => {
    const doc = obsMap.get(id)
    debug('resolving', id)
    if (waitingForRefs.has(id)) {
      debug('waiting for refs already', id)
    }
    if (doc) {
      return Promise.resolve(doc)
    } else {
      let prom = docPromises.get(id)
      if (prom) {
        debug('returning exiting prom', id)
        return prom
      }
      prom = new Promise(function (resolve, reject) {
        const res = toBeResolvedDocs.get(id)
        if (res) {
          res.push(getAllRefs)
        } else {
          toBeResolvedDocs.set(id, [getAllRefs])
        }
      })
      return prom
    }
  }
  Cstr.prototype = {
    remove: function () {
      const ds = disposers.get(this)
      ds.forEach((disp) => disp())
      obsMap.delete(this.id)
      Cstr.emitter.emit('remove', this)
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
