'use strict'
import test from 'ava'
import proxdb from '../index'
import backingStoreMock from '../mocks/backing-store-mock'
const backingStore = backingStoreMock()
const debug = require('debug')('proxdb:spec')
const {joi} = proxdb

debug('provide fake store')
proxdb.backingStore.provide((name) => {
  return backingStore
})
const Author = proxdb.model('author', {
  name: joi.string().required(),
  birth: joi.number()
})

let Book = proxdb.model('book', {
  author: proxdb.ref('author').allow(null),
  name: joi.string().required()
})
let clarke
const ident = () => {}
test('references are stored by their id only and are populated on startup', (t) => {
  clarke = new Author({name: 'A.C.Clarke', birth: 1917})
  t.deepEqual(clarke.id.match(/Z61b763a149d4f5e96a82/).length, 1)
  const odyssey = new Book({author: clarke, name: '2001: A space Oddysey'})
  ident(odyssey)
  t.deepEqual(backingStore.callLog.put[1].doc, {
    author: clarke.id,
    name: '2001: A space Oddysey'
  })
  const noBookEver = new Book({author: null, name: 'Holy bible'})

  return Book.initPromise.then(() => {
    t.true(Book.all()[0].author === clarke)
    t.true(Book.all()[1].author === null)
    backingStore.stored = []
  })
})

test('populates array of refs on startup', (t) => {
  const odyssey = new Book({author: clarke, name: '2100: A space Oddysey'})
  const rama = new Book({author: clarke, name: 'Rendezvous with Rama'})

  backingStore.stored.push({
    key: '20160218T231100.687Z61b763a149d4f5e96a82', value: {
      books: [odyssey.id, rama.id],
      address: 'clarke road 1'
    }
  })

  const Bookstore = proxdb.model('bookstore', {
    books: proxdb.arrayOfRefs('book'),
    address: joi.string().required()
  })

  return Bookstore.initPromise.then(() => {
    const bs = Bookstore.all()[0]
    t.true(bs.books[0] === odyssey)
    t.true(bs.books[1] === rama)
    backingStore.stored = []
  })
})

const BadType = proxdb.model('wrongtype', {
  name: joi.string(),
  birth: joi.number()
})

test('references are typechecked', (t) => {
  backingStore.stored = []

  const notAuthor = new BadType({
    name: 'test not author',
    birth: 1
  })

  t.throws(() => {
    const book = new Book({author: notAuthor, name: '2001: A space Oddysey'})
  }, 'Type wrongtype cannot be in a field author where a type must be author')


})

test.cb('array of refs are typechecked', (t) => {

  const badType2 = new BadType({
    name: 'this is just a pretender',
    birth: 1
  })

  backingStore.stored.push({
    key: '20160218T231100.687Z61b763a149d4f5e96a82', value: {
        books: [badType2.id],
        address: 'problematic road 1'
      }
  })
  const Bookstore = proxdb.model('anotherBookstore', {
    books: proxdb.arrayOfRefs('book'),
    address: joi.string().required()
  })


  t.throws(() => {
    const bs = new Bookstore({
      books: [badType2],
      address: 'problematic road 2'
    })
  }, /"author" is required/)

  Bookstore.initPromise.then(() => {
    t.end()
  }, (e) => {
    console.log('e', e)
    t.end()
  })
})

test('required refence throws with null', (t) => {
  backingStore.stored = []

  const BookWithReq = proxdb.model('bookWithReq', {
    author: proxdb.ref('author').required(),
    name: joi.string().required()
  })

  t.throws(() => {
    const odyssey = new BookWithReq({name: '2001: A space Oddysey'})
  }, /"author" is required/)

  t.throws(() => {
    const odyssey = new BookWithReq({name: '2001: A space Oddysey', author: null})
  }, /"author" must be an object/)
})
