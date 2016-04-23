'use strict'
import test from 'ava'
import mobxdb from '../index'
import backingStore from '../mocks/backing-store-mock'

const debug = require('debug')('mobxdb:spec')
const {joi} = mobxdb

debug('provide fake store')
mobxdb.backingStore.provide((name) => {
  return backingStore
})
const Author = mobxdb.model('author', {
  name: joi.string().required(),
  birth: joi.number()
})

let Book = mobxdb.model('book', {
  author: mobxdb.ref('author'),
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

  // backingStore.stored.push({
  //   key: '20160218T231100.687Z61b763a149d4f5e96a82', value: {
  //     author: clarke.id,
  //     name: '2001: A space Oddysey'
  //   }
  // })
  // debug('bs', backingStore)
  return Book.initPromise.then(() => {
    t.true(Book.all()[0].author === clarke)
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

  const Bookstore = mobxdb.model('bookstore', {
    books: mobxdb.arrayOfRefs('book'),
    address: joi.string().required()
  })

  return Bookstore.initPromise.then(() => {
    const bs = Bookstore.all()[0]
    t.true(bs.books[0] === odyssey)
    t.true(bs.books[1] === rama)
    backingStore.stored = []
  })
})

test.skip('references are typechecked', (t) => {
  const BadType = mobxdb.model('wrongtype', {
    name: joi.string().required(),
    birth: joi.number()
  })

  const notAuthor = new BadType({
    name: 'test',
    birth: 1
  })

  t.throws(() => {
    const book = new Book({author: notAuthor, name: '2001: A space Oddysey'})
    ident(book)
  })
})

test.todo('required refence throws with null')
