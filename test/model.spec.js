/* eslint-env node, mocha */
'use strict'
const nmDb = require('../index')
const debug = require('debug')('model.spec')
const joi = nmDb.joi
const expect = require('chai').expect
const backingStore = require('./mocks/backing-store-mock')
const mobservable = require('mobservable')

describe('model', function () {
  let Author
  let calls
  let clarke
  before(function () {
    nmDb.backingStore.provide((name) => {
      return backingStore
    })
  })
  it('should give me a constructor I can use to create entities of joi schema, fields in the schema should become observable', function () {
    Author = nmDb.model('author', {
      name: joi.string().required(),
      birth: joi.number()
    })
    clarke = new Author({name: 'A.C.Clarke', birth: 1965})
    expect(clarke.name).to.equal('A.C.Clarke')
    expect(clarke.birth).to.equal(1965)
    expect(mobservable.isObservable(clarke)).to.equal(true)
    expect(mobservable.isObservable(clarke, 'name')).to.equal(true)
    expect(mobservable.isObservable(clarke, 'birth')).to.equal(true)
  })

  it('should save the object upon creation into backing store', function () {
    expect(backingStore.callLog.put[0].id).to.match(/Z8b68eaf153c763eb8688/)
    expect(backingStore.callLog.put[0].doc).to.eql({
      "birth": 1965,
      "name": "A.C.Clarke"
    })
  })

  it('should allow to put any other properties on the DB objects, but those should not be observable', function () {
    clarke.notObservedProp = 'test'
    expect(mobservable.isObservable(clarke, 'notObservedProp')).to.equal(false)
  })

  it('entites are observables which are saved with "put" on any change', function () {
    clarke.birth = 1917 // he was actually born 1917
    expect(backingStore.callLog.put[1].doc).to.eql({
      "birth": 1917,
      "name": "A.C.Clarke"
    })
  })

  it('should initialize any permanently stored into the map', function () {

  })

  it('should validate any change against the schema and throw if schema validation fails', function () {
    try {
      clarke.name = 42
    } catch (err) {
      expect(err.toString()).to.equal('ValidationError: "value" must be a string')
    }
    //if caught, value should not be set
    expect(clarke.name).to.equal('A.C.Clarke')
  })

  it('entities can be removed and doing so removes them from the backup by calling "del" method', function () {
    clarke.remove()
    expect(backingStore.callLog.del[0].id).to.match(/Z8b68eaf153c763eb8688/)
  })

  describe('references', function () {
    let Book

    before(function () {
      debug('provide fake store')
      nmDb.backingStore.provide((name) => {
        return backingStore
      })
    })

    it('should allow a special "reference type" ref', function () {
      Book = nmDb.model('book', {
        author: nmDb.ref('author'),
        name: joi.string().required()
      })

      clarke = new Author({name: 'A.C.Clarke', birth: 1917})
      expect(clarke.id).to.match(/Z61b763a149d4f5e96a82/)
      const odyssey = new Book({author: clarke, name: '2001: A space Oddysey'})
      expect(backingStore.callLog.put[3].doc).to.eql({
        "author": clarke.id,
        "name": '2001: A space Oddysey'
      })
    })

    it('should get automatically populated by observable instances on startup', function (done) {
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
      Book.initPromise.then(() => {
        console.log(Book.all()[0])
        expect(Book.all()[0].author === clarke).to.equal(true)
        backingStore.stored = []
        done()
      })
    })

    it.skip('should allow for an arrayOfRefs which gets populated by observable instances on startup', function () {
      const Bookstore = nmDb.model('bookstore', {
        books: nmDb.arrayOfRefs('book'),
        address: joi.string().required()
      })
    })

    it('when putting into sublevel, "reference type" values should be saved as simple id strings', function () {

    })
  })


  after(function () {

  })
})
