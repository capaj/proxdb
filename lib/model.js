'use strict'

const debug = require('debug')('proxdb')
const proxevable = require('proxevable')
const Weakee = require('./weakee')
const _ = require('lodash')
const backingStore = require('./backing-store')
const joi = require('joi')
const constructors = new Map()
const constructorsWithClosedStreams = []
const crypto = require('crypto')
const traverse = require('traverse')
const collections = new Map()
const disposers = new WeakMap()
const constructorsMap = new WeakMap()
let restoringMode = false
const resolvingDocs = new Map() // holds callbacks to be called when

function collection (name, schema) {
  const sub = backingStore.sublevel(name)
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

  const Cstr = function (data, typeChecks = true) {
    if (typeChecks) {
      Cstr.typeChecks(data)
    }

    const observable = proxevable.observable(data)

    constructorsMap.set(observable, Cstr)
    if (!data.id) {
      const shasum = crypto.createHash('sha1')
      shasum.update(JSON.stringify(data))
      const now = new Date().toISOString()
      const sha = shasum.digest('hex').substr(0, 20)
      const id = now.replace(/-/g, '').replace(/:/g, '') + sha
      observable.id = id
      debug(`a new id generated: ${id}`)
    }

    if (typeChecks) {
      joi.assert(observable, schema)
    }

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
  const refProms = []
  constructors.set(name, Cstr)
  const getAllRefsSync = (doc) => {
    refs.forEach((ref) => {
      const con = constructors.get(ref.ref)
      if (!con) {
        throw new Error('reference to nonexistent schema')
      }
      let populated
      const val = _.get(doc, ref.path)
      if (Array.isArray(val)) {
        populated = proxevable.observable([])
        val.forEach((id) => {
          return populated.push(con(resolvingDocs.get(id), false))
        })
        debug('sync populated instances', populated.id)
      } else {
        debug('id', val)
        populated = con(resolvingDocs.get(val), false)
        debug('sync populated instance', populated.id)
      }
      _.set(doc, ref.path, populated)
      debug('sync populated on path: ', ref.path)
    })
  }

  const getAllRefs = (doc) => {
    debug('getting refs for', doc)

    const thisDocRefs = refs.map((ref) => {
      const con = constructors.get(ref.ref)
      if (!con) {
        throw new Error('reference to nonexistent schema')
      }
      const pr = con.initPromise.then(() => {
        if (!Cstr._resolve) {
          return
        }
        let populated
        const val = _.get(doc, ref.path)
        if (Array.isArray(val)) {
          populated = proxevable.observable([])
          val.forEach((id) => {
            const ref = con.map.get(id)
            if (!ref) {
              throw new Error(`Failed to populate a ref ${id}, DB corrupted`)
            }
            return populated.push(ref)
          })
          debug('populated instances', populated)
        } else {
          populated = con.map.get(val)
          if (!populated) {
            throw new Error(`Failed to populate a ref ${val}, DB corrupted`)
          }
          debug('populated instance', populated.id)
        }
        _.set(doc, ref.path, populated)
        debug('populated on path: ', ref.path)
      })
      return pr
    })

    if (doc.id === '20160218T231100.687Z61b763a149d4f5e96a82') {
      debug('thisDocRefsaaa', thisDocRefs)
    }
    const docPromise = Promise.all(thisDocRefs).then(() => {
      return doc
    })
    refProms.push(docPromise)
    return docPromise
  }

  Cstr.emitter = new Weakee()
  Cstr.initPromise = new Promise((resolve, reject) => {
    Cstr._resolve = () => {
      delete Cstr._resolve
      resolve()
    }
    debug('creating createReadStream for ', name)
    const stream = sub.createReadStream()
    stream.on('data', (record) => {
      record.value.id = record.key
      resolvingDocs.set(record.key, record.value)
      getAllRefs(record.value).then((docWithRefs) => {
        debug(`${name} revived all refs for`, docWithRefs)
        restoringMode = true
        Cstr(docWithRefs)
        resolvingDocs.delete(record.key)
        restoringMode = false
      }).catch((e) => {
        resolvingDocs.delete(record.key)
        reject(e)
      })
    }).on('close', function () {
      constructorsWithClosedStreams.push(name)
      if (constructors.size === constructorsWithClosedStreams.length) {
        debug('all constructors closed streams')
        restoringMode = true
        resolvingDocs.forEach(getAllRefsSync)
        resolvingDocs.forEach(Cstr.typeChecks)
        resolvingDocs.forEach(Cstr.assert)
        restoringMode = false
        constructors.forEach((c) => {
          if (c._resolve) { // if this constructor is not yet resolved,
            c._resolve()  // resolve it
            debug(`cstr ${c.name} resolved synchronously`)
          }
        })
      } else {
        Promise.all(refProms).then(Cstr._resolve, reject)
      }
      debug(`collection ${name} stream closed`)
    }).on('error', reject)
  })
  Cstr.all = () => Array.from(obsMap.values())
  Cstr.assert = (data) => {
    joi.assert(data, schema)
  }
  Cstr.typeChecks = (data) => {
    refs.forEach((ref) => {
      const val = _.get(data, ref.path)
      const schemaOnPath = _.get(schema, ref.path)
      const schemaCons = schemaOnPath._proxDbRefTo
      if (val) {
        const checkSingle = (v) => {
          const valueCons = constructorsMap.get(v)
          if (v.id && valueCons !== constructors[schemaCons]) {
            throw new Error(`Type ${valueCons.name} cannot be in a field ${ref.path} where a type must be ${schemaCons}`)
          }
        }
        if (Array.isArray(val)) {
          val.forEach(checkSingle)
        } else {
          checkSingle(val)
        }
      }
    })
  }
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
