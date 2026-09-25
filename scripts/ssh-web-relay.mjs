import { connect } from 'node:net'

import { WebSocketServer } from 'ws'

const parseArgs = (argv) => {
  return argv.reduce((args, arg, index) => {
    if (arg.startsWith('--')) {
      args.set(arg.slice(2), argv[index + 1])
    }
    return args
  }, new Map())
}

const parseTargetPort = (value) => {
  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined
  }

  return port
}

const args = parseArgs(process.argv.slice(2))
const listenHost = args.get('host') ?? '127.0.0.1'
const listenPort = parseTargetPort(args.get('port') ?? '4022')

if (listenPort === undefined) {
  console.error('Usage: node ./scripts/ssh-web-relay.mjs [--host <bind-host>] [--port <bind-port>]')
  process.exit(1)
}

const webSocketServer = new WebSocketServer({ host: listenHost, port: listenPort })

webSocketServer.on('connection', (ws, request) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const targetHost = url.searchParams.get('host')
  const targetPort = parseTargetPort(url.searchParams.get('port') ?? '')
  if (!targetHost || !targetPort) {
    ws.close(1008, 'host and port query parameters are required')
    return
  }
  const socket = connect(targetPort, targetHost)
  socket.on('close', () => {
    ws.close(1000)
  })
  socket.on('data', (chunk) => {
    ws.send(chunk)
  })
  socket.on('error', (error) => {
    ws.close(1011, error.message)
  })
  ws.on('close', () => {
    socket.destroy()
  })
  ws.on('message', (data) => {
    socket.write(data)
  })
})

console.log(`ssh web relay listening on ws://${listenHost}:${listenPort}`)
