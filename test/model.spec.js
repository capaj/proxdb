'use strict'
import test from 'ava'
import proxdb from '../index'
import backingStoreMock from '../mocks/backing-store-mock'

const backingStore = backingStoreMock()
// const debug = require('debug')('proxdb:spec')
const {joi} = proxdb
proxdb.backingStore.provide((name) => {
  return backingStore
})

let Author = proxdb.model('author', {
  name: joi.string().required(),
  birth: joi.number()
})

let clarke
test('returns contructor and constructor works', (t) => {
  t.is(Author.all().length, 0)
  clarke = new Author({name: 'A.C.Clarke', birth: 1965})
  t.deepEqual(clarke.name, 'A.C.Clarke')
  t.deepEqual(clarke.birth, 1965)

  t.truthy(backingStore.callLog.put[0].id.match(/Z8b68eaf153c763eb8688/))
  t.deepEqual(backingStore.callLog.put[0].doc, {
    birth: 1965,
    name: 'A.C.Clarke'
  })
})

test('any change calls put() method', (t) => {
  clarke.birth = 1917 // he was actually born 1917
  t.deepEqual(backingStore.callLog.put[1].doc, {
    birth: 1917,
    name: 'A.C.Clarke'
  })
})

test('revives with the id from levelup', (t) => {
  const id = '20160218T231100.687Z61b763a149d4f5e96a82'
  backingStore.stored = [{
    key: id, value: {
      birth: 1948,
      name: 'George R. R. Martin,'
    }
  }]

  const model = proxdb.model('authorSecond', {
    name: joi.string().required(),
    birth: joi.number()
  })

  return model.initPromise.then(() => {
    t.true(model.all()[0].id === id)
  })
})

test('validates any change against the schema and throw if schema validation fails', (t) => {
  const terry = new Author({name: 'Terence David John Pratchett', birth: 1965})
  try {
    terry.name = 42
  } catch (err) {
    t.regex(err.toString(), /TypeError: Expected string but assigned 42 of type number to property "name" on author/)
    t.is(err.joiError.isJoi, true)
    t.is(err.joiError.name, 'ValidationError')
  }

  try {
    terry.name = null
  } catch (err) {
    t.regex(err.toString(), /TypeError: Expected string but assigned null of type any to property "name" on author/)
    t.is(err.joiError.isJoi, true)
    t.is(err.joiError.name, 'ValidationError')
  }
  // if caught, value should not be set
  t.is(terry.name, 'Terence David John Pratchett')
})

test('entities can be removed and doing so removes them from the backup by calling del()', (t) => {
  clarke.remove()
  t.deepEqual(backingStore.callLog.del[0].id.match(/Z8b68eaf153c763eb8688/).length, 1)
})

test('should save unknown props', (t) => {
  backingStore.callLog.put = []
  const testModel = proxdb.model('testModel', joi.object({
    name: joi.string().required(),
    health: joi.number()
  }).unknown(true))

  new testModel({name: 'Arya', health: 50, c: 10})  // eslint-disable-line
  const {doc} = backingStore.callLog.put[0]
  t.is(doc.name, 'Arya')
  t.is(doc.health, 50)
  t.is(doc.c, 10)
})
