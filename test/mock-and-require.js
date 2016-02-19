const mockery = require('mockery')
const mockAndRequire = (mocks, reqPath) => {
  mockery.enable({ useCleanCache: true, warnOnUnregistered: false })
  Object.keys(mocks).forEach((pathToMock) => {
    mockery.registerMock(pathToMock, mocks[pathToMock])
  })
  return require(reqPath)
}
mockAndRequire.disable = mockery.disable

module.exports = mockAndRequire
