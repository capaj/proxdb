import test from 'ava'
import getRefPaths from '../../lib/get-ref-paths-for-schema'
import proxdb from '../../index'
const {joi} = proxdb

test((t) => {
  let schema = {
    author: proxdb.ref('author'),
    name: joi.string().required()
  }

  t.deepEqual(getRefPaths(schema), {author: 'author'})
})
