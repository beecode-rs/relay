const unsupportedAgentError = (agentName: string): Error => {
  return new Error(`ssh2 OS-agent support is unavailable on this platform: ${agentName}`)
}

 
export class BaseAgent {}

export class AgentContext extends BaseAgent {
  constructor() {
    super()
    throw unsupportedAgentError('AgentContext')
  }
}

export class AgentProtocol extends BaseAgent {
  constructor() {
    super()
    throw unsupportedAgentError('AgentProtocol')
  }
}

export class CygwinAgent extends BaseAgent {
  constructor() {
    super()
    throw unsupportedAgentError('CygwinAgent')
  }
}

export class OpenSSHAgent extends BaseAgent {
  constructor() {
    super()
    throw unsupportedAgentError('OpenSSHAgent')
  }
}

export class PageantAgent extends BaseAgent {
  constructor() {
    super()
    throw unsupportedAgentError('PageantAgent')
  }
}

export const createAgent = (): never => {
  throw unsupportedAgentError('createAgent')
}

export const isAgent = (value: unknown): boolean => {
  return value instanceof BaseAgent
}
