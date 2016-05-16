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
const joiToNulled = require('./joi-to-nulled')
const collections = new Map()
const disposers = new WeakMap()
const constructorsMap = new WeakMap()
let restoringMode = false

function collection (name, schema) {
  const nulledSchema = joiToNulled(schema)
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
  Cstr.emitter = new Weakee()
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
        if (schemaForPath.isJoi && schemaForPath._proxDbRefTo) {
          debug('found ref on path ', path)
          const con = constructors[schemaForPath._proxDbRefTo]
          if (!con) {
            throw new Error('reference to nonexistent schema')
          }

          thisDocRefs.push(con.initPromise.then(() => {
            let populated
            if (Array.isArray(val)) {
              populated = proxevable.observable([])
              val.forEach((id) => {
                return populated.push(con.map.get(id))
              })
              debug('populated instances', populated)
            } else {
              populated = con.map.get(val)
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
    stream.on('data', (record) => {
      getAllRefs(record.value).then((docWithRefs) => {
        docWithRefs.id = record.key
        debug(`${name} revived from backing store `, docWithRefs)
        restoringMode = true
        Cstr(docWithRefs)
        restoringMode = false
      })
    })
    stream.on('error', reject)
    stream.on('end', () => {
      Promise.all(refProms).then(resolve, reject)
      debug(`collection ${name} stream ended`)
    })
  })
  Cstr.all = () => Array.from(obsMap.values())
  Cstr.query = (fn, debounceTimeout) => {
    const query = new Weakee()
    if (debounceTimeout) {
      query.run = _.debounce(() => {
        query.result = fn(_(Cstr.all()))
        query.emit('ran')
      }, debounceTimeout)
      query.result = fn(_(Cstr.all()))
    } else {
      query.run = () => {
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
