/* eslint-env node, mocha */
const nmDb = require('../index')
const expect = require('chai').expect

describe('index methods', function () {
  it('should define a ref() type', function () {
    const ts = {
      prop: nmDb.ref('some_schema')
    }
    expect(ts.prop.isJoi).to.equal(true)
    expect(ts.prop._type).to.equal('object')
    expect(ts.prop._nmDbRefTo).to.equal('some_schema')
  })

  it('should define an arrayOfRefs() type', function () {
    const ts = {
      prop: nmDb.arrayOfRefs('some_schema')
    }
    expect(ts.prop.isJoi).to.equal(true)
    expect(ts.prop._type).to.equal('object')
    expect(ts.prop._nmDbRefTo).to.equal('some_schema')
  })
})

process.on('unhandledRejection', function (err, p) {
  console.warn('Unhandled Rejection')
  console.warn('stack: ', err.stack)
})
