const unsupportedHttpAgentError = (agentName: string): Error => {
  return new Error(`ssh2 HTTP(S) tunnel agents are unavailable on this platform: ${agentName}`)
}

 
export class SSHTTPAgent {
  constructor() {
    throw unsupportedHttpAgentError('SSHTTPAgent')
  }
}

 
export class SSHTTPSAgent {
  constructor() {
    throw unsupportedHttpAgentError('SSHTTPSAgent')
  }
}
