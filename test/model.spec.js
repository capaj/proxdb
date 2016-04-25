'use strict'
import test from 'ava'
import proxdb from '../index'
import backingStore from '../mocks/backing-store-mock'

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

test('validates any change against the schema and throw if schema validation fails', (t) => {
  try {
    clarke.name = 42
  } catch (err) {
    t.deepEqual(err.toString(), 'ValidationError: "value" must be a string')
  }
  // if caught, value should not be set
  t.truthy(clarke.name === 'A.C.Clarke')
})

test('entities can be removed and doing so removes them from the backup by calling del()', (t) => {
  clarke.remove()
  t.deepEqual(backingStore.callLog.del[0].id.match(/Z8b68eaf153c763eb8688/).length, 1)
})
