module.exports = simlog

var process = require('process')

function simlog (/* type, resource, data */) {
  // Activate simulator logging by passing -simlog to 'npm start'
  if (!process.env.npm_config_simlog) return

  var log = {
    type: arguments[0],
    resource: arguments[1],
    data: arguments[2]
  }

  // if (Buffer.isBuffer(log.resource)) log.resource = log.resource.toString('hex')

  console.error('SIMLOG', JSON.stringify(log))
}
