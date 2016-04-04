'use strict'
import test from 'ava'
import nmDb from '../index'
import mobx from 'mobx'
import backingStore from '../mocks/backing-store-mock'

const debug = require('debug')('model.spec')
const {joi} = nmDb
let Author
let calls
let clarke
test('returns contructor and constructor works', (t) => {

  nmDb.backingStore.provide((name) => {
    return backingStore
  })
  Author = nmDb.model('author', {
    name: joi.string().required(),
    birth: joi.number()
  })
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
    "birth": 1965,
    "name": "A.C.Clarke"
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
    "birth": 1917,
    "name": "A.C.Clarke"
  })

})

test('validates any change against the schema and throw if schema validation fails', (t) => {
  try {
    clarke.name = 42
  } catch (err) {
    t.same(err.toString(), 'ValidationError: "value" must be a string')
  }
  //if caught, value should not be set
  t.same(clarke.name, 'A.C.Clarke')
})

test('entities can be removed and doing so removes them from the backup by calling del()', (t) => {
  clarke.remove()
  t.same(backingStore.callLog.del[0].id.match(/Z8b68eaf153c763eb8688/).length, 1)
})

let Book
debug('provide fake store')
nmDb.backingStore.provide((name) => {
  return backingStore
})

test('references are stored by their id only', (t) => {
  Book = nmDb.model('book', {
    author: nmDb.ref('author'),
    name: joi.string().required()
  })

  clarke = new Author({name: 'A.C.Clarke', birth: 1917})
  t.same(clarke.id.match(/Z61b763a149d4f5e96a82/).length, 1)
  const odyssey = new Book({author: clarke, name: '2001: A space Oddysey'})
  t.same(backingStore.callLog.put[5].doc, {
    "author": clarke.id,
    "name": '2001: A space Oddysey'
  })
})

test('populates refs on startup', (t) => {
  const Author = nmDb.model('author', {
    name: joi.string().required(),
    birth: joi.number()
  })
  clarke = new Author({name: 'A.C.Clarke', birth: 1965})
  backingStore.stored.push({
    key: '20160218T231100.687Z61b763a149d4f5e96a82', value: {
      "author": clarke.id,
      "name": '2001: A space Oddysey'
    }
  })
  // debug('bs', backingStore)

  Book = nmDb.model('book', {
    author: nmDb.ref('author'),
    name: joi.string().required()
  })
  return Book.initPromise.then(() => {
    console.log(Book.all()[0])
    t.true(Book.all()[0].author === clarke)
    backingStore.stored = []
  })
})

test('populates array of refs on startup', (t) => {
  clarke = new Author({name: 'A.C.Clarke', birth: 1917})
  const odyssey = new Book({author: clarke, name: '2001: A space Oddysey'})
  const rama = new Book({author: clarke, name: 'Rendezvous with Rama'})
  backingStore.stored.push({
    key: '20160218T231100.687Z61b763a149d4f5e96a82', value: {
      "books": [odyssey.id, rama.id],
      "address": 'clarke road 1'
    }
  })

  const Bookstore = nmDb.model('bookstore', {
    books: nmDb.arrayOfRefs('book'),
    address: joi.string().required()
  })

  return Bookstore.initPromise.then(() => {
    const bs = Bookstore.all()[0]
    console.log('books ', bs.books)
    console.log('books ', typeof bs.books)
    t.true(bs.books[0] === odyssey)
    // expect(bs.books[1] === rama).to.equal(true)
    backingStore.stored = []
  })
})
