const bluebird = require('bluebird')

module.exports = (sublevel) => {
  ;['put', 'get', 'del', 'batch'].forEach((method) => {
    sublevel[method] = bluebird.promisify(sublevel[method])
  })
  return sublevel
}
