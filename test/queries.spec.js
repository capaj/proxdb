import test from 'ava'
import proxdb from '../index'
import backingStoreMock from '../mocks/backing-store-mock'

proxdb.backingStore.provide((name) => {
  return backingStoreMock()
})
const {joi} = proxdb
let Author = proxdb.model('author', {
  name: joi.string().required(),
  birth: joi.number()
})

let terry
let asimov
let larry
let query
test('query is always up 2 date and can be stopped', (t) => {
  const query = Author.query((ls) => {
    return ls.filter((author) => {
      return author.birth > 1930
    }).value()
  })
  t.is(query.result.length, 0)
  new Author({name: 'A.C.Clarke', birth: 1917})  // eslint-disable-line
  terry = new Author({name: 'Terence David John Pratchett', birth: 1965})
  asimov = new Author({name: 'Asimov', birth: 1949})
  t.is(query.result.length, 2)
  t.is(query.result[0], terry)
  t.is(query.result[1], asimov)
  query.stop()
  larry = new Author({name: 'Larry Niven', birth: 1938})
  t.is(query.result.length, 2)
  t.is(query.result[0], terry)
  t.is(query.result[1], asimov)
})

test.cb('query can be debounced', (t) => {
  t.plan(6)
  query = Author.query((ls) => {
    return ls.filter((author) => {
      return author.birth > 1930
    }).value()
  }, 60)
  t.is(query.result.length, 3)
  terry.remove()
  t.is(query.result.length, 3)
  setTimeout(() => {
    t.is(query.result.length, 2)
    larry.remove()
    t.is(query.result.length, 2)
    setTimeout(() => {
      t.is(query.result.length, 1)
      t.pass()
      t.end()
    }, 101)
  }, 101)
})
