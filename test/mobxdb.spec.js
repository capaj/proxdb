import test from 'ava'
import nmDb from '../index'

test('should define a ref() type', (t) => {
  const ts = {
    prop: nmDb.ref('some_schema')
  }
  t.same(ts.prop.isJoi, true)
  t.same(ts.prop._type, 'object')
  t.same(ts.prop._mobxdbRefTo, 'some_schema')
})

test('defines an arrayOfRefs() type', (t) => {
  const ts = {
    prop: nmDb.ref('some_schema')
  }
  t.same(ts.prop.isJoi, true)
  t.same(ts.prop._type, 'object')
  t.same(ts.prop._mobxdbRefTo, 'some_schema')
})
