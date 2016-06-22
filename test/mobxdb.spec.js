import test from 'ava'
import nmDb from '../index'

test('should define a ref() type', (t) => {
  const ts = {
    prop: nmDb.ref('some_schema')
  }
  t.is(ts.prop.isJoi, true)
  t.is(ts.prop._type, 'object')
  t.is(ts.prop._proxDbRefTo, 'some_schema')
})

test('ref() type and allow(null)', (t) => {
  const ts = {
    prop: nmDb.ref('some_schema').allow(null)
  }
  t.is(ts.prop.isJoi, true)
  t.is(ts.prop._type, 'object')
  t.is(ts.prop._proxDbRefTo, 'some_schema')  // reference must be there
})

test('defines an arrayOfRefs() type', (t) => {
  const ts = {
    prop: nmDb.arrayOfRefs('some_schema')
  }
  t.is(ts.prop.isJoi, true)
  t.is(ts.prop._type, 'array')
  t.is(ts.prop._proxDbRefTo, 'some_schema')
})
