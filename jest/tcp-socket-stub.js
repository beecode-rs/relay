const { EventEmitter } = require('events');

class Socket extends EventEmitter {
  connect() {
    return this;
  }

  destroy() {}

  end() {}

  pause() {
    return this;
  }

  resume() {
    return this;
  }

  setEncoding() {
    return this;
  }

  setKeepAlive() {
    return this;
  }

  setMaxListeners() {
    return this;
  }

  setNoDelay() {
    return this;
  }

  setTimeout() {
    return this;
  }

  write() {
    return true;
  }
}

module.exports = {
  Socket,
  createConnection: () => {
    return new Socket();
  },
  createServer: () => {
    throw new Error('tcp server is unavailable in tests');
  },
};
