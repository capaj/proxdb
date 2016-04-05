'use strict'
import test from 'ava'
import nmDb from '../index'
import mobx from 'mobx'
import backingStore from '../mocks/backing-store-mock'

// const debug = require('debug')('mobxdb:spec')
const {joi} = nmDb
nmDb.backingStore.provide((name) => {
  return backingStore
})

let Author = nmDb.model('author', {
  name: joi.string().required(),
  birth: joi.number()
})

let clarke
test('returns contructor and constructor works', (t) => {
  clarke = new Author({name: 'A.C.Clarke', birth: 1965})
  t.same(clarke.name, 'A.C.Clarke')
  t.same(clarke.birth, 1965)
  t.true(mobx.isObservable(clarke, 'name'))
  t.true(mobx.isObservable(clarke, 'birth'))
})

test('save the object upon creation into backing store', (t) => {
  console.log(backingStore.callLog)
  t.ok(backingStore.callLog.put[0].id.match(/Z8b68eaf153c763eb8688/))
  t.same(backingStore.callLog.put[0].doc, {
    birth: 1965,
    name: 'A.C.Clarke'
  })
})

test('object can be extended with any property except _disposer or _sublevel', (t) => {
  clarke.notObservedProp = 'test'
  t.same(mobx.isObservable(clarke, 'notObservedProp'), false)
  t.throws(() => {
    clarke._disposer = null
  })
  t.throws(() => {
    clarke._sublevel = null
  })
})

test('any change calls put() method', (t) => {
  clarke.birth = 1917 // he was actually born 1917
  t.same(backingStore.callLog.put[2].doc, {
    birth: 1917,
    name: 'A.C.Clarke'
  })
})

test('validates any change against the schema and throw if schema validation fails', (t) => {
  try {
    clarke.name = 42
  } catch (err) {
    t.same(err.toString(), 'ValidationError: "value" must be a string')
  }
  // if caught, value should not be set
  t.same(clarke.name, 'A.C.Clarke')
})

test('entities can be removed and doing so removes them from the backup by calling del()', (t) => {
  clarke.remove()
  t.same(backingStore.callLog.del[0].id.match(/Z8b68eaf153c763eb8688/).length, 1)
})
